// ============================================================
// Intervalometer - Time-lapse PWA (Opravená verze)
// ============================================================

const cam = document.getElementById('cam');
const flashEl = document.getElementById('flash');
const frameCountEl = document.getElementById('frameCount');
const dialProgress = document.getElementById('dialProgress');
const elapsedVal = document.getElementById('elapsedVal');
const remainingVal = document.getElementById('remainingVal');
const outputVal = document.getElementById('outputVal');
const switchCamBtn = document.getElementById('switchCamBtn');

const intervalInput = document.getElementById('intervalInput');
const countInput = document.getElementById('countInput');
const durationInput = document.getElementById('durationInput');
const aspectSelect = document.getElementById('aspectSelect');
const countRow = document.getElementById('countRow');
const durationRow = document.getElementById('durationRow');
const resSelect = document.getElementById('resSelect');
const fpsInput = document.getElementById('fpsInput');
const wakeToggle = document.getElementById('wakeToggle');
const startBtn = document.getElementById('startBtn');
const zipBtn = document.getElementById('zipBtn');
const videoBtn = document.getElementById('videoBtn');
const clearBtn = document.getElementById('clearBtn');
const hint = document.getElementById('hint');

const DIAL_CIRCUMFERENCE = 2 * Math.PI * 88;

let frames = [];
let stream = null;
let facingMode = 'environment';
let mode = 'count'; 
let running = false;
let timerHandle = null;
let startedAt = 0;
let wakeLock = null;

// ---------- Kamera ----------
async function startCamera() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode }, width: { ideal: 3840 }, height: { ideal: 2160 } },
      audio: false
    });
    cam.srcObject = stream;
    await cam.play();
  } catch (err) {
    alert('Nepodařilo se spustit kameru: ' + err.message + '\n\nZkontrolujte oprávnění.');
  }
}

switchCamBtn.addEventListener('click', () => {
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  startCamera();
});

// ---------- Přepínač režimů ----------
document.querySelectorAll('.modeBtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.modeBtn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    mode = btn.dataset.mode;
    countRow.style.display = mode === 'count' ? 'flex' : 'none';
    durationRow.style.display = mode === 'duration' ? 'flex' : 'none';
    updateEstimate();
  });
});

[intervalInput, countInput, durationInput, fpsInput, aspectSelect].forEach(el =>
  el.addEventListener('input', updateEstimate)
);

function targetFrameCount() {
  const interval = parseFloat(intervalInput.value) || 1;
  if (mode === 'count') return parseInt(countInput.value) || 0;
  if (mode === 'duration') {
    const totalSec = (parseFloat(durationInput.value) || 0) * 60;
    return Math.floor(totalSec / interval);
  }
  return 0;
}

function updateEstimate() {
  const interval = parseFloat(intervalInput.value) || 1;
  const fps = parseInt(fpsInput.value) || 24;
  const target = targetFrameCount();

  if (mode !== 'infinite' && target > 0) {
    const totalSeconds = target * interval;
    remainingVal.textContent = formatDuration(totalSeconds);
    outputVal.textContent = (target / fps).toFixed(1) + ' s @ ' + fps + ' fps';
  } else {
    remainingVal.textContent = '—';
    outputVal.textContent = (frames.length / fps).toFixed(1) + ' s @ ' + fps + ' fps';
  }
}

function formatDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

// ---------- Wake Lock ----------
async function acquireWakeLock() {
  if (!wakeToggle.checked) return;
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) { console.warn('Wake Lock nedostupný'); }
}

function releaseWakeLock() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

// ---------- Snímání a Ořez Poměru Stran ----------
function targetWidth() {
  const v = resSelect.value;
  if (v === 'hd') return 1280;
  if (v === 'sd') return 854;
  return null; 
}

function captureFrame() {
  const vw = cam.videoWidth;
  const vh = cam.videoHeight;
  const aspectMode = aspectSelect.value;

  let srcX = 0, srcY = 0, srcW = vw, srcH = vh;

  // Výpočet ořezu podle zvoleného poměru stran
  if (aspectMode === '3:2') {
    if (vw / vh > 3 / 2) {
      srcW = vh * (3 / 2); srcX = (vw - srcW) / 2;
    } else {
      srcH = vw / (3 / 2); srcY = (vh - srcH) / 2;
    }
  } else if (aspectMode === '16:9') {
    if (vw / vh > 16 / 9) {
      srcW = vh * (16 / 9); srcX = (vw - srcW) / 2;
    } else {
      srcH = vw / (16 / 9); srcY = (vh - srcH) / 2;
    }
  }

  // Škálování rozlišení výstupu
  let destW = srcW;
  let destH = srcH;
  const tw = targetWidth();
  if (tw && srcW > tw) {
    destW = tw;
    destH = Math.round(srcH * (tw / srcW));
  }

  const canvas = document.createElement('canvas');
  canvas.width = destW; canvas.height = destH;
  const ctx = canvas.getContext('2d');
  
  // Vykreslení vyříznutého středu obrazu
  ctx.drawImage(cam, srcX, srcY, srcW, srcH, 0, 0, destW, destH);

  return new Promise(resolve => {
    canvas.toBlob(blob => {
      frames.push(blob);
      frameCountEl.textContent = frames.length;
      resolve(blob);
    }, 'image/jpeg', 0.90);
  });
}

function flashEffect() {
  flashEl.classList.add('active');
  setTimeout(() => flashEl.classList.remove('active'), 120);
}

// ---------- Ovládání běhu ----------
startBtn.addEventListener('click', () => { running ? stopCapture() : startCapture(); });

