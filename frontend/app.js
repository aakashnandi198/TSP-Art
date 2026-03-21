const themeToggle = document.getElementById('theme-toggle');
const sunIcon = themeToggle.querySelector('.sun');
const moonIcon = themeToggle.querySelector('.moon');
let isCancelled = false;
let currentPoints = null;
let currentTour = null;

async function checkBackendHealth() {
    const backendHost = window.location.hostname || "localhost";
    try {
        const res = await fetch(`http://${backendHost}:8000/health`);
        if (res.ok) {
            console.log("Backend is healthy");
        } else {
            console.warn("Backend health check failed");
        }
    } catch (e) {
        console.error("Backend unreachable", e);
    }
}
setInterval(checkBackendHealth, 5000);
checkBackendHealth();

// --- Zoom & Pan State ---
let transform = {
    x: 0,
    y: 0,
    scale: 1
};
let isDragging = false;
let lastMousePos = { x: 0, y: 0 };

function applyTransform(ctx) {
    ctx.setTransform(transform.scale, 0, 0, transform.scale, transform.x, transform.y);
}

function resetTransform() {
    transform = { x: 0, y: 0, scale: 1 };
    redraw();
}
// ------------------------

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tsp-art-theme', theme);
    if (theme === 'light') {
        sunIcon.classList.remove('hidden');
        moonIcon.classList.add('hidden');
    } else {
        sunIcon.classList.add('hidden');
        moonIcon.classList.remove('hidden');
    }
    if (currentPoints) redraw();
}

themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'light' ? 'dark' : 'light');
});

function redraw() {
    if (!currentPoints) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (currentTour) {
        renderTour(ctx, currentPoints, currentTour, true);
    } else {
        drawPoints(ctx, currentPoints);
    }
}
const savedTheme = localStorage.getItem('tsp-art-theme') || 'dark';
setTheme(savedTheme);

const placeholder = document.getElementById('placeholder');
const fileInput = document.getElementById('image');
const numPointsInput = document.getElementById('num_points');
const pointsValue = document.getElementById('points-value');
const optDepthInput = document.getElementById('opt_depth');
const optDepthValue = document.getElementById('opt-depth-label');
const optBreadthInput = document.getElementById('opt_breadth');
const optBreadthValue = document.getElementById('opt-breadth-value');
const contrastInput = document.getElementById('contrast');
const contrastValue = document.getElementById('contrast-value');
const brightnessInput = document.getElementById('brightness');
const brightnessValue = document.getElementById('brightness-value');
const thresholdInput = document.getElementById('threshold');
const thresholdValue = document.getElementById('threshold-value');
const blurInput = document.getElementById('blur');
const blurValue = document.getElementById('blur-value');
const sharpnessInput = document.getElementById('sharpness');
const sharpnessValue = document.getElementById('sharpness-value');
const fileNameDisplay = document.getElementById('file-name-display');
const referenceSection = document.getElementById('reference-section');
const refCard = document.getElementById('ref-card');
const refModeBadge = document.getElementById('ref-mode-badge');
const refLoader = document.getElementById('ref-loader');
const originalPreview = document.getElementById('original-preview');

// --- Slider Listeners (Consolidated) ---
numPointsInput.oninput = function() {
    pointsValue.innerText = Number(this.value).toLocaleString() + " points";
    debouncePreview();
};

optDepthInput.oninput = function() {
    const v = Math.pow(10, parseFloat(this.value));
    optDepthValue.innerText = (v < 10 ? v.toFixed(1) : Math.round(v)) + "x depth";
    debouncePreview();
};

optBreadthInput.oninput = function() {
    optBreadthValue.innerText = this.value + "% of edges";
    debouncePreview();
};

brightnessInput.oninput = function() {
    brightnessValue.innerText = parseFloat(this.value).toFixed(1) + "x";
    debouncePreview();
};

