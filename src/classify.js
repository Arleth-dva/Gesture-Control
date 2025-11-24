// classify.js
export function toPx(kp, canvasW, canvasH) {
  return { x: (kp.x !== undefined ? kp.x : kp[0]) * canvasW, y: (kp.y !== undefined ? kp.y : kp[1]) * canvasH, z: kp.z || 0 };
}
export function dist(a,b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function palmSizePx(landmarks, canvasW, canvasH) {
  if (!landmarks || landmarks.length < 10) return 1;
  const wrist = toPx(landmarks[0], canvasW, canvasH);
  const iMCP = toPx(landmarks[5], canvasW, canvasH);
  const mMCP = toPx(landmarks[9], canvasW, canvasH);
  return Math.max(1, (dist(wrist, iMCP) + dist(wrist, mMCP)) / 2);
}

export function detectGestureFromKeypoints(landmarks, canvasW, canvasH, opts={}) {
  if (!landmarks || landmarks.length < 21) return { name: 'none', score: 0 };

  const p = i => landmarks[i];
  const wrist = toPx(p(0), canvasW, canvasH);
  const indexTip = toPx(p(8), canvasW, canvasH);
  const middleTip = toPx(p(12), canvasW, canvasH);
  const ringTip = toPx(p(16), canvasW, canvasH);
  const pinkyTip = toPx(p(20), canvasW, canvasH);
  const indexMCP = toPx(p(5), canvasW, canvasH);

  const palmSize = palmSizePx(landmarks, canvasW, canvasH);

  const tipDistAvg = (dist(indexTip, wrist) + dist(middleTip, wrist) + dist(ringTip, wrist) + dist(pinkyTip, wrist)) / 4;

  // parámetros relativos (ajustables)
  const openThresh = opts.openThresh || 1.4;     // umbral mano abierta
  const fistThresh = opts.fistThresh || 0.85;    // umbral puño
  const pointSepThresh = opts.pointSepThresh || 0.95; // separación índice/medio => apuntar
  const minScore = 0.2;

  // Puño
  if (tipDistAvg / palmSize < fistThresh) {
    const score = Math.max(minScore, 1 - (tipDistAvg / (palmSize * fistThresh)));
    return { name: 'puño', score };
  }

  // Mano abierta
  if (tipDistAvg / palmSize > openThresh) {
    const score = Math.min(1, (tipDistAvg / (palmSize * openThresh)));
    return { name: 'mano_abierta', score };
  }

  // Apuntar (índice separado del medio y índice extendido)
  const indexMidSep = dist(indexTip, middleTip);
  if (indexMidSep / palmSize > pointSepThresh && (dist(indexTip, indexMCP) / palmSize) > 0.8) {
    const score = Math.min(1, (indexMidSep / (palmSize * pointSepThresh)));
    return { name: 'apuntar', score };
  }

  return { name: 'desconocido', score: 0.2 };
}
