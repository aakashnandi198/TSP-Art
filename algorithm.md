# TSP Art Algorithm

The TSP Art Studio uses a three-phase pipeline to transform a raster image into a single continuous vector line. This document provides a technical deep-dive into each phase.

---

## Phase 1: Weighted Voronoi Stippling (Backend)

The goal of this phase is to represent the image as a set of discrete points (stipples) where the density of the points corresponds to the darkness of the image.

### 1. Density Mapping
The image is converted to grayscale. We define a density function $\rho(x, y)$ where:
$$\rho(x, y) = 255 - \text{pixel\_intensity}(x, y)$$
Darker pixels result in higher density values.

### 2. Initial Sampling
We use **Importance Sampling** to place the initial $N$ points (defined by the *Point Density* slider). Points are chosen randomly across the image grid, with the probability of a pixel being chosen proportional to its density $\rho$.

### 3. Lloyd's Algorithm Approximation
To create an aesthetically pleasing distribution (Centroidal Voronoi Tessellation), we run an iterative process:
1.  **Partition:** Every pixel in the image is assigned to its nearest stipple point using a **Spatial KD-Tree** for efficiency.
2.  **Centroid Calculation:** For each point $P_i$, we calculate the center of mass (centroid) of all pixels assigned to it, weighted by their density:
    $$C_i = \frac{\sum (x, y) \cdot \rho(x, y)}{\sum \rho(x, y)}$$
3.  **Update:** Move $P_i$ to $C_i$ and repeat. The backend performs 15 iterations to balance speed and distribution quality.

---

## Phase 2: Greedy Skeleton Construction (Frontend)

Once the points are generated, we must find an initial path that visits every point exactly once. This is a "Cold Start" for the Travelling Salesperson Problem.

### Nearest Neighbor (NN) Heuristic
We start at an arbitrary point and iteratively move to the closest unvisited neighbor.
- **Spatial Pruning:** To avoid $O(N^2)$ complexity, we use a **Spatial Grid**. The algorithm first searches for neighbors within immediate grid cells. If a cell is empty, it expands the search radius.
- **Result:** This produces a "Greedy Skeleton." It is fast but contains many "crossovers" (intersections) and is significantly longer than the optimal path.

---

## Phase 3: Variable-Depth k-opt Optimization (Frontend)

The final phase is the most computationally intensive. We "untangle" the greedy skeleton to find a much shorter, cleaner path.

### 1. The 2-opt Swap
The fundamental move is the **2-opt swap**. If we have two edges $(A, B)$ and $(C, D)$ that intersect, we can replace them with $(A, C)$ and $(B, D)$ by reversing the segment of the tour between $B$ and $C$.

### 2. Gain Calculation
A swap is only performed if it results in a **positive gain** (reduction in total distance):
$$\text{Gain} = (\text{dist}(A, B) + \text{dist}(C, D)) - (\text{dist}(A, C) + \text{dist}(B, D))$$

### 3. Variable-Depth Search Logic
The "Optimization Depth" slider controls the **Node Budget**:
- **Multiplier:** The slider provides an exponential multiplier $M$ (0.1x to 1000x).
- **Budget:** $\text{MaxMoves} = N \cdot M$.
- **Process:** The algorithm continues performing improving swaps until either:
    1. No more improving moves can be found (Local Optimum).
    2. The total number of successful moves exceeds the Budget.

### 4. Spatial Priority & Breadth
- **Breadth:** Controls the search radius in the spatial grid.
- **Priority:** The algorithm prioritizes checking edges that are physically long, as these are the most likely candidates for significant distance reduction.

---

## Complexity & Performance

| Phase | Algorithm | Complexity | Execution |
| :--- | :--- | :--- | :--- |
| **Stippling** | Weighted Lloyd's | $O(I \cdot N \log N)$ | Backend (Python/SciPy) |
| **Initial Tour** | Greedy NN | $O(N \log N)$ | Frontend (JS/Grid) |
| **Optimization** | Variable-Depth k-opt | $O(\text{Budget} \cdot \log N)$ | Frontend (JS/Live) |

*where $N$ is the number of points and $I$ is the number of stippling iterations.*

By performing the optimization "Live" in the browser using `requestAnimationFrame`, the UI remains responsive, allowing you to watch the mathematics "untangle" the art in real-time.
