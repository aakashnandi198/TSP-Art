# TSP Art Studio

TSP Art Studio is a mathematical art project that transforms your images into single, continuous line drawings using the Travelling Salesperson Problem (TSP).

## Features
- **Multi-threaded C++ Core:** High-performance Lin-Kernighan inspired optimization engine using OpenMP for parallelized k-opt untangling.
- **Weighted Voronoi Stippling:** Converts images into a set of points (stipples) based on pixel density using fast KDTree-based centroids.
- **Three-Phase Optimization:** Sequential logic focusing on Intersection Removal, Spatial Optimization, and Global Refinement.
- **Real-time Live Preview:** Interactive control panel with instant pre-processing and stippling feedback.
- **Museum-Quality Print:** High-contrast, beautifully formatted print layout for your masterpieces.
- **Theme Support:** Modern Dark and Light modes.

## Quick Start (Manual - No Docker)

1. **Clone the repository:**
   ```bash
   git clone git@github.com:aakashnandi198/TSP-Art.git
   cd TSP-Art
   ```

2. **Backend Setup:**
   ```bash
   cd backend
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   # Compile C++ Core
   g++ -O3 -fopenmp -shared -fPIC -static-libstdc++ -static-libgcc tsp_core.cpp -o libtsp_core.so
   # Start Server
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```

3. **Frontend Setup:**
   ```bash
   cd frontend
   python3 -m http.server 8080
   ```

4. **Access the application:**
   - [http://localhost:8080](http://localhost:8080)

## Quick Start with Docker

```bash
docker-compose up --build
```

## Tunable Parameters
- **Point Density:** Number of points generated from the image.
- **Search Depth:** Total budget for optimization swaps.
- **Search Breadth:** Limits the spatial search radius for intersection detection (improves performance).
- **Pre-processing:** Brightness, Contrast, Threshold, Denoising, and Edge Strength.

## Algorithm Details
1. **Stippling:** Python backend uses SciPy's KDTree for iterative Weighted Voronoi Stippling.
2. **Greedy Initial Tour:** Fast nearest-neighbor construction using KDTree for immediate feedback.
3. **C++ Optimization:** Parallelized Lin-Kernighan inspired Variable-Depth search implemented in C++ with OpenMP, exposed to Python via ctypes. Focuses on crossover resolution before global refinement.