contrastInput.oninput = function() {
    contrastValue.innerText = parseFloat(this.value).toFixed(1) + "x";
    debouncePreview();
};

thresholdInput.oninput = function() {
    const val = parseInt(this.value);
    thresholdValue.innerText = val === 0 ? "0 (Off)" : val;
    debouncePreview();
};

blurInput.oninput = function() {
    blurValue.innerText = parseFloat(this.value).toFixed(1) + " px";
    debouncePreview();
};

sharpnessInput.oninput = function() {
    sharpnessValue.innerText = parseFloat(this.value).toFixed(1) + "x";
    debouncePreview();
};
// ---------------------------------------

let refImageData = {
    original: null,
    preprocessed: null,
    stippled: null
};
let currentRefMode = 'original'; // 'original', 'preprocessed', 'stippled'
let currentFile = null;
let previewTimeout = null;
let previewAbortController = null;

async function updateLivePreview() {
    if (!currentFile) return;
    
    // Abort previous request if it's still running
    if (previewAbortController) {
        previewAbortController.abort();
    }
    previewAbortController = new AbortController();
    const { signal } = previewAbortController;
    
    refLoader.classList.remove('hidden');
    const formData = new FormData();
    formData.append('file', currentFile);
    formData.append('num_points', numPointsInput.value);
    formData.append('opt_depth', optDepthInput.value);
    formData.append('contrast', contrastInput.value);
    formData.append('blur', blurInput.value);
    formData.append('sharpness', sharpnessInput.value);
    formData.append('brightness', brightnessInput.value);
    formData.append('threshold', thresholdInput.value);
    formData.append('run_tsp', 'false');

    try {
        const backendHost = window.location.hostname || "localhost";
        console.log(`Sending preview request to http://${backendHost}:8000/process-image`);
        const response = await fetch(`http://${backendHost}:8000/process-image`, {
            method: 'POST', 
            body: formData,
            signal
        });
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({ error: "Unknown error" }));
            console.error("Server error:", errData.error);
            return;
        }
        const data = await response.json();
        
        refImageData.preprocessed = data.preprocessed_image;
        refImageData.stippled = generateStippledPreview(data.points, data.width, data.height);
        
        // Update the view if we are currently looking at one of these modes
        if (currentRefMode !== 'original') {
            updateRefView();
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            return;
        }
        console.error("Preview update failed", e);
    } finally {
        refLoader.classList.add('hidden');
    }
}

function debouncePreview() {
    if (previewTimeout) clearTimeout(previewTimeout);
    previewTimeout = setTimeout(updateLivePreview, 500); // 500ms debounce
}

function updateRefView() {
    if (currentRefMode === 'original') {
        originalPreview.src = refImageData.original;
        refModeBadge.textContent = 'Original';
    } else if (currentRefMode === 'preprocessed') {
        originalPreview.src = refImageData.preprocessed || refImageData.original;
        refModeBadge.textContent = 'Pre-processed';
    } else if (currentRefMode === 'stippled') {
        originalPreview.src = refImageData.stippled || refImageData.original;
        refModeBadge.textContent = 'Stippled';
    }
}

refCard.addEventListener('click', () => {
    const modes = ['original', 'preprocessed', 'stippled'];
    let idx = modes.indexOf(currentRefMode);
    currentRefMode = modes[(idx + 1) % modes.length];
    updateRefView();
});

function generateStippledPreview(points, width, height) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tCtx = tempCanvas.getContext('2d');
    tCtx.fillStyle = 'white';
    tCtx.fillRect(0, 0, width, height);
    tCtx.fillStyle = 'black';
    for (const p of points) {
        tCtx.fillRect(p[0], p[1], 1, 1);
    }
    return tempCanvas.toDataURL();
}

