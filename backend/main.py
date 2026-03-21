from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import io
from PIL import Image
import numpy as np
import threading
import uuid

from stippler import generate_stipples
from tsp_solver import run_tsp_job

app = FastAPI(title="TSP-Art Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global dictionary to store job states
tsp_jobs = {}

@app.post("/process-image")
async def process_image(
    file: UploadFile = File(...), 
    num_points: int = Form(3000),
    opt_depth: float = Form(1.0),
    opt_breadth: int = Form(25),
    contrast: float = Form(1.5),
    blur: float = Form(0.0),
    sharpness: float = Form(1.0),
    brightness: float = Form(1.0),
    threshold: int = Form(0),
    run_tsp: bool = Form(False)
):
    try:
        from fastapi import Form
        from PIL import ImageEnhance, ImageFilter
        
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("L") # Convert to grayscale
        print(f"Processing image: {image.width}x{image.height}, num_points={num_points}, run_tsp={run_tsp}")
        
        # Apply Brightness
        if brightness != 1.0:
            enhancer = ImageEnhance.Brightness(image)
            image = enhancer.enhance(brightness)

        # Apply Contrast Enhancement
        if contrast != 1.0:
            enhancer = ImageEnhance.Contrast(image)
            image = enhancer.enhance(contrast)
            
        # Apply Sharpness/Edge Enhancement
        if sharpness != 1.0:
            enhancer = ImageEnhance.Sharpness(image)
            image = enhancer.enhance(sharpness)
            
        # Apply Gaussian Blur (Denoising)
        if blur > 0:
            image = image.filter(ImageFilter.GaussianBlur(radius=blur))

        # Apply Thresholding (True Black and White)
        if threshold > 0:
            # Simple thresholding: pixels below threshold -> 0 (black), above -> 255 (white)
            image = image.point(lambda p: 0 if p < threshold else 255)
        
        # Resize image if too large to speed up processing
        max_dim = 800
        if image.width > max_dim or image.height > max_dim:
            image.thumbnail((max_dim, max_dim))
            print(f"Resized to: {image.width}x{image.height}")
            
        img_array = np.array(image)
        
        # Generate stipples
        print("Generating stipples...")
        points = generate_stipples(img_array, num_points)
        print(f"Generated {len(points)} points.")
        
        # Encode pre-processed image as base64 for preview
        import base64
        buffered = io.BytesIO()
        image.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode()
        
        job_id = None
        if run_tsp:
            # Create Job
            job_id = str(uuid.uuid4())
            node_budget = int(len(points) * max(0.1, (10 ** opt_depth)))
            
            print(f"Created Job: {job_id}, node_budget={node_budget}, breadth={opt_breadth}%")
            tsp_jobs[job_id] = {
                "status": "running",
                "stage": "Initializing",
                "progress": 0.0,
                "distance": 0.0,
                "greedy_distance": 0.0,
                "tour": [],
                "error": None
            }
            
            # Start background thread
            thread = threading.Thread(target=run_tsp_job, args=(job_id, points, node_budget, opt_breadth, tsp_jobs))
            thread.start()
        
        return JSONResponse(content={
            "job_id": job_id,
            "points": points,
            "width": image.width, 
            "height": image.height,
            "preprocessed_image": f"data:image/png;base64,{img_base64}"
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/job-status/{job_id}")
def get_job_status(job_id: str):
    if job_id not in tsp_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # We don't want to return the tour if it hasn't started or is too large unnecessarily, 
    # but frontend needs it to draw. We return the whole state.
    state = tsp_jobs[job_id]
    return state

@app.post("/cancel-job/{job_id}")
def cancel_job(job_id: str):
    if job_id in tsp_jobs and tsp_jobs[job_id]["status"] == "running":
        tsp_jobs[job_id]["status"] = "cancelled"
    return {"status": "ok"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

