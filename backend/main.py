from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import io
from PIL import Image
import numpy as np

from stippler import generate_stipples
from tsp_solver import solve_tsp

app = FastAPI(title="TSP-Art Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/process-image")
async def process_image(file: UploadFile = File(...), num_points: int = Form(3000)):
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("L") # Convert to grayscale
        
        # Resize image if too large to speed up processing
        max_dim = 800
        if image.width > max_dim or image.height > max_dim:
            image.thumbnail((max_dim, max_dim))
            
        img_array = np.array(image)
        
        # Generate stipples
        points = generate_stipples(img_array, num_points)
        
        return JSONResponse(content={
            "points": points,
            "width": image.width, 
            "height": image.height
        })
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/health")
def health_check():
    return {"status": "ok"}
