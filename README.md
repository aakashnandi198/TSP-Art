# TSP Art Studio

TSP Art Studio is a mathematical art project that transforms your images into single, continuous line drawings using the Travelling Salesperson Problem (TSP).

## Features
- **Weighted Voronoi Stippling:** Converts images into a set of points (stipples) based on pixel density.
- **Variable-Depth k-opt Optimization:** Shortens the tour by iteratively untangling intersections.
- **Museum-Quality Print:** High-contrast, beautifully formatted print layout for your masterpieces.
- **Theme Support:** Modern Dark and Light modes.

## Quick Start with Docker

The easiest way to launch the project is using Docker Compose:

1. **Clone the repository:**
   ```bash
   git clone git@github.com:aakashnandi198/TSP-Art.git
   cd TSP-Art
   ```

2. **Launch with Docker Compose:**
   ```bash
   docker-compose up --build
   ```

3. **Access the application:**
   - Frontend: [http://localhost:5174](http://localhost:5174)
   - Backend API: [http://localhost:8000](http://localhost:8000)

## Tunable Parameters
- **Point Density:** Number of points generated from the image.
- **Optimization Depth:** Exponential multiplier for the k-opt search budget.
- **Optimization Breadth:** Spatial search radius for intersection detection.

## Algorithm Details
1. **Stippling:** Python backend uses SciPy's KDTree for fast Voronoi region calculation.
2. **Greedy Initial Tour:** Nearest neighbor search for a fast starting path.
3. **Live Untangling:** Variable-depth 2-opt search implemented in the browser for real-time visual feedback.
