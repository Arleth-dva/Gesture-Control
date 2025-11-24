// app_module.js
import { detectGestureFromKeypoints } from './classify.js';
import { GestureLogger } from './logger.js';

// Conexiones oficiales de MediaPipe Hands (21 keypoints)
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],        // Pulgar
  [0, 5], [5, 6], [6, 7], [7, 8],        // Índice
  [0, 9], [9,10], [10,11], [11,12],      // Medio
  [0,13], [13,14], [14,15], [15,16],     // Anular
  [0,17], [17,18], [18,19], [19,20]      // Meñique
];

let video = null;
let canvas = null;
let ctx = null;
let detector = null;

let running = false;
let gestureWindow = [];
let VOTE_WINDOW = 7;
let MIN_CONFIRM_MS = 300;

let lastConfirmed = { name: null, since: 0 };
let lastActionTime = 0;
let frameIndex = 0;
let inferenceTimes = [];

function bindDOMElements() {
  video = document.getElementById('video');
  canvas = document.getElementById('output') || document.getElementById('overlay') || document.querySelector('canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'output';
    document.body.insertBefore(canvas, document.body.firstChild);
  }
  ctx = canvas.getContext ? canvas.getContext('2d') : null;
  if (!ctx) {
    console.error('No se pudo obtener contexto de canvas.');
    return false;
  }
  return true;
}

async function ensureHandPoseDetection(timeout = 8000) {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    if (window.handPoseDetection && window.handPoseDetection.createDetector) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  // fallback: intentar importar desde unpkg
  try {
    const mod = await import('https://unpkg.com/@tensorflow-models/hand-pose-detection');
    const api = mod.default || mod;
    if (api && (api.createDetector || api.SupportedModels)) {
      window.handPoseDetection = api;
      return true;
    }
  } catch(e) { /* ignore */ }
  return false;
}

async function createDetector() {
  const ok = await ensureHandPoseDetection(8000);
  if (!ok) {
    console.error('handPoseDetection no disponible.');
    return;
  }
  try {
    detector = await window.handPoseDetection.createDetector(
      window.handPoseDetection.SupportedModels.MediaPipeHands,
      { runtime: 'mediapipe', modelType: 'full', solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands' }
    );
    window.detectorReal = detector; // exponer para debug
    console.log('Detector creado');
  } catch (e) {
    console.error('Error creando detector:', e);
  }
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('API getUserMedia no disponible');
  }
  const constraints = { video: { width: 640, height: 480 } };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;
  await video.play();

  // Asegurar que el element video sea renderizable (no display:none)
  try {
    video.style.display = 'block';
    video.style.position = 'absolute';
    video.style.left = '-9999px';
    video.style.top = '0px';
    video.style.width = (video.videoWidth || 640) + 'px';
    video.style.height = (video.videoHeight || 480) + 'px';
  } catch(e) {
    console.warn('No se pudo aplicar estilo al video:', e);
  }

  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  console.log('Cámara iniciada', canvas.width, 'x', canvas.height);
}

function stopCamera() {
  if (video && video.srcObject && video.srcObject.getTracks) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
}

function clearGestureWindow() {
  gestureWindow = [];
  lastConfirmed = { name: null, since: 0 };
}

function majorityVote(windowArr) {
  if (!windowArr || windowArr.length === 0) return { name: 'none', score: 0, count: 0 };
  const counts = {};
  for (const g of windowArr) counts[g.name] = (counts[g.name] || 0) + 1;
  let best = null, bestC = 0;
  for (const k of Object.keys(counts)) if (counts[k] > bestC) { best = k; bestC = counts[k]; }
  const scores = windowArr.filter(x => x.name === best).map(x => x.score || 0);
  const avgScore = scores.length ? (scores.reduce((a,b)=>a+b,0)/scores.length) : 0;
  return { name: best, score: avgScore, count: bestC };
}