const submitBtn = document.getElementById('submit-btn');
const printBtn = document.getElementById('print-btn');
const helpBtn = document.getElementById('help-btn');
const helpModal = document.getElementById('help-modal');
const closeHelp = document.getElementById('close-help');
const cancelBtn = document.getElementById('cancel-btn');
const loading = document.getElementById('loading');
const progressBar = document.getElementById('progress-bar');
const labels = document.querySelectorAll('.p-label');
const percents = document.querySelectorAll('.p-percent');
const canvas = document.getElementById('art-canvas');
const artFrame = document.getElementById('art-frame');
const svgElement = document.getElementById('art-svg');
const ctx = canvas.getContext('2d');

function updateSVG(points, tour, width, height) {
    if (!tour || tour.length === 0) return;
    
    artFrame.style.aspectRatio = `${width} / ${height}`;
    svgElement.setAttribute('viewBox', `0 0 ${width} ${height}`);
    let d = `M ${points[tour[0]][0]} ${points[tour[0]][1]} `;
    for (let i = 1; i < tour.length; i++) {
        d += `L ${points[tour[i]][0]} ${points[tour[i]][1]} `;
    }
    d += 'Z';
    
    svgElement.innerHTML = `<path d="${d}" fill="none" stroke="black" stroke-width="0.5" />`;
}

function handleFile(file) {
    if (!file) return;
    currentFile = file; // Store for live previews
    fileNameDisplay.textContent = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
        refImageData.original = e.target.result;
        refImageData.preprocessed = null;
        refImageData.stippled = null;
        currentRefMode = 'original';
        updateRefView();
        referenceSection.classList.remove('hidden');
        
        // Trigger first preview generation
        updateLivePreview();
    };
    reader.readAsDataURL(file);
}

printBtn.addEventListener('click', () => { window.print(); });
cancelBtn.addEventListener('click', () => { isCancelled = true; });

helpBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));
closeHelp.addEventListener('click', () => helpModal.classList.add('hidden'));
window.addEventListener('click', (e) => {
    if (e.target === helpModal) helpModal.classList.add('hidden');
});

placeholder.addEventListener('click', () => fileInput.click());
placeholder.addEventListener('dragover', (e) => { e.preventDefault(); placeholder.style.color = 'var(--accent)'; });
['dragleave', 'dragend'].forEach(type => {
    placeholder.addEventListener(type, () => { placeholder.style.color = 'var(--text-secondary)'; });
});
placeholder.addEventListener('drop', (e) => {
    e.preventDefault();
    placeholder.style.color = 'var(--text-secondary)';
    if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        handleFile(e.dataTransfer.files[0]);
    }
});
fileInput.addEventListener('change', (e) => {
    if (fileInput.files.length) handleFile(fileInput.files[0]);
});