async function startCapture() {
  const interval = parseFloat(intervalInput.value) || 1;
  const target = targetFrameCount();

  if (mode === 'count' && target <= 0) return alert('Zadejte cílový počet snímků.');
  
  running = true;
  startedAt = Date.now();
  startBtn.textContent = 'Zastavit';
  startBtn.classList.add('running');
  aspectSelect.disabled = true;
  resSelect.disabled = true;
  [intervalInput, countInput, durationInput].forEach(el => el.disabled = true);
  await acquireWakeLock();

  runElapsedClock();

  const tick = async () => {
    if (!running) return;
    flashEffect();
    await captureFrame();

    if (mode !== 'infinite' && frames.length >= target) {
      finishCapture();
      return;
    }
    updateDialAndRemaining(interval, target);
    timerHandle = setTimeout(tick, interval * 1000);
  };
  updateDialAndRemaining(interval, target);
  tick();
}

function updateDialAndRemaining(interval, target) {
  if (mode !== 'infinite' && target > 0) {
    const frac = Math.min(1, frames.length / target);
    dialProgress.style.strokeDashoffset = DIAL_CIRCUMFERENCE * (1 - frac);
    remainingVal.textContent = formatDuration((target - frames.length) * interval);
  } else {
    dialProgress.style.strokeDashoffset = 0;
  }
  outputVal.textContent = (frames.length / (parseInt(fpsInput.value) || 24)).toFixed(1) + ' s';
}

function runElapsedClock() {
  const tick = () => {
    if (!running) return;
    elapsedVal.textContent = formatDuration((Date.now() - startedAt) / 1000);
    setTimeout(tick, 250);
  };
  tick();
}

function stopCapture() {
  running = false;
  clearTimeout(timerHandle);
  startBtn.textContent = 'Spustit time-lapse';
  startBtn.classList.remove('running');
  aspectSelect.disabled = false;
  resSelect.disabled = false;
  [intervalInput, countInput, durationInput].forEach(el => el.disabled = false);
  releaseWakeLock();
}

function finishCapture() {
  stopCapture();
  hint.textContent = `Hotovo! Zachyceno ${frames.length} snímků. Nyní stáhněte ZIP nebo video.`;
}

clearBtn.addEventListener('click', () => {
  if (frames.length === 0 || !confirm('Smazat všechny snímky?')) return;
  frames = [];
  frameCountEl.textContent = '0';
  dialProgress.style.strokeDashoffset = DIAL_CIRCUMFERENCE;
  updateEstimate();
  hint.textContent = '';
});

// ---------- Export: ZIP ----------
zipBtn.addEventListener('click', async () => {
  if (frames.length === 0) return alert('Žádné snímky ke stažení.');
  zipBtn.textContent = 'Balím ZIP…';
  const zip = new JSZip();
  frames.forEach((blob, i) => {
    zip.file('frame_' + String(i + 1).padStart(5, '0') + '.jpg', blob);
  });
  const content = await zip.generateAsync({ type: 'blob' });
  zipBtn.textContent = 'Stáhnout snímky (ZIP)';
  downloadOrShare(content, 'timelapse_snimky.zip', 'application/zip');
});

// ---------- Export: Video s podporou iOS (Safari) ----------
videoBtn.addEventListener('click', async () => {
  if (frames.length < 2) return alert('Pro video potřebujete alespoň 2 snímky.');
  videoBtn.textContent = 'Renderuji…';
  try {
    const blob = await renderVideo();
    downloadOrShare(blob, 'timelapse_video.mp4', blob.type);
  } catch (e) {
    alert('Sestavení videa selhalo: ' + e.message);
  }
  videoBtn.textContent = 'Sestavit video';
});

function renderVideo() {
  return new Promise(async (resolve, reject) => {
    const fps = Math.max(1, Math.min(60, parseInt(fpsInput.value) || 24));
    const first = await loadImage(frames[0]);
    const canvas = document.createElement('canvas');
    canvas.width = first.width; canvas.height = first.height;
    const ctx = canvas.getContext('2d');

    const canvasStream = canvas.captureStream(fps);
    
    // DETEKCE PODPOROVANÉHO FORMÁTU (Zásadní pro iOS / Android multiplatformitu)
    let options = { mimeType: 'video/mp4;codecs=avc1' }; // Priorita pro iOS Safari
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: 'video/webm;codecs=vp9' }; // Android / Chrome fallback
    }
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: 'video/webm' };
    }

    try {
      const recorder = new MediaRecorder(canvasStream, options);
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.onstop = () => resolve(new Blob(chunks, { type: options.mimeType }));
      recorder.onerror = e => reject(e.error || new Error('Chyba rekordéru'));

      recorder.start();
      const frameDuration = 1000 / fps;

      for (let i = 0; i < frames.length; i++) {
        const img = await loadImage(frames[i]);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        await new Promise(r => setTimeout(r, frameDuration));
      }
      
      setTimeout(() => recorder.stop(), frameDuration * 2);
    } catch (err) {
      reject(new Error("Váš prohlížeč nepodporuje vytváření videa z plátna: " + err.message));
    }
  });
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

// Spolehlivá stahovací funkce
async function downloadOrShare(blob, filename, mime) {
  const file = new File([blob], filename, { type: mime });
  
  // Pokus o sdílení (iOS AirDrop / Uložit do souborů)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { 
      await navigator.share({ files: [file], title: filename }); 
      return; 
    } catch (e) { /* uživatel zavřel ShareSheet - pokračuje download */ }
  }
  
  // Klasické stažení přes skrytý odkaz
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); 
  a.click(); 
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ---------- Inicializace ----------
dialProgress.style.strokeDasharray = DIAL_CIRCUMFERENCE;
dialProgress.style.strokeDashoffset = DIAL_CIRCUMFERENCE;
updateEstimate();
startCamera();
