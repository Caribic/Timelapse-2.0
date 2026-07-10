// ============================================================
// Intervalometer - Time-lapse PWA
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

const DIAL_CIRCUMFERENCE = 2 * Math.PI * 88; // musí odpovídat r=88 v SVG a stroke-dasharray v CSS

let frames = [];
let stream = null;
let facingMode = 'environment';
let mode = 'count'; // 'count' | 'duration' | 'infinite'
let running = false;
let timerHandle = null;
let startedAt = 0;
let wakeLock = null;

// ---------- Kamera ----------

async function startCamera() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode } },
      audio: false
    });
    cam.srcObject = stream;
    await cam.play();
  } catch (err) {
    alert('Nepodařilo se spustit kameru: ' + err.message +
      '\n\nZkontroluj přístup ke kameře v Nastavení a že stránka běží na HTTPS.');
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

[intervalInput, countInput, durationInput, fpsInput].forEach(el =>
  el.addEventListener('input', updateEstimate)
);

function targetFrameCount() {
  const interval = parseFloat(intervalInput.value) || 1;
  if (mode === 'count') return parseInt(countInput.value) || 0;
  if (mode === 'duration') {
    const totalSec = (parseFloat(durationInput.value) || 0) * 60;
    return Math.floor(totalSec / interval);
  }
  return 0; // infinite
}

function updateEstimate() {
  const interval = parseFloat(intervalInput.value) || 1;
  const fps = parseInt(fpsInput.value) || 24;
  const target = targetFrameCount();

  if (mode !== 'infinite' && target > 0) {
    const totalSeconds = target * interval;
    remainingVal.textContent = formatDuration(totalSeconds);
    outputVal.textContent = (target / fps).toFixed(1) + ' s @ ' + fps + 'fps';
  } else {
    remainingVal.textContent = '—';
    outputVal.textContent = (frames.length / fps).toFixed(1) + ' s @ ' + fps + 'fps';
  }
}

function formatDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

// ---------- Wake Lock (obrazovka nezhasne během běhu) ----------

async function acquireWakeLock() {
  if (!wakeToggle.checked) return;
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (e) {
    console.warn('Wake Lock se nepodařilo získat:', e);
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

document.addEventListener('visibilitychange', async () => {
  if (running && document.visibilityState === 'visible' && wakeToggle.checked) {
    await acquireWakeLock();
  }
});

// ---------- Zvuk závěrky ----------

function playShutterSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) { /* ignore */ }
}

// ---------- Rozlišení snímků ----------

function targetWidth() {
  const v = resSelect.value;
  if (v === 'hd') return 1280;
  if (v === 'sd') return 854;
  return null; // full
}

function captureFrame() {
  const vw = cam.videoWidth, vh = cam.videoHeight;
  let w = vw, h = vh;
  const tw = targetWidth();
  if (tw && vw > tw) {
    w = tw;
    h = Math.round(vh * (tw / vw));
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(cam, 0, 0, w, h);

  return new Promise(resolve => {
    canvas.toBlob(blob => {
      frames.push(blob);
      frameCountEl.textContent = frames.length;
      resolve(blob);
    }, 'image/jpeg', 0.88);
  });
}

function flashEffect() {
  flashEl.classList.add('active');
  setTimeout(() => flashEl.classList.remove('active'), 160);
  playShutterSound();
}

// ---------- Hlavní smyčka ----------

startBtn.addEventListener('click', () => {
  running ? stopCapture() : startCapture();
});

async function startCapture() {
  const interval = parseFloat(intervalInput.value) || 1;
  const target = targetFrameCount();

  if (mode === 'count' && target <= 0) { alert('Zadej platný cílový počet snímků.'); return; }
  if (mode === 'duration' && target <= 0) { alert('Zadaná doba trvání je s tímto intervalem příliš krátká na alespoň 1 snímek.'); return; }

  running = true;
  startedAt = Date.now();
  startBtn.textContent = 'Zastavit time-lapse';
  startBtn.classList.add('running');
  lockSettingInputs(true);
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
    const remainingShots = target - frames.length;
    remainingVal.textContent = formatDuration(remainingShots * interval);
  } else {
    dialProgress.style.strokeDashoffset = 0;
  }
  outputVal.textContent = (frames.length / (parseInt(fpsInput.value) || 24)).toFixed(1) + ' s @ ' + fpsInput.value + 'fps';
}

function runElapsedClock() {
  const tick = () => {
    if (!running) return;
    elapsedVal.textContent = formatDuration((Date.now() - startedAt) / 1000);
    requestAnimationFrame(() => setTimeout(tick, 250));
  };
  tick();
}

function finishCapture() {
  stopCapture();
  hint.textContent = 'Time-lapse dokončen — ' + frames.length + ' snímků. Teď je můžeš stáhnout jako ZIP nebo sestavit video.';
}

function stopCapture() {
  running = false;
  clearTimeout(timerHandle);
  startBtn.textContent = 'Spustit time-lapse';
  startBtn.classList.remove('running');
  lockSettingInputs(false);
  releaseWakeLock();
}

function lockSettingInputs(disabled) {
  [intervalInput, countInput, durationInput, resSelect].forEach(el => el.disabled = disabled);
  document.querySelectorAll('.modeBtn').forEach(b => b.disabled = disabled);
}

// ---------- Smazat vše ----------

clearBtn.addEventListener('click', () => {
  if (frames.length === 0) return;
  if (confirm('Opravdu smazat všech ' + frames.length + ' snímků?')) {
    frames = [];
    frameCountEl.textContent = '0';
    dialProgress.style.strokeDashoffset = DIAL_CIRCUMFERENCE;
    updateEstimate();
    hint.textContent = '';
  }
});

// ---------- Export: ZIP ----------

zipBtn.addEventListener('click', async () => {
  if (frames.length === 0) { alert('Nejsou žádné snímky ke stažení.'); return; }
  zipBtn.textContent = 'Balím…';
  const zip = new JSZip();
  frames.forEach((blob, i) => {
    zip.file('frame_' + String(i + 1).padStart(5, '0') + '.jpg', blob);
  });
  const content = await zip.generateAsync({ type: 'blob' });
  zipBtn.textContent = 'Stáhnout snímky (ZIP)';
  downloadOrShare(content, 'timelapse_snimky.zip', 'application/zip');
});

// ---------- Export: video ----------

videoBtn.addEventListener('click', async () => {
  if (frames.length < 2) { alert('Potřebuješ alespoň 2 snímky pro sestavení videa.'); return; }
  videoBtn.textContent = 'Renderuji…';
  try {
    const blob = await renderVideo();
    downloadOrShare(blob, 'timelapse_video.webm', 'video/webm');
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
    const recorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm;codecs=vp9' });
    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    recorder.onerror = e => reject(e.error || new Error('MediaRecorder error'));

    recorder.start();
    const frameDuration = 1000 / fps;
    for (let i = 0; i < frames.length; i++) {
      const img = await loadImage(frames[i]);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      await sleep(frameDuration);
    }
    await sleep(frameDuration * 2);
    recorder.stop();
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function downloadOrShare(blob, filename, mime) {
  const file = new File([blob], filename, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; }
    catch (e) { /* uživatel zrušil - zkusíme klasické stažení */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ---------- Inicializace ----------

dialProgress.style.strokeDasharray = DIAL_CIRCUMFERENCE;
dialProgress.style.strokeDashoffset = DIAL_CIRCUMFERENCE;
hint.textContent = 'Tip: nech telefon připojený k nabíječce a Safari na popředí — dlouhé time-lapsy na pozadí iOS po čase uspí.';
updateEstimate();
startCamera();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
