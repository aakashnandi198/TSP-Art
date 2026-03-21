import numpy as np
from numba import njit
import math
from scipy.spatial import cKDTree
import ctypes
import os
import time

# --- C++ Core Setup ---
lib_path = os.path.join(os.path.dirname(__file__), "libtsp_core.so")
cpp_core = None

class Point(ctypes.Structure):
    _fields_ = [("x", ctypes.c_double), ("y", ctypes.c_double)]

if os.path.exists(lib_path):
    try:
        cpp_core = ctypes.CDLL(lib_path)
        
        cpp_core.init_tsp.argtypes = [ctypes.POINTER(Point), ctypes.c_int]
        cpp_core.init_tsp.restype = ctypes.c_void_p
        
        cpp_core.set_tour.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_int), ctypes.c_double]
        
        cpp_core.get_tour.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_int)]
        
        cpp_core.calculate_tour_distance.argtypes = [ctypes.c_void_p]
        cpp_core.calculate_tour_distance.restype = ctypes.c_double
        
        cpp_core.optimize_tour.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int)]
        cpp_core.optimize_tour.restype = ctypes.c_double
        
        cpp_core.free_tsp.argtypes = [ctypes.c_void_p]
        print("Loaded multi-threaded C++ TSP core.")
    except Exception as e:
        print("Failed to load C++ TSP core, falling back to Numba:", e)
        cpp_core = None

# --- Numba Fallbacks ---

@njit
def distance(p1, p2):
    return math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)

@njit
def calculate_tour_distance(points, tour):
    n = len(tour)
    dist = 0.0
    for i in range(n - 1):
        dist += distance(points[tour[i]], points[tour[i+1]])
    dist += distance(points[tour[-1]], points[tour[0]])
    return dist

@njit
def two_opt_pass(points, tour, current_dist, max_swaps=1000):
    n = len(tour)
    swaps = 0
    improved = False
    
    for i in range(n - 2):
        p1 = points[tour[i]]
        p2 = points[tour[i + 1]]
        d12 = distance(p1, p2)
        
        for j in range(i + 2, n):
            if j == n - 1 and i == 0:
                continue
                
            p3 = points[tour[j]]
            if j == n - 1:
                p4 = points[tour[0]]
            else:
                p4 = points[tour[j + 1]]
                
            d34 = distance(p3, p4)
            d13 = distance(p1, p3)
            d24 = distance(p2, p4)
            
            gain = (d12 + d34) - (d13 + d24)
            
            if gain > 1e-6:
                tour[i+1:j+1] = tour[i+1:j+1][::-1]
                current_dist -= gain
                improved = True
                swaps += 1
                
                p2 = points[tour[i + 1]]
                d12 = distance(p1, p2)
                
                if swaps >= max_swaps:
                    return current_dist, improved, swaps

    return current_dist, improved, swaps