document.getElementById('upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    formData.append('run_tsp', 'true');
    if (!fileInput.files.length) { alert('Please select an image first.'); return; }

    isCancelled = false;
    submitBtn.disabled = true;
    printBtn.classList.add('hidden');
    loading.classList.remove('hidden');
    placeholder.classList.add('hidden');
    canvas.classList.add('has-art');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    let currentProgress = 0;
    const updateProgress = (target, label, duration = 300) => {
        if (isCancelled) return Promise.resolve();
        if (label) labels.forEach(el => el.textContent = label);
        return new Promise(resolve => {
            const start = currentProgress;
            const diff = target - start;
            if (diff <= 0) { resolve(); return; }
            const startTime = performance.now();
            function animate(time) {
                if (isCancelled) { resolve(); return; }
                const elapsed = time - startTime;
                const p = Math.min(elapsed / duration, 1);
                currentProgress = start + (diff * p);
                progressBar.style.width = `${currentProgress}%`;
                percents.forEach(el => el.textContent = `${Math.round(currentProgress)}%`);
                if (p < 1) requestAnimationFrame(animate); else resolve();
            }
            requestAnimationFrame(animate);
        });
    };

    try {
        const backendHost = window.location.hostname;
        labels.forEach(el => el.textContent = "Generating Stipples...");
        
        // Pass opt_depth along to backend
        formData.append('opt_depth', optDepthInput.value);
        
        const response = await fetch(`http://${backendHost}:8000/process-image`, {
            method: 'POST', body: formData
        });

        if (isCancelled) throw new Error('CANCELLED');
        if (!response.ok) throw new Error('Failed to process image');
        
        const data = await response.json();
        const points = data.points;
        const jobId = data.job_id;
        
        currentPoints = points;
        currentTour = null;
        canvas.width = data.width;
        canvas.height = data.height;

        // Store preprocessed and stippled previews
        refImageData.preprocessed = data.preprocessed_image;
        refImageData.stippled = generateStippledPreview(points, data.width, data.height);
        
        // Auto-switch to preprocessed view to show results
        currentRefMode = 'preprocessed';
        updateRefView();
        
        document.getElementById('meta-points').textContent = `${points.length.toLocaleString()} Points`;
        document.querySelectorAll('.stage-meta').forEach(el => el.classList.remove('hidden'));

        drawPoints(ctx, points);

        // Polling logic
        await new Promise((resolve, reject) => {
            const pollInterval = setInterval(async () => {
                if (isCancelled) {
                    clearInterval(pollInterval);
                    try {
                        // Notify backend to cancel
                        const bh = window.location.hostname || "localhost";
                        await fetch(`http://${bh}:8000/cancel-job/${jobId}`, { method: 'POST' });
                        // Try to fetch final partial state one last time
                        const finalRes = await fetch(`http://${bh}:8000/job-status/${jobId}`);
                        if (finalRes.ok) {
                            const finalData = await finalRes.json();
                            if (finalData.tour && finalData.tour.length > 0) {
                                currentTour = finalData.tour;
                                renderTour(ctx, points, currentTour, true);
                            }
                        }
                    } catch (e) { console.warn("Failed final fetch after cancel", e); }
                    reject(new Error('CANCELLED'));
                    return;
                }
                
                try {
                    const statusRes = await fetch(`http://${backendHost}:8000/job-status/${jobId}`);
                    if (!statusRes.ok) return;
                    
                    const statusData = await statusRes.json();
                    
                    if (statusData.status === 'error') {
                        clearInterval(pollInterval);
                        reject(new Error("Backend Error: " + statusData.error));
                        return;
                    }
                    
                    labels.forEach(el => el.textContent = statusData.stage + "...");
                    
                    const val = Math.round(statusData.progress * 100);
                    progressBar.style.width = `${val}%`;
                    percents.forEach(el => el.textContent = `${val}%`);
                    
                    if (statusData.tour && statusData.tour.length > 0) {
                        currentTour = statusData.tour;
                        renderTour(ctx, points, currentTour, statusData.status === 'completed');
                        
                        document.getElementById('meta-tsp').innerHTML = `TSP: <strong>${statusData.distance.toFixed(2)} px</strong>`;
                        document.getElementById('meta-tsp').classList.remove('hidden');
                        
                        if (statusData.greedy_distance > 0) {
                            document.getElementById('meta-greedy').innerHTML = `Greedy: <strong>${statusData.greedy_distance.toFixed(2)} px</strong>`;
                            document.getElementById('meta-greedy').classList.remove('hidden');
                        }
                    }
                    
                    if (statusData.status === 'completed' || statusData.status === 'cancelled') {
                        clearInterval(pollInterval);
                        
                        if (statusData.status === 'completed') {
                            document.getElementById('meta-algo').innerHTML = `Algorithm: <strong>Backend k-opt</strong>`;
                            updateSVG(points, currentTour, data.width, data.height);
                            loading.classList.add('hidden');
                            printBtn.classList.remove('hidden');
                            resolve();
                        } else {
                            reject(new Error('CANCELLED'));
                        }
                    }
                } catch (err) {
                    console.error("Polling error", err);
                }
            }, 1000);
        });
        
    } catch (error) {
        if (error.message === 'CANCELLED') {
            // Keep the partial tour if we have one, just hide loading
            console.log("Job cancelled, keeping partial results");
            if (currentTour) {
                updateSVG(currentPoints, currentTour, canvas.width, canvas.height);
                printBtn.classList.remove('hidden');
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                canvas.classList.remove('has-art');
                placeholder.classList.remove('hidden');
                document.querySelectorAll('.stage-meta').forEach(el => el.classList.add('hidden'));
            }
        } else {
            alert('Error: ' + error.message);
        }
        loading.classList.add('hidden');
    } finally {
        submitBtn.disabled = false;
    }
});

