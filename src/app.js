// app.js - GestureControl (versión robusta + nodos/esqueleto)
// Requisitos: acceder desde http://localhost:8080 y permitir la cámara

// --- DOM
const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const gestureLabel = document.getElementById('gesture');
const confLabel = document.getElementById('confidence') || { innerText: '—' };
const fpsLabel = document.getElementById('fps') || { innerText: '—' };
const thresholdEl = document.getElementById('threshold');
const smoothWindowEl = document.getElementById('smoothWindow');
const cooldownMsEl = document.getElementById('cooldownMs');

const actFistSel = document.getElementById('actFist');
const actOpenSel = document.getElementById('actOpen');
const actPointSel = document.getElementById('actPoint');

const btnToggle = document.getElementById('btnToggle');
const btnCalibrate = document.getElementById('btnCalibrate');
const btnRequestNotif = document.getElementById('btnRequestNotif');

const logArea = document.getElementById('logArea');
const btnExport = document.getElementById('btnExport');
const btnClear = document.getElementById('btnClear');

const actionToast = document.getElementById('actionToast');

// --- Estado global
let detector = null;
let running = true;
let logs = [];
let lastActionTs = {};
const DEFAULT_COOLDOWN = 1200;

let smoothingWindow = parseInt(smoothWindowEl?.value || 5);
let gestureWindow = [];
let frameCount = 0;
let lastFpsTime = performance.now();

// --- Audio
let audioCtx;
try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
function beep(freq = 800, duration = 0.08) {
  if (!audioCtx) return;
  try {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.value = 0.08;
    o.start();
    setTimeout(()=> o.stop(), duration * 1000);
  } catch (e) { console.warn('Audio error', e); }
}

// --- UI helpers
function showToast(text) {
  if (!actionToast) return;
  actionToast.innerText = text;
  actionToast.style.display = 'block';
  actionToast.style.opacity = '1';
  setTimeout(()=> { actionToast.style.display = 'none'; }, 700);
}

// --- Logging
function addLog(gesture, score) {
  const ts = new Date().toISOString();
  logs.unshift({ ts, gesture, score });
  while (logs.length > 500) logs.pop();
  renderLogs();
  try { localStorage.setItem('gesture_logs', JSON.stringify(logs.slice(0,200))); } catch(e){}
}
function renderLogs() {
  if (!logArea) return;
  logArea.innerHTML = logs.slice(0,100).map(l => `<div><strong>${l.gesture}</strong> ${(l.score*100||0).toFixed(0)}% — ${l.ts}</div>`).join('');
}

// --- Heurística para detectar 3 gestos
function detectGestureFromKeypoints(keypoints, canvasW, canvasH) {
  if (!keypoints || keypoints.length < 21) return { name: 'none', score: 0 };
  const p = i => keypoints[i];
  const wrist = p(0);
  const indexTip = p(8), middleTip = p(12), ringTip = p(16), pinkyTip = p(20);

  const dist = (a,b) => Math.hypot((a.x-b.x)*canvasW, (a.y-b.y)*canvasH);

  const avgTipDist = (dist(indexTip,wrist) + dist(middleTip,wrist) + dist(ringTip,wrist) + dist(pinkyTip,wrist)) / 4;

  // Puño
  if (avgTipDist < 45) {
    const score = Math.max(0.6, 1 - avgTipDist/60);
    return { name: 'puño', score };
  }

  // Mano abierta (tips arriba del muñeca significativamente)
  const avgTipY = (indexTip.y + middleTip.y + ringTip.y + pinkyTip.y) / 4;
  if ((wrist.y - avgTipY) * canvasH > 90) {
    const score = Math.min(1, ((wrist.y - avgTipY) * canvasH) / 160);
    return { name: 'mano_abierta', score };
  }

  // Apuntar (índice separado del medio)
  const indexMidDist = dist(indexTip, middleTip);
  if (indexMidDist > 36) {
    const score = Math.min(1, indexMidDist/120);
    return { name: 'apuntar', score };
  }

  return { name: 'desconocido', score: 0.2 };
}

// --- Suavizado (votación)
function pushGestureToWindow(g) {
  gestureWindow.push(g);
  const maxLen = smoothingWindow;
  if (gestureWindow.length > maxLen) gestureWindow.shift();
  const counts = {};
  for (const x of gestureWindow) counts[x] = (counts[x]||0) + 1;
  let winner = 'none', best = 0;
  for (const k in counts) {
    if (counts[k] > best && k !== 'desconocido' && k !== 'none') { best = counts[k]; winner = k; }
  }
  if (best >= Math.ceil(maxLen / 2)) return winner;
  return 'none';
}