def run_tsp_job(job_id, points_list, node_budget, opt_breadth, jobs_dict):
    try:
        points = np.array(points_list, dtype=np.float64)
        n = len(points)
        if n <= 1:
            jobs_dict[job_id]["tour"] = list(range(n))
            jobs_dict[job_id]["status"] = "completed"
            jobs_dict[job_id]["progress"] = 1.0
            return
            
        jobs_dict[job_id]["stage"] = "Greedy Construction"
        
        # Fast Greedy using KDTree
        tree = cKDTree(points)
        unvisited = np.ones(n, dtype=bool)
        tour = np.zeros(n, dtype=np.int32)
        
        curr = 0
        tour[0] = curr
        unvisited[curr] = False
        
        for i in range(1, n):
            if jobs_dict[job_id].get("status") == "cancelled":
                return
            
            k = 10
            found = False
            while not found and k <= n:
                dists, indices = tree.query(points[curr], k=min(k, n))
                if k == 1:
                    indices = np.array([indices])
                
                for idx in indices:
                    if unvisited[idx]:
                        nearest = idx
                        found = True
                        break
                if not found:
                    k *= 4
            
            if not found:
                nearest = -1
                for j in range(n):
                    if unvisited[j]:
                        nearest = j
                        break
            
            tour[i] = nearest
            unvisited[nearest] = False
            curr = nearest
            
            if i % 200 == 0 or i == n - 1:
                jobs_dict[job_id]["tour"] = tour[:i+1].tolist()
                jobs_dict[job_id]["progress"] = (i / n) * 0.1
        
        current_dist = calculate_tour_distance(points, tour)
        
        jobs_dict[job_id]["tour"] = tour.tolist()
        jobs_dict[job_id]["distance"] = float(current_dist)
        jobs_dict[job_id]["greedy_distance"] = float(current_dist)
        jobs_dict[job_id]["stage"] = "Optimization"
        
        moves_done = 0
        
        # --- C++ Core Optimization ---
        if cpp_core is not None:
            # Prepare data for C++
            c_points = (Point * n)()
            for i in range(n):
                c_points[i].x = points[i, 0]
                c_points[i].y = points[i, 1]
                
            state_ptr = cpp_core.init_tsp(c_points, n)
            
            c_tour = (ctypes.c_int * n)(*tour)
            cpp_core.set_tour(state_ptr, c_tour, ctypes.c_double(current_dist))
            swaps_done = ctypes.c_int(0)
            last_i = ctypes.c_int(0)
            c_is_cancelled = ctypes.c_int(0)

            # For progress visualization: 
            # We treat the optimization as having multiple potential full scans.
            # We'll show progress based on the current scan position and swaps.

            while jobs_dict[job_id].get("status") != "cancelled":
                # Call C++ for ~800ms
                # last_i now represents the stability counter (consecutive points without swaps) + phase*N
                current_dist = cpp_core.optimize_tour(state_ptr, 800, ctypes.c_int(opt_breadth), ctypes.byref(swaps_done), ctypes.byref(last_i), ctypes.byref(c_is_cancelled))
                swaps = swaps_done.value

                moves_done += swaps

                cpp_core.get_tour(state_ptr, c_tour)
                tour = np.array(c_tour)

                jobs_dict[job_id]["tour"] = tour.tolist()
                jobs_dict[job_id]["distance"] = float(current_dist)

                # last_i now contains (phase * n) + current_index
                phase = last_i.value // n
                current_idx = last_i.value % n
                
                # Update Stage name
                stages = ["Removing Intersections", "Spatial Optimization", "Global Refinement"]
                jobs_dict[job_id]["stage"] = stages[min(2, phase)]

                # If no swaps were found AND we finished all phases, we are TRULY done
                if swaps == 0 and phase >= 2 and current_idx == 0:
                    break

                # Progress: 10% (greedy) + 90% (opt)
                # 3 phases, each takes roughly 30%
                phase_prog = (phase / 3.0) + (current_idx / (n * 3.0))
                jobs_dict[job_id]["progress"] = 0.1 + 0.9 * min(0.99, phase_prog)

                if jobs_dict[job_id].get("status") == "cancelled":
                    c_is_cancelled.value = 1
                
                time.sleep(0.1)
                
            cpp_core.free_tsp(state_ptr)
            
        # --- Python / Numba Fallback Optimization ---
        else:
            improved = True
            while improved and moves_done < node_budget and jobs_dict[job_id].get("status") != "cancelled":
                current_dist, improved, swaps = two_opt_pass(points, tour, current_dist, max_swaps=500)
                moves_done += swaps
                
                if moves_done % 2000 < 500:
                    current_dist = calculate_tour_distance(points, tour)
                    
                jobs_dict[job_id]["tour"] = tour.tolist()
                jobs_dict[job_id]["distance"] = float(current_dist)
                opt_progress = (moves_done / node_budget) if node_budget > 0 else 0.9
                jobs_dict[job_id]["progress"] = 0.1 + 0.9 * min(0.99, opt_progress)
            
        jobs_dict[job_id]["status"] = "completed"
        jobs_dict[job_id]["progress"] = 1.0
        jobs_dict[job_id]["stage"] = "Finished"
    except Exception as e:
        import traceback
        traceback.print_exc()
        jobs_dict[job_id]["status"] = "error"
        jobs_dict[job_id]["error"] = str(e)
