# TSP Art Algorithm

The TSP Art Studio uses a three-phase pipeline to transform a raster image into a single continuous vector line. This document provides a technical deep-dive into each phase.

---

## Phase 1: Weighted Voronoi Stippling (Backend)

The goal of this phase is to represent the image as a set of discrete points (stipples) where the density of the points corresponds to the darkness of the image.

### 1. Density Mapping
The image is converted to grayscale. We define a density function $\rho(x, y)$ where:
$$\rho(x, y) = 255 - \text{pixel\_intensity}(x, y)$$
Darker pixels result in higher density values.

### 2. Lloyd's Algorithm Approximation
To create an aesthetically pleasing distribution (Centroidal Voronoi Tessellation), we run an iterative process:
1.  **Partition:** Every pixel in the image is assigned to its nearest stipple point using a **Spatial KD-Tree** for efficiency.
2.  **Centroid Calculation:** For each point $P_i$, we calculate the center of mass (centroid) of all pixels assigned to it, weighted by their density:
    $$C_i = \frac{\sum (x, y) \cdot \rho(x, y)}{\sum \rho(x, y)}$$
3.  **Update:** Move $P_i$ to $C_i$ and repeat. The backend performs 15 iterations to balance speed and distribution quality.

---

## Phase 2: Greedy Skeleton Construction (Backend)

Once the points are generated, we find an initial path that visits every point exactly once.

### Fast Nearest Neighbor (NN) Heuristic
We start at an arbitrary point and iteratively move to the closest unvisited neighbor.
- **KDTree Acceleration:** We use a **scipy.spatial.cKDTree** to perform fast nearest-neighbor queries ($O(\log N)$).
- **Visualization:** The backend sends partial tour segments to the frontend every 200 points, allowing you to see the "skeleton" grow in real-time.

---

## Phase 3: Three-Phase Lin-Kernighan Optimization (Backend)

The final phase is the most computationally intensive. We "untangle" the greedy skeleton using a high-performance **C++ core** parallelized with **OpenMP**.

### 1. The 2-opt Swap & Gain Logic
The fundamental move is the **2-opt swap**. If we have two edges $(A, B)$ and $(C, D)$, we replace them with $(A, C)$ and $(B, D)$ only if the new configuration reduces the total distance.
$$\text{Gain} = (\text{dist}(A, B) + \text{dist}(C, D)) - (\text{dist}(A, C) + \text{dist}(B, D))$$

### 2. Sequential Phase Logic
To maximize visual impact and efficiency, the C++ core runs three distinct passes:
1.  **Removing Intersections:** Uses a geometric intersection formula to strictly target and resolve crossing edges within a spatial neighborhood.
2.  **Spatial Optimization:** Performs standard distance-reduction swaps within a spatial radius defined by the *Search Breadth* slider.
3.  **Global Refinement:** An exhaustive, non-spatial scan of every edge pair in the entire tour to guarantee a true local optimum.

### 3. Parallel Search
The optimizer parallelizes the search for the best improving swap across all CPU cores using `#pragma omp parallel for`, allowing it to handle 100,000+ points in seconds.

---

## Complexity & Performance

| Phase | Algorithm | Complexity | Execution |
| :--- | :--- | :--- | :--- |
| **Stippling** | Weighted Lloyd's | $O(I \cdot N \log N)$ | Backend (Python/SciPy) |
| **Initial Tour** | Fast Greedy NN | $O(N \log N)$ | Backend (Python/KDTree) |
| **Optimization** | Three-Phase Parallel k-opt | $O(\text{Scans} \cdot \text{Breadth} \cdot N)$ | Backend (C++/OpenMP) |

*where $N$ is the number of points and $I$ is the number of stippling iterations.*

The backend provides updates to the frontend every ~800ms, ensuring a smooth, real-time visualization of the stability-based progress bar.
