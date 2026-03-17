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
async def process_image(
    file: UploadFile = File(...), 
    num_points: int = Form(3000),
    contrast: float = Form(1.5),
    blur: float = Form(0.0),
    sharpness: float = Form(1.0),
    brightness: float = Form(1.0),
    threshold: int = Form(0)
):
    try:
        from fastapi import Form
        from PIL import ImageEnhance, ImageFilter
        
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("L") # Convert to grayscale
        
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
            
        img_array = np.array(image)
        
        # Generate stipples
        points = generate_stipples(img_array, num_points)
        
        # Encode pre-processed image as base64 for preview
        import base64
        buffered = io.BytesIO()
        image.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode()
        
        return JSONResponse(content={
            "points": points,
            "width": image.width, 
            "height": image.height,
            "preprocessed_image": f"data:image/png;base64,{img_base64}"
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/health")
def health_check():
    return {"status": "ok"}
