import numpy as np
from scipy.spatial import cKDTree

def generate_stipples(img_array: np.ndarray, num_points: int, iterations: int = 15) -> list:
    """
    Approximates Weighted Voronoi Stippling.
    """
    height, width = img_array.shape
    # Invert density: dark pixels have higher density
    density = 255.0 - img_array.astype(float)
    density[density < 0] = 0
    total_density = np.sum(density)
    
    if total_density == 0:
        density = np.ones_like(density)
        total_density = np.sum(density)
        
    prob = (density / total_density).flatten()
    
    # Initial guess by sampling from density distribution
    indices = np.random.choice(height * width, size=num_points, p=prob, replace=False)
    y, x = np.unravel_index(indices, (height, width))
    points = np.column_stack((x, y)).astype(float)
    
    # Prepare pixel coordinates for KDTree querying
    grid_y, grid_x = np.mgrid[0:height, 0:width]
    pixel_coords = np.column_stack((grid_x.ravel(), grid_y.ravel()))
    pixel_densities = density.ravel()
    
    # Filter pixels with non-zero density to speed up the process
    mask = pixel_densities > 0
    pixel_coords = pixel_coords[mask]
    pixel_densities = pixel_densities[mask]
    
    for _ in range(iterations):
        tree = cKDTree(points)
        # Assign each pixel to the nearest point
        distances, nearest_point_indices = tree.query(pixel_coords)
        
        # Compute new centroids for Voronoi regions
        new_points = np.zeros_like(points)
        
        new_x_sum = np.bincount(nearest_point_indices, weights=pixel_coords[:, 0] * pixel_densities, minlength=num_points)
        new_y_sum = np.bincount(nearest_point_indices, weights=pixel_coords[:, 1] * pixel_densities, minlength=num_points)
        weight_sum = np.bincount(nearest_point_indices, weights=pixel_densities, minlength=num_points)
        
        valid = weight_sum > 0
        new_points[valid, 0] = new_x_sum[valid] / weight_sum[valid]
        new_points[valid, 1] = new_y_sum[valid] / weight_sum[valid]
        
        # Keep points that didn't get any pixels mapped to them
        new_points[~valid] = points[~valid] 
        points = new_points
        
    return points.tolist()
