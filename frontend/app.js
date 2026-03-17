const themeToggle = document.getElementById('theme-toggle');
const sunIcon = themeToggle.querySelector('.sun');
const moonIcon = themeToggle.querySelector('.moon');
let isCancelled = false;
let currentPoints = null;
let currentTour = null;

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
const fileNameDisplay = document.getElementById('file-name-display');
const referenceSection = document.getElementById('reference-section');
const originalPreview = document.getElementById('original-preview');

const submitBtn = document.getElementById('submit-btn');
const printBtn = document.getElementById('print-btn');
const cancelBtn = document.getElementById('cancel-btn');
const loading = document.getElementById('loading');
const progressBar = document.getElementById('progress-bar');
const labels = document.querySelectorAll('.p-label');
const percents = document.querySelectorAll('.p-percent');
const canvas = document.getElementById('art-canvas');
const ctx = canvas.getContext('2d');

numPointsInput.addEventListener('input', (e) => {
    pointsValue.textContent = `${Number(e.target.value).toLocaleString()} points`;
});

optDepthInput.addEventListener('input', (e) => {
    const val = Math.pow(10, parseFloat(e.target.value));
    optDepthValue.textContent = `${val < 10 ? val.toFixed(1) : Math.round(val)}x depth`;
});

optBreadthInput.addEventListener('input', (e) => {
    optBreadthValue.textContent = `${e.target.value}% of edges`;
});