// --- Acción mapeada y cooldown
function doMappedAction(gestureName) {
  const now = Date.now();
  const cooldown = parseInt(cooldownMsEl?.value || DEFAULT_COOLDOWN);
  if (!gestureName || gestureName === 'none' || gestureName === 'desconocido') return;

  let action = null;
  if (gestureName === 'puño') action = actFistSel?.value;
  else if (gestureName === 'mano_abierta') action = actOpenSel?.value;
  else if (gestureName === 'apuntar') action = actPointSel?.value;
  if (!action) return;

  if (lastActionTs[action] && (now - lastActionTs[action]) < cooldown) return;
  lastActionTs[action] = now;

  if (action === 'play') showToast('Play/Pause');
  else if (action === 'next') showToast('Next');
  else if (action === 'prev') showToast('Prev');

  beep();
  addLog(`${gestureName} -> ${action}`, 1.0);
}

// --- drawKeypointsAndSkeleton (robusto, maneja coords normalizadas o en px)
function drawKeypointsAndSkeleton(keypoints, canvasW, canvasH) {
  const show = document.getElementById('showNodes');
  if (!show || !show.checked) {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    return;
  }
  if (!keypoints || keypoints.length === 0) {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    return;
  }

  // detectar si coords ya están en pixeles
  let coordsArePixels = false;
  for (let kp of keypoints) {
    if (kp.x > 1.5 || kp.y > 1.5) { coordsArePixels = true; break; }
  }
  const toPixel = (kp) => {
    if (coordsArePixels) return { x: kp.x, y: kp.y, z: kp.z, score: kp.score || (kp.score === 0 ? 0 : 1) };
    return { x: kp.x * canvasW, y: kp.y * canvasH, z: kp.z, score: kp.score || (kp.score === 0 ? 0 : 1) };
  };

  ctx.clearRect(0,0,canvas.width,canvas.height);

  const colors = {
    thumb: '#FF6B6B', index: '#FFD93D', middle: '#6BF178',
    ring: '#6BC7FF', pinky: '#C18CFF', wrist: '#FFFFFF', default: '#06b6d4'
  };

  const connections = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [0,9],[9,10],[10,11],[11,12],
    [0,13],[13,14],[14,15],[15,16],
    [0,17],[17,18],[18,19],[19,20]
  ];

  // skeleton lines
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(6,182,212,0.8)';
  ctx.beginPath();
  for (const [a,b] of connections) {
    const pa = toPixel(keypoints[a]), pb = toPixel(keypoints[b]);
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
  }
  ctx.stroke();

  // points
  for (let i = 0; i < keypoints.length; i++) {
    const raw = keypoints[i];
    const p = toPixel(raw);
    let color = colors.default;
    if (i === 0) color = colors.wrist;
    else if (i >= 1 && i <= 4) color = colors.thumb;
    else if (i >= 5 && i <= 8) color = colors.index;
    else if (i >= 9 && i <= 12) color = colors.middle;
    else if (i >= 13 && i <= 16) color = colors.ring;
    else if (i >= 17 && i <= 20) color = colors.pinky;

    const score = raw.score || raw.visibility || 1.0;
    const radius = 4 + Math.min(6, Math.round(score * 6));

    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.strokeStyle = '#00000066';
    ctx.lineWidth = 1;
    ctx.arc(p.x, p.y, radius, 0, Math.PI*2);
    ctx.fill();
    ctx.stroke();

    const showLabels = document.getElementById('showLabels');
    if (showLabels && showLabels.checked) {
      ctx.font = '12px Inter, Arial';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${i}${typeof score === 'number' ? ' ' + Math.round(score*100) + '%' : ''}`, p.x + 6, p.y - 6);
    }
  }
}

// --- loadDetector (forzar backend y crear detector)
async function loadDetector(preferFull = true) {
  try {
    if (typeof tf !== 'undefined' && tf.setBackend) {
      try {
        await tf.setBackend('webgl');
        await tf.ready();
        console.log('TF backend forzado a', tf.getBackend());
      } catch (be) {
        console.warn('No se pudo forzar WebGL; backend actual:', (tf.getBackend ? tf.getBackend() : 'unknown'), be);
      }
    } else {
      console.warn('tf no definido o no soporta setBackend');
    }

    if (typeof handPoseDetection === 'undefined') {
      throw new Error('handPoseDetection no está definido. Revisa que el script del modelo esté cargado BEFORE app.js');
    }

    const model = handPoseDetection.SupportedModels.MediaPipeHands;
    const modelType = preferFull ? 'full' : 'lite';
    detector = await handPoseDetection.createDetector(model, { runtime: 'tfjs', modelType });
    console.log('Detector creado, modelType=', modelType, detector);
  } catch (err) {
    console.error('Error creando detector en loadDetector():', err);
    throw err;
  }
}

// --- requestCamera robusta
async function requestCamera() {
  try {
    const constraints = {
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;

    try { await video.play(); } catch(e) { console.warn('video.play() falló:', e); }

    await new Promise((resolve, reject) => {
      const maxWait = 3000;
      const start = performance.now();
      function check() {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          console.log('Camera stream OK. Resolution:', video.videoWidth, 'x', video.videoHeight);
          resolve();
        } else {
          if (performance.now() - start > maxWait) {
            reject(new Error('Timeout waiting for video dimensions (videoWidth/videoHeight still 0).'));
          } else {
            requestAnimationFrame(check);
          }
        }
      }
      check();
    });
  } catch (e) {
    console.error('requestCamera error:', e);
    alert('No se pudo acceder a la cámara. Revisa permisos y que la página esté en localhost/https.');
    throw e;
  }
}

// --- Loop principal
async function loop() {
  if (!running) { requestAnimationFrame(loop); return; }
  if (!detector) { requestAnimationFrame(loop); return; }

  if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
    if (video && video.videoWidth > 0 && video.videoHeight > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    } else {
      if (Math.round(performance.now()) % 2000 < 30) console.warn('Video dimensions not ready yet:', video && video.videoWidth, video && video.videoHeight);
      requestAnimationFrame(loop);
      return;
    }
  }

  try {
    const hands = await detector.estimateHands(video, { flipHorizontal: true });

    // fps
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime > 500) {
      const fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
      if (fpsLabel) fpsLabel.innerText = fps;
      lastFpsTime = now;
      frameCount = 0;
    }

    if (hands && hands.length > 0) {
      const hand = hands[0];
      const keypoints = hand.keypoints;
      // log temporal: muestra sample (útil para debugging)
      // console.log('Keypoints sample:', keypoints.slice(0,5));
      drawKeypointsAndSkeleton(keypoints, canvas.width, canvas.height);

      const res = detectGestureFromKeypoints(keypoints, canvas.width, canvas.height);

      smoothingWindow = parseInt(smoothWindowEl?.value || 5);

      gestureWindow.push(res.name);
      if (gestureWindow.length > smoothingWindow) gestureWindow.shift();
      const counts = {};
      for (const g of gestureWindow) counts[g] = (counts[g]||0) + 1;
      let win = 'none', best = 0;
      for (const k in counts) {
        if (counts[k] > best && k !== 'desconocido' && k !== 'none') { best = counts[k]; win = k; }
      }
      const votedGesture = (best >= Math.ceil(smoothingWindow/2)) ? win : 'none';

      gestureLabel.innerText = res.name === 'desconocido' ? '—' : res.name;
      if (confLabel) confLabel.innerText = (res.score*100).toFixed(0) + '%';

      if (votedGesture && votedGesture !== 'none') {
        doMappedAction(votedGesture);
      }
    } else {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      gestureLabel.innerText = '—';
      if (confLabel) confLabel.innerText = '—';
    }
  } catch (err) {
    console.error('Loop error', err);
  }
  requestAnimationFrame(loop);
}

// --- Inicialización
async function init() {
  btnToggle && (btnToggle.onclick = () => {
    running = !running;
    btnToggle.innerText = running ? 'Detener' : 'Iniciar';
    if (running) requestAnimationFrame(loop);
  });
  btnCalibrate && (btnCalibrate.onclick = async () => { await requestCamera(); });
  btnRequestNotif && (btnRequestNotif.onclick = async () => {
    if ('Notification' in window) {
      const p = await Notification.requestPermission();
      alert('Permiso notificación: ' + p);
    } else alert('Notifications API no soportada');
  });
  btnExport && (btnExport.onclick = () => {
    const data = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs));
    const a = document.createElement('a');
    a.href = data; a.download = `gesture_logs_${new Date().toISOString()}.json`; document.body.appendChild(a); a.click(); a.remove();
  });
  btnClear && (btnClear.onclick = () => { logs = []; renderLogs(); localStorage.removeItem('gesture_logs'); });

  try {
    const saved = localStorage.getItem('gesture_logs');
    if (saved) { logs = JSON.parse(saved); renderLogs(); }
  } catch(e){}

  await requestCamera();

  await loadDetector(true);
  console.log('Detector listo:', detector);

  requestAnimationFrame(loop);
}

// arrancar
init().catch(e => console.error('Init error', e));
