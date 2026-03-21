#include <vector>
#include <cmath>
#include <iostream>
#include <algorithm>
#include <omp.h>
#include <chrono>

extern "C" {

    struct Point {
        double x, y;
    };

    struct TSPState {
        std::vector<Point> points;
        std::vector<int> tour;
        std::vector<int> pos; 
        double current_dist;
        int n;
        int last_i; 
        int phase; 
        
        // Spatial Grid
        double x_min, y_min, cell_size;
        int cols, rows;
        std::vector<int> grid_heads;
        std::vector<int> grid_next;
    };

    inline double get_dist(const Point& p1, const Point& p2) {
        double dx = p1.x - p2.x;
        double dy = p1.y - p2.y;
        return std::sqrt(dx*dx + dy*dy);
    }

    // Robust CCW intersection test
    bool segments_intersect(const Point& a, const Point& b, const Point& c, const Point& d) {
        auto ccw = [](const Point& A, const Point& B, const Point& C) {
            double area = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
            if (std::abs(area) < 1e-9) return 0;
            return (area > 0) ? 1 : -1;
        };
        return ccw(a, c, d) != ccw(b, c, d) && ccw(a, b, c) != ccw(a, b, d);
    }

    void build_grid(TSPState* state) {
        if (state->n == 0) return;
        state->x_min = state->points[0].x;
        state->y_min = state->points[0].y;
        double x_max = state->x_min;
        double y_max = state->y_min;
        for (const auto& p : state->points) {
            state->x_min = std::min(state->x_min, p.x);
            state->y_min = std::min(state->y_min, p.y);
            x_max = std::max(x_max, p.x);
            y_max = std::max(y_max, p.y);
        }
        double width = x_max - state->x_min + 1.0;
        double height = y_max - state->y_min + 1.0;
        int grid_res = (int)std::sqrt(state->n);
        state->cell_size = std::max(width, height) / std::max(1, grid_res);
        state->cols = (int)(width / state->cell_size) + 1;
        state->rows = (int)(height / state->cell_size) + 1;
        state->grid_heads.assign(state->cols * state->rows, -1);
        state->grid_next.assign(state->n, -1);
        for (int i = 0; i < state->n; ++i) {
            int c = (int)((state->points[i].x - state->x_min) / state->cell_size);
            int r = (int)((state->points[i].y - state->y_min) / state->cell_size);
            c = std::max(0, std::min(state->cols - 1, c));
            r = std::max(0, std::min(state->rows - 1, r));
            state->grid_next[i] = state->grid_heads[r * state->cols + c];
            state->grid_heads[r * state->cols + c] = i;
        }
    }

    void update_pos(TSPState* state) {
        for (int i = 0; i < state->n; ++i) {
            state->pos[state->tour[i]] = i;
        }
    }

    double calculate_tour_distance(TSPState* state) {
        double dist = 0.0;
        int n = state->n;
        if (n < 2) return 0.0;
        for (int i = 0; i < n - 1; ++i) {
            dist += get_dist(state->points[state->tour[i]], state->points[state->tour[i+1]]);
        }
        dist += get_dist(state->points[state->tour[n-1]], state->points[state->tour[0]]);
        state->current_dist = dist;
        return dist;
    }

    void* init_tsp(const Point* points, int num_points) {
        TSPState* state = new TSPState();
        state->n = num_points;
        state->points.assign(points, points + num_points);
        state->tour.resize(num_points);
        state->pos.resize(num_points);
        for(int i=0; i<num_points; ++i) state->tour[i] = i;
        state->current_dist = 0.0;
        state->last_i = 0;
        state->phase = 0; 
        build_grid(state);
        update_pos(state);
        calculate_tour_distance(state);
        return state;
    }

    void set_tour(void* state_ptr, const int* tour, double current_dist) {
        TSPState* state = (TSPState*)state_ptr;
        state->tour.assign(tour, tour + state->n);
        state->current_dist = current_dist;
        state->last_i = 0;
        state->phase = 0;
        update_pos(state);
        calculate_tour_distance(state);
    }

    void get_tour(void* state_ptr, int* out_tour) {
        TSPState* state = (TSPState*)state_ptr;
        std::copy(state->tour.begin(), state->tour.end(), out_tour);
    }

    // Correctly reverses segment [i+1, j] wrap-around aware
    void reverse_segment(std::vector<int>& tour, std::vector<int>& pos, int i, int j, int n) {
        int l = (i + 1) % n;
        int r = j;
        int num = (r - l + n) % n;
        for (int k = 0; k <= num / 2; ++k) {
            int a = (l + k) % n;
            int b = (r - k + n) % n;
            std::swap(tour[a], tour[b]);
            pos[tour[a]] = a;
            pos[tour[b]] = b;
        }
    }

    double optimize_tour(void* state_ptr, int timeout_ms, int breadth_pct, int* out_swaps, int* out_last_i, int* is_cancelled) {
        TSPState* state = (TSPState*)state_ptr;
        int n = state->n;
        int total_swaps = 0;
        const auto& points = state->points;
        auto& tour = state->tour;

        auto start_time = std::chrono::steady_clock::now();
        bool timeout_reached = false;
        bool done = false;

        int search_radius = std::max(1, (int)(std::sqrt(state->cols * state->rows) * (breadth_pct / 100.0)));

        while (!timeout_reached && !done) {
            if (is_cancelled && *is_cancelled) break;

            bool improvement_found = false;
            int best_i = -1, best_j = -1;
            double best_gain = 1e-6;

            #pragma omp parallel
            {
                int local_best_i = -1, local_best_j = -1;
                double local_best_gain = 1e-6;

                #pragma omp for schedule(dynamic, 64)
                for (int i = 0; i < n; ++i) {
                    if (improvement_found || timeout_reached || (is_cancelled && *is_cancelled)) continue;
                    
                    if (i % 64 == 0) {
                        auto now = std::chrono::steady_clock::now();
                        if (std::chrono::duration_cast<std::chrono::milliseconds>(now - start_time).count() > timeout_ms) {
                            timeout_reached = true;
                        }
                    }
                    if (timeout_reached) continue;

                    int i1 = i;
                    int i2 = (i1 + 1) % n;
                    const Point& p1 = points[tour[i1]];
                    const Point& p2 = points[tour[i2]];
                    double d12 = get_dist(p1, p2);

                    if (state->phase < 2) {
                        // SPATIAL MODES
                        int c_center = (int)((p2.x - state->x_min) / state->cell_size);
                        int r_center = (int)((p2.y - state->y_min) / state->cell_size);
                        for (int r = r_center - search_radius; r <= r_center + search_radius; ++r) {
                            if (r < 0 || r >= state->rows) continue;
                            for (int c = c_center - search_radius; c <= c_center + search_radius; ++c) {
                                if (c < 0 || c >= state->cols) continue;
                                int t3 = state->grid_heads[r * state->cols + c];
                                while (t3 != -1) {
                                    int i3 = state->pos[t3];
                                    int i4 = (i3 + 1) % n;
                                    // Ensure we are comparing two distinct, non-adjacent edges
                                    if (i3 != i1 && i3 != i2 && i4 != i1 && i4 != i2) {
                                        const Point& p3 = points[t3], &p4 = points[tour[i4]];
                                        
                                        // A 2-opt swap removes (i1, i2) and (i3, i4)
                                        // It adds (i1, i3) and (i2, i4)
                                        double d34 = get_dist(p3, p4);
                                        double d13 = get_dist(p1, p3);
                                        double d24 = get_dist(p2, p4);
                                        double gain = (d12 + d34) - (d13 + d24);

                                        bool valid = (gain > local_best_gain);
                                        // Phase 0: Only resolve actual crossovers
                                        if (state->phase == 0 && !segments_intersect(p1, p2, p3, p4)) valid = false;

                                        if (valid) {
                                            local_best_gain = gain; local_best_i = i1; local_best_j = i3;
                                        }
                                    }
                                    t3 = state->grid_next[t3];
                                }
                            }
                        }
                    } else {
                        // GLOBAL FALLBACK
                        for (int j = 0; j < n; ++j) {
                            int i3 = j, i4 = (j + 1) % n;
                            if (i3 == i1 || i3 == i2 || i4 == i1 || i4 == i2) continue;
                            
                            const Point& p3 = points[tour[i3]], &p4 = points[tour[i4]];
                            double gain = (d12 + get_dist(p3, p4)) - (get_dist(p1, p3) + get_dist(p2, p4));
                            
                            if (gain > local_best_gain) {
                                local_best_gain = gain; local_best_i = i1; local_best_j = i3;
                            }
                        }
                    }
                }

                #pragma omp critical
                {
                    if (local_best_gain > best_gain) {
                        best_gain = local_best_gain; best_i = local_best_i; best_j = local_best_j;
                        improvement_found = true;
                    }
                }
            }

            if (improvement_found) {
                reverse_segment(tour, state->pos, best_i, best_j, n);
                total_swaps++;
                state->last_i = best_i; 
            } else if (!timeout_reached) {
                state->phase++;
                state->last_i = 0;
                if (state->phase > 2) done = true; 
            }
        }

        calculate_tour_distance(state);
        *out_swaps = total_swaps;
        *out_last_i = state->last_i + (state->phase * n);
        return state->current_dist;
    }

    void free_tsp(void* state_ptr) {
        TSPState* state = (TSPState*)state_ptr;
        delete state;
    }
}
