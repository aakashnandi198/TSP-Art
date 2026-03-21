FROM python:3.12-slim

WORKDIR /app

# Install build dependencies, C++ compiler, and OpenMP
RUN apt-get update && apt-get install -y \
    build-essential \
    libomp-dev \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Compile the multi-threaded C++ TSP core
RUN g++ -O3 -fopenmp -shared -fPIC -static-libstdc++ -static-libgcc tsp_core.cpp -o libtsp_core.so

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
