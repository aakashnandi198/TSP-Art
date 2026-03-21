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

## Phase 3: Multi-threaded C++ k-opt Optimization (Backend)

The final phase is the most computationally intensive. We "untangle" the greedy skeleton to find a much shorter, cleaner path.

### 1. High-Performance C++ Core
To handle tens of thousands of points, the core optimization loop is implemented in **C++** and parallelized with **OpenMP**. This allows the 2-opt search to utilize all available CPU cores.

### 2. The 2-opt Swap
The fundamental move is the **2-opt swap**. If we have two edges $(A, B)$ and $(C, D)$ that intersect, we can replace them with $(A, C)$ and $(B, D)$ by reversing the segment of the tour between $B$ and $C$.

### 3. Gain Calculation & Parallel Search
A swap is only performed if it results in a **positive gain** (reduction in total distance).
$$\text{Gain} = (\text{dist}(A, B) + \text{dist}(C, D)) - (\text{dist}(A, C) + \text{dist}(B, D))$$
The C++ core parallelizes the search for the "best" improving swap across the entire tour using `omp parallel for`.

### 4. Tunable Parameters
- **Search Depth (Budget):** Controls the total number of successful swaps allowed.
- **Search Breadth (Radius):** Limits the spatial search radius. Instead of checking every possible edge pair ($O(N^2)$), it only checks neighbors within a percentage of the tour length. This significantly improves performance on large point sets.

---

## Complexity & Performance

| Phase | Algorithm | Complexity | Execution |
| :--- | :--- | :--- | :--- |
| **Stippling** | Weighted Lloyd's | $O(I \cdot N \log N)$ | Backend (Python/SciPy) |
| **Initial Tour** | Fast Greedy NN | $O(N \log N)$ | Backend (Python/KDTree) |
| **Optimization** | Parallel 2-opt | $O(\text{Budget} \cdot \text{Breadth} \cdot N)$ | Backend (C++/OpenMP) |

*where $N$ is the number of points and $I$ is the number of stippling iterations.*

The backend provides updates to the frontend every ~800ms, ensuring a smooth, real-time visualization of the "untangling" process.
