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
        double current_dist;
        int n;
        int last_i; // Track where we are in the current full scan
    };

    double get_distance(const Point& p1, const Point& p2) {
        double dx = p1.x - p2.x;
        double dy = p1.y - p2.y;
        return std::sqrt(dx*dx + dy*dy);
    }

    void* init_tsp(const Point* points, int num_points) {
        TSPState* state = new TSPState();
        state->n = num_points;
        state->points.assign(points, points + num_points);
        state->tour.resize(num_points);
        for(int i=0; i<num_points; ++i) {
            state->tour[i] = i;
        }
        state->current_dist = 0.0;
        state->last_i = 0;
        return state;
    }

    void set_tour(void* state_ptr, const int* tour, double current_dist) {
        TSPState* state = (TSPState*)state_ptr;
        state->tour.assign(tour, tour + state->n);
        state->current_dist = current_dist;
        state->last_i = 0;
    }

    void get_tour(void* state_ptr, int* out_tour) {
        TSPState* state = (TSPState*)state_ptr;
        std::copy(state->tour.begin(), state->tour.end(), out_tour);
    }

    double calculate_tour_distance(void* state_ptr) {
        TSPState* state = (TSPState*)state_ptr;
        double dist = 0.0;
        int n = state->n;
        for (int i = 0; i < n - 1; ++i) {
            dist += get_distance(state->points[state->tour[i]], state->points[state->tour[i+1]]);
        }
        dist += get_distance(state->points[state->tour[n-1]], state->points[state->tour[0]]);
        state->current_dist = dist;
        return dist;
    }

    // optimize_tour now accepts breadth_pct (1 to 100)
    double optimize_tour(void* state_ptr, int timeout_ms, int breadth_pct, int* out_swaps, int* out_last_i, int* is_cancelled) {
        TSPState* state = (TSPState*)state_ptr;
        int n = state->n;
        int total_swaps = 0;
        
        const auto& points = state->points;
        auto& tour = state->tour;

        auto start_time = std::chrono::steady_clock::now();

        bool timeout_reached = false;
        bool improvement_this_call = false;

        // Calculate search window for breadth
        int breadth_limit = std::max(10, (int)(n * (breadth_pct / 100.0)));

        while (!timeout_reached) {
            if (is_cancelled && *is_cancelled) break;

            bool found_improvement = false;
            double best_gain = 1e-6;
            int best_i = -1;
            int best_j = -1;

            #pragma omp parallel
            {
                #pragma omp for schedule(dynamic, 128)
                for (int i = state->last_i; i < n - 2; ++i) {
                    if (found_improvement || (is_cancelled && *is_cancelled)) continue;

                    if (i % 128 == 0) {
                        auto now = std::chrono::steady_clock::now();
                        if (std::chrono::duration_cast<std::chrono::milliseconds>(now - start_time).count() > timeout_ms) {
                            timeout_reached = true;
                        }
                    }
                    if (timeout_reached) continue;

                    int t_i = tour[i];
                    int t_i1 = tour[i + 1];
                    double d12 = get_distance(points[t_i], points[t_i1]);
                    
                    // Limit search to breadth_limit neighbors around i
                    int end_j = std::min(n - 1, i + breadth_limit);
                    
                    for (int j = i + 2; j <= end_j; ++j) {
                        if (found_improvement || (is_cancelled && *is_cancelled)) break;

                        int t_j = tour[j];
                        int t_j1 = (j == n - 1) ? tour[0] : tour[j + 1];

                        double d34 = get_distance(points[t_j], points[t_j1]);
                        double d13 = get_distance(points[t_i], points[t_j]);
                        double d24 = get_distance(points[t_i1], points[t_j1]);

                        double gain = (d12 + d34) - (d13 + d24);

                        if (gain > 1e-6) {
                            #pragma omp critical
                            {
                                if (!found_improvement || gain > best_gain) {
                                    best_gain = gain;
                                    best_i = i;
                                    best_j = j;
                                    found_improvement = true;
                                }
                            }
                            break; 
                        }
                    }
                }
            }

            if (found_improvement) {
                std::reverse(tour.begin() + best_i + 1, tour.begin() + best_j + 1);
                state->current_dist -= best_gain;
                total_swaps++;
                improvement_this_call = true;
                state->last_i = 0; 
            } else {
                if (!timeout_reached) {
                    state->last_i = 0;
                    if (!improvement_this_call) {
                        timeout_reached = true; 
                    }
                }
                break;
            }

            auto now = std::chrono::steady_clock::now();
            if (std::chrono::duration_cast<std::chrono::milliseconds>(now - start_time).count() > timeout_ms) {
                timeout_reached = true;
            }
        }
        
        *out_swaps = total_swaps;
        *out_last_i = state->last_i;
        return state->current_dist;
    }

    void free_tsp(void* state_ptr) {
        TSPState* state = (TSPState*)state_ptr;
        delete state;
    }
}