function handleFile(file) {
    if (!file) return;
    fileNameDisplay.textContent = file.name;
    const reader = new FileReader();
    reader.onload = (e) => {
        originalPreview.src = e.target.result;
        referenceSection.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

printBtn.addEventListener('click', () => { window.print(); });
cancelBtn.addEventListener('click', () => { isCancelled = true; });

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
        const response = await fetch(`http://${backendHost}:8000/process-image`, {
            method: 'POST', body: formData
        });

        await updateProgress(30, "Generating Stipples...", 2000);
        if (isCancelled) throw new Error('CANCELLED');
        if (!response.ok) throw new Error('Failed to process image');
        
        const data = await response.json();
        const points = data.points;
        currentPoints = points;
        currentTour = null;
        canvas.width = data.width;
        canvas.height = data.height;
        
        document.getElementById('meta-points').textContent = `${points.length.toLocaleString()} Points`;
        document.querySelectorAll('.stage-meta').forEach(el => el.classList.remove('hidden'));

        await updateProgress(40, "Rendering Stage...", 500);
        if (isCancelled) throw new Error('CANCELLED');
        drawPoints(ctx, points);

        labels.forEach(el => el.textContent = "Constructing Greedy Skeleton...");
        const tour = await solveGreedyLive(ctx, points, (p) => {
            if (isCancelled) return;
            const val = 40 + (p * 30);
            currentProgress = val;
            progressBar.style.width = `${val}%`;
            percents.forEach(el => el.textContent = `${Math.round(val)}%`);
        });
        if (isCancelled) throw new Error('CANCELLED');
        currentTour = tour;

        labels.forEach(el => el.textContent = "Live Untangling (k-opt)...");
        const optDepthMultiplier = Math.pow(10, parseFloat(optDepthInput.value));
        const optDepth = Math.max(1, Math.ceil(points.length * optDepthMultiplier));
        const optBreadth = (parseInt(optBreadthInput.value) || 25) / 100;
        console.log(`Starting optimization with maxPasses: ${optDepth}, breadth: ${optBreadth}`);
        await optimizeLive(ctx, points, tour, optDepth, optBreadth, (p) => {
            if (isCancelled) return;
            const val = 70 + (p * 30);
            currentProgress = val;
            progressBar.style.width = `${val}%`;
            percents.forEach(el => el.textContent = `${Math.round(val)}%`);
        });
        
        const finalDist = calculateTourDist(points, tour);
        document.getElementById('meta-tsp').innerHTML = `TSP: <strong>${finalDist.toFixed(2)} px</strong>`;
        document.getElementById('meta-algo').innerHTML = `Algorithm: <strong>Spatial Priority k-opt</strong>`;
        
        loading.classList.add('hidden');
        printBtn.classList.remove('hidden');
        
    } catch (error) {
        if (error.message === 'CANCELLED') {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvas.classList.remove('has-art');
            placeholder.classList.remove('hidden');
            document.querySelectorAll('.stage-meta').forEach(el => el.classList.add('hidden'));
        } else {
            alert('Error: ' + error.message);
        }
        loading.classList.add('hidden');
    } finally {
        submitBtn.disabled = false;
        isCancelled = false;
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
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const colors = getThemeColors();
    ctx.fillStyle = colors.line;
    // Increase stipple size for better visibility
    for (const p of points) ctx.fillRect(p[0], p[1], 1.5, 1.5);
}

function dist(p1, p2) { return Math.sqrt((p1[0]-p2[0])**2 + (p1[1]-p2[1])**2); }

async function solveGreedyLive(ctx, points, onProgress) {
    const n = points.length;
    if (n === 0) return [];
    const unvisited = new Set(Array.from({length: n}, (_, i) => i));
    const tour = [];
    const cellSize = 30;
    const grid = new Map();
    for (let i = 0; i < n; i++) {
        const key = `${Math.floor(points[i][0]/cellSize)},${Math.floor(points[i][1]/cellSize)}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(i);
    }
    let currentIdx = 0;
    tour.push(currentIdx);
    unvisited.delete(currentIdx);
    const greedyMeta = document.getElementById('meta-greedy');

    while (unvisited.size > 0) {
        if (isCancelled) return tour;
        const p = points[currentIdx];
        let bestD = Infinity, bestIdx = -1;
        const gx = Math.floor(p[0]/cellSize), gy = Math.floor(p[1]/cellSize);
        let found = false;
        for (let r = 0; r <= 4 && !found; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dy = -r; dy <= r; dy++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const cell = grid.get(`${gx+dx},${gy+dy}`);
                    if (cell) {
                        for (const idx of cell) {
                            if (unvisited.has(idx)) {
                                const d = (p[0]-points[idx][0])**2 + (p[1]-points[idx][1])**2;
                                if (d < bestD) { bestD = d; bestIdx = idx; found = true; }
                            }
                        }
                    }
                }
            }
        }
        if (bestIdx === -1) {
            for (const idx of unvisited) {
                const d = (p[0]-points[idx][0])**2 + (p[1]-points[idx][1])**2;
                if (d < bestD) { bestD = d; bestIdx = idx; }
            }
        }
        tour.push(bestIdx);
        unvisited.delete(bestIdx);
        currentIdx = bestIdx;
        if (tour.length % 500 === 0) {
            renderTour(ctx, points, tour);
            const currentGreedyDist = calculateTourDist(points, tour);
            greedyMeta.innerHTML = `Greedy: <strong>${currentGreedyDist.toFixed(2)} px</strong>`;
            onProgress(tour.length / n);
            await new Promise(r => requestAnimationFrame(r));
        }
    }
    const finalGreedyDist = calculateTourDist(points, tour);
    greedyMeta.innerHTML = `Greedy: <strong>${finalGreedyDist.toFixed(2)} px</strong>`;
    return tour;
}

async function optimizeLive(ctx, points, tour, nodeBudget, optBreadth, onProgress) {
    const n = tour.length;
    if (n < 4) return;
    const tspMeta = document.getElementById('meta-tsp');

    const cellSize = 50;
    const grid = new Map();
    function rebuildGrid() {
        grid.clear();
        for (let i = 0; i < n; i++) {
            const p = points[tour[i]];
            const key = `${Math.floor(p[0]/cellSize)},${Math.floor(p[1]/cellSize)}`;
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key).push(i);
        }
    }

    let movesDone = 0;
    let improved = true;
    let currentDist = calculateTourDist(points, tour);

    while (improved && !isCancelled && movesDone < nodeBudget) {
        improved = false;
        rebuildGrid();

        for (let i = 0; i < n; i++) {
            // UI Yielding for large datasets
            if (i % 2000 === 0) {
                await new Promise(r => requestAnimationFrame(r));
                if (isCancelled) return;
            }

            const t1 = i, t2 = (i + 1) % n;
            const p1 = points[tour[t1]], p2 = points[tour[t2]];
            const d12 = dist(p1, p2);

            const gx = Math.floor(p1[0]/cellSize), gy = Math.floor(p1[1]/cellSize);
            const radius = Math.max(1, Math.ceil(3 * optBreadth));

            for (let dx = -radius; dx <= radius; dx++) {
                for (let dy = -radius; dy <= radius; dy++) {
                    const cell = grid.get(`${gx+dx},${gy+dy}`);
                    if (!cell) continue;

                    for (const t3 of cell) {
                        const t4 = (t3 + 1) % n;
                        if (t1 === t3 || t1 === t4 || t2 === t3) continue;

                        const p3 = points[tour[t3]], p4 = points[tour[t4]];
                        const d34 = dist(p3, p4);
                        const d13 = dist(p1, p3);
                        const d24 = dist(p2, p4);

                        // 2-opt gain: (d12 + d34) - (d13 + d24)
                        const gain = (d12 + d34) - (d13 + d24);

                        if (gain > 0.01) {
                            reverse(tour, t2, t3);
                            currentDist -= gain;
                            improved = true;
                            movesDone++;

                            if (movesDone % 100 === 0) {
                                renderTour(ctx, points, tour, true);
                                tspMeta.innerHTML = `TSP: <strong>${currentDist.toFixed(2)} px</strong>`;
                                onProgress(Math.min(0.99, movesDone / nodeBudget));
                                await new Promise(r => requestAnimationFrame(r));
                                if (isCancelled) return;
                            }
                            break;
                        }
                    }
                    if (improved) break;
                }
                if (improved) break;
            }
        }
    }
    renderTour(ctx, points, tour, true);
}

function doIntersect(p1, p2, p3, p4) {
    function ccw(A, B, C) {
        return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0]);
    }
    return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

function renderTour(ctx, points, tour, isFinal = false) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const colors = getThemeColors();
    ctx.strokeStyle = isFinal ? colors.line : colors.secondary;
    ctx.lineWidth = 1.0; // Increased from 0.8
    ctx.beginPath();
    if (tour.length > 0) {
        ctx.moveTo(points[tour[0]][0], points[tour[0]][1]);
        for (let i = 1; i < tour.length; i++) ctx.lineTo(points[tour[i]][0], points[tour[i]][1]);
        ctx.closePath();
    }
    ctx.stroke();
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
