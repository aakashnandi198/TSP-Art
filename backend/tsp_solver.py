import numpy as np
from numba import njit
import math

@njit
def distance(p1, p2):
    return math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)

@njit
def nearest_neighbor_tour(points):
    n = points.shape[0]
    unvisited = np.ones(n, dtype=np.bool_)
    tour = np.empty(n, dtype=np.int32)
    
    curr = 0
    tour[0] = curr
    unvisited[curr] = False
    
    for i in range(1, n):
        min_dist = np.inf
        nearest = -1
        p_curr = points[curr]
        for j in range(n):
            if unvisited[j]:
                dist = distance(p_curr, points[j])
                if dist < min_dist:
                    min_dist = dist
                    nearest = j
        tour[i] = nearest
        unvisited[nearest] = False
        curr = nearest
        
    return tour

@njit
def two_opt(points, tour, max_iterations=50):
    n = len(tour)
    improved = True
    iteration = 0
    while improved and iteration < max_iterations:
        improved = False
        for i in range(1, n - 2):
            for j in range(i + 1, n):
                if j - i == 1:
                    continue
                
                p1 = points[tour[i - 1]]
                p2 = points[tour[i]]
                p3 = points[tour[j - 1]]
                
                if j == n - 1:
                    p4 = points[tour[0]]
                else:
                    p4 = points[tour[j]]
                
                d1 = distance(p1, p2) + distance(p3, p4)
                d2 = distance(p1, p3) + distance(p2, p4)
                
                if d2 < d1:
                    tour[i:j] = tour[i:j][::-1]
                    improved = True
        iteration += 1
    return tour

@njit
def calculate_tour_distance(points, tour):
    n = len(tour)
    dist = 0.0
    for i in range(n - 1):
        dist += distance(points[tour[i]], points[tour[i+1]])
    dist += distance(points[tour[-1]], points[tour[0]])
    return dist

def solve_tsp(points_list):
    points = np.array(points_list, dtype=np.float64)
    if len(points) == 0:
        return [], 0
        
    # Greedy Phase only
    tour_indices = nearest_neighbor_tour(points)
    greedy_dist = calculate_tour_distance(points, tour_indices)
    
    # Return raw points and the greedy indices so frontend can optimize
    return points.tolist(), tour_indices.tolist(), float(greedy_dist)