function drawLandmarks(keypoints) {
  if (!ctx || !video) return;

  // Dibujar frame del video
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // === DIBUJAR HUESOS (líneas entre keypoints) ===
  ctx.strokeStyle = "#00eaff";
  ctx.lineWidth = 3;

  for (const [start, end] of HAND_CONNECTIONS) {
    const a = keypoints[start];
    const b = keypoints[end];
    if (!a || !b) continue;

    const ax = a.x * canvas.width;
    const ay = a.y * canvas.height;
    const bx = b.x * canvas.width;
    const by = b.y * canvas.height;

    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  // === DIBUJAR PUNTOS ===
  ctx.fillStyle = "#ff0055";
  for (const kp of keypoints) {
    const x = kp.x * canvas.width;
    const y = kp.y * canvas.height;

    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // === TEXTO DEL GESTO ===
  const pred = gestureWindow.slice(-1)[0] || { name: "—", score: 0 };

  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(8, 8, 260, 30);

  ctx.fillStyle = "#fff";
  ctx.font = "16px sans-serif";
  ctx.fillText(`Pred: ${pred.name}  (${pred.score.toFixed(2)})`, 12, 30);
}


async function processFrame() {
  if (!detector || !video || video.readyState < 2 || video.videoWidth === 0) {
    requestAnimationFrame(processFrame);
    return;
  }
  frameIndex++;
  const t0 = performance.now();
  let hands = [];
  try {
    hands = await detector.estimateHands(video, { flipHorizontal: true });
  } catch (e) {
    console.error('estimateHands error:', e);
  }
  const t1 = performance.now();
  inferenceTimes.push(t1 - t0);
  if (inferenceTimes.length > 30) inferenceTimes.shift();

  if (!hands || hands.length === 0) {
    clearGestureWindow();
    updateUIStatus('sin mano');
    requestAnimationFrame(processFrame);
    return;
  }

  const hand = hands[0];
  const keypoints = hand.keypoints || hand.landmarks || hand;

  drawLandmarks(keypoints);

  const g = detectGestureFromKeypoints(keypoints, canvas.width, canvas.height);
  gestureWindow.push(g);
  if (gestureWindow.length > VOTE_WINDOW) gestureWindow.shift();

  const vote = majorityVote(gestureWindow);
  const now = performance.now();

  if (vote.name !== lastConfirmed.name) {
    if (!lastConfirmed.since) lastConfirmed.since = now;
    if (now - lastConfirmed.since >= MIN_CONFIRM_MS && vote.count >= Math.ceil(VOTE_WINDOW * 0.6)) {
      lastConfirmed = { name: vote.name, since: now };
      onGestureConfirmed(vote.name, vote.score);
    }
  } else {
    lastConfirmed.since = now;
  }

  GestureLogger.add({
    frameIndex,
    predictedGesture: g.name,
    confidence: g.score,
    fps: computeAvgFPS(),
    landmarks: (Array.isArray(keypoints) ? keypoints : []).map(k => ({ x: k.x !== undefined ? k.x : k[0], y: k.y !== undefined ? k.y : k[1], z: k.z || 0 }))
  });

  updateLogPreview();

  requestAnimationFrame(processFrame);
}

function computeAvgFPS() {
  if (!inferenceTimes.length) return 0;
  const avg = inferenceTimes.reduce((a,b) => a + b, 0) / inferenceTimes.length;
  return +(1000 / avg).toFixed(1);
}

function updateUIStatus(text) {
  const el = document.getElementById('statusLine');
  if (el) el.innerText = `Gesto: ${lastConfirmed.name || '—'}   Confianza: —   FPS: ${computeAvgFPS()}`;
}

function updateLogPreview() {
  const preview = document.getElementById('logPreview');
  if (!preview) return;
  const last = GestureLogger.logs.slice(-8).map(r => `${r.recorded_at} — ${r.predictedGesture} (${(r.confidence||0).toFixed(2)})`);
  preview.innerText = last.join('\n');
}

function onGestureConfirmed(name, score) {
  const now = performance.now();
  if (now - lastActionTime < 200) return;
  lastActionTime = now;
  console.log('Gesto confirmado:', name, 'score', score);
  const el = document.getElementById('statusLine');
  if (el) el.innerText = `Gesto: ${name}   Confianza: ${score.toFixed(2)}   FPS: ${computeAvgFPS()}`;
}

async function init() {
  if (!bindDOMElements()) return;
  const smoothInput = document.getElementById('smoothWindow');
  const cooldownInput = document.getElementById('cooldownMs');
  VOTE_WINDOW = Math.max(1, parseInt(smoothInput?.value || '7'));
  MIN_CONFIRM_MS = Math.max(0, parseInt(cooldownInput?.value || '300'));

  try {
    await startCamera();
  } catch (e) {
    console.error('startCamera error', e);
    alert('No se pudo iniciar la cámara: ' + (e.message || e));
    return;
  }

  await createDetector();
  if (!detector) {
    console.error('Detector no creado — revisa consola para más detalles.');
    alert('Detector no pudo crearse. Mira la consola para errores.');
    return;
  }
  running = true;
  processFrame();
}

document.addEventListener('DOMContentLoaded', () => {
  bindDOMElements();

  document.getElementById('requestCameraBtn')?.addEventListener('click', async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      alert('Permiso de cámara concedido (si el navegador lo solicitó). Ahora presiona Start.');
    } catch (e) {
      alert('Permiso de cámara denegado o no disponible: ' + (e.message || e));
    }
  });

  document.getElementById('startBtn')?.addEventListener('click', async () => { init(); });
  document.getElementById('stopBtn')?.addEventListener('click', () => { stopCamera(); running = false; });
  document.getElementById('exportBtn')?.addEventListener('click', () => {
    GestureLogger.exportJSON('gesture_logs.json', { deviceResolution: `${video?.videoWidth || 0}x${video?.videoHeight || 0}`});
  });
});


// python -m http.server 8000 //
// http://localhost:8000/web/ //