function getThemeColors() {
    const style = getComputedStyle(document.documentElement);
    return {
        line: style.getPropertyValue('--line-color').trim(),
        secondary: style.getPropertyValue('--line-secondary').trim()
    };
}

function drawPoints(ctx, points) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    applyTransform(ctx);
    const colors = getThemeColors();
    ctx.fillStyle = colors.line;
    // Increase stipple size for better visibility
    for (const p of points) ctx.fillRect(p[0], p[1], 1.5, 1.5);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function dist(p1, p2) { return Math.sqrt((p1[0]-p2[0])**2 + (p1[1]-p2[1])**2); }





function doIntersect(p1, p2, p3, p4) {
    function ccw(A, B, C) {
        return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0]);
    }
    return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

function renderTour(ctx, points, tour, isFinal = false) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    applyTransform(ctx);
    const colors = getThemeColors();
    ctx.strokeStyle = isFinal ? colors.line : colors.secondary;
    ctx.lineWidth = 1.0 / transform.scale; // Maintain visual weight while zooming
    ctx.beginPath();
    if (tour.length > 0) {
        ctx.moveTo(points[tour[0]][0], points[tour[0]][1]);
        for (let i = 1; i < tour.length; i++) ctx.lineTo(points[tour[i]][0], points[tour[i]][1]);
        ctx.closePath();
    }
    ctx.stroke();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function reverse(arr, start, end) {
    const n = arr.length;
    let num = (end - start + n) % n;
    for (let i = 0; i <= num / 2; i++) {
        const a = (start + i) % n, b = (end - i + n) % n;
        const t = arr[a]; arr[a] = arr[b]; arr[b] = t;
    }
}

function calculateTourDist(points, tour) {
    let d = 0;
    for (let i = 0; i < tour.length; i++) {
        const p1 = points[tour[i]], p2 = points[tour[(i+1)%tour.length]];
        d += Math.sqrt((p1[0]-p2[0])**2 + (p1[1]-p2[1])**2);
    }
    return d;
}

// --- Canvas Interaction Listeners ---
canvas.addEventListener('mousedown', (e) => {
    if (!currentPoints) return;
    isDragging = true;
    lastMousePos = { x: e.clientX, y: e.clientY };
    canvas.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastMousePos.x;
    const dy = e.clientY - lastMousePos.y;
    transform.x += dx;
    transform.y += dy;
    lastMousePos = { x: e.clientX, y: e.clientY };
    redraw();
});

window.addEventListener('mouseup', () => {
    isDragging = false;
    canvas.style.cursor = 'grab';
});

canvas.addEventListener('wheel', (e) => {
    if (!currentPoints) return;
    e.preventDefault();
    
    const delta = -e.deltaY;
    const factor = Math.pow(1.1, delta / 100);
    
    // Zoom relative to mouse position
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const worldX = (mouseX - transform.x) / transform.scale;
    const worldY = (mouseY - transform.y) / transform.scale;
    
    const newScale = Math.min(Math.max(transform.scale * factor, 0.1), 50);
    
    transform.scale = newScale;
    transform.x = mouseX - worldX * transform.scale;
    transform.y = mouseY - worldY * transform.scale;
    
    redraw();
}, { passive: false });

canvas.addEventListener('dblclick', () => {
    if (!currentPoints) return;
    resetTransform();
});
// ------------------------------------
