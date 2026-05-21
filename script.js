// SnapTogether — script.js
// Zero external dependencies beyond PeerJS.
// Background replacement uses a simple first-frame subtraction method:
// captures a background reference frame before the person enters,
// then subtracts it per-pixel to isolate the person.

// ── State ─────────────────────────────────────────────────────────────────────
let peer = null, conn = null, mediaConn = null;
let localStream = null, remoteStream = null;
let isSolo = false;
let bestieConnected = false, stripRunning = false;
let myName = 'You', remoteName = 'Bestie';
let currentFilter = 'none';
let selectedBg = 'none';
let stickers = [];
let capturedPhotos = [];
let rafId = null;

// Background calibration
let bgCalibrated = false;
let bgRefData = null;        // ImageData of the empty background frame
let calibCanvas = null;
let calibCtx = null;
let maskCanvas = null;
let maskCtx = null;

// Canvas resolution
const HALF_W = 480, HALF_H = 360;
const FULL_W = HALF_W * 2, FULL_H = HALF_H;

// Solid background colours
const BG_COLORS = {
  none:  null,
  blush: '#e8b4b8',
  sage:  '#8aab96',
  navy:  '#2c3e6b',
  cream: '#f0e6d3',
  black: '#1a1a1a',
};

// ── DOM ───────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const lobbyEl        = $('lobby');
const createRoomBtn  = $('createRoomBtn');
const joinRoomBtn    = $('joinRoomBtn');
const copyCodeBtn    = $('copyCodeBtn');
const roomCodeDisplay = $('roomCodeDisplay');
const roomCodeText   = $('roomCodeText');
const waitingMsg     = $('waitingMsg');
const lobbyStatus    = $('lobbyStatus');
const soloBtn        = $('soloBtn');
const yourNameCreate = $('yourNameCreate');
const yourNameJoin   = $('yourNameJoin');
const joinCodeInput  = $('joinCodeInput');
const localVideo     = $('localVideo');
const remoteVideo    = $('remoteVideo');
const previewCanvas  = $('previewCanvas');
const countdownOverlay = $('countdownOverlay');
const flashOverlay   = $('flashOverlay');
const captureBtn     = $('captureBtn');
const captureStatus  = $('captureStatus');
const captionInput   = $('captionInput');
const myLabel        = $('myLabel');
const remoteLabel    = $('remoteLabel');
const roomBadge      = $('roomBadge');
const leaveBtn       = $('leaveBtn');
const clearStickersBtn = $('clearStickersBtn');
const connStatus     = $('connStatus');
const connLabel      = $('connLabel');
const toastEl        = $('toast');
const stripCanvas    = $('stripCanvas');
const downloadBtn    = $('downloadBtn');
const retakeBtn      = $('retakeBtn');
const captureCanvas  = $('captureCanvas');
const bgHint         = $('bgHint');
const calibrateBtn   = $('calibrateBtn');

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, dur = 3000) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), dur);
}

// ── Connection status ─────────────────────────────────────────────────────────
function setConnStatus(state, label) {
  connStatus.className = 'conn-status ' + state;
  connLabel.textContent = label;
}
function updateCaptureBtn() {
  const ready = isSolo || bestieConnected;
  captureBtn.disabled = !ready || stripRunning;
  captureBtn.title = ready ? '' : 'Waiting for your bestie to connect…';
}

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ── Screen switcher ───────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
  if (id === 'booth') startPreviewLoop();
  else stopPreviewLoop();
}

// ── Camera ────────────────────────────────────────────────────────────────────
async function startCamera() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .catch(() => { throw new Error('camera'); });
  localVideo.srcObject = localStream;
  await localVideo.play().catch(() => {});
}

// ── Background calibration ────────────────────────────────────────────────────
// User clicks "Calibrate" while NOT in frame — we snapshot the empty background.
// Then per-frame we compare pixels to this reference and mask the person out.

function initCalibCanvas() {
  if (calibCanvas) return;
  calibCanvas = document.createElement('canvas');
  calibCanvas.width = HALF_W; calibCanvas.height = HALF_H;
  calibCtx = calibCanvas.getContext('2d', { willReadFrequently: true });
  maskCanvas = document.createElement('canvas');
  maskCanvas.width = HALF_W; maskCanvas.height = HALF_H;
  maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
}

function calibrateBackground() {
  if (localVideo.readyState < 2) {
    showToast('Camera not ready yet — try again in a moment');
    return;
  }
  initCalibCanvas();
  calibCtx.save();
  calibCtx.translate(HALF_W, 0); calibCtx.scale(-1, 1);
  calibCtx.drawImage(localVideo, 0, 0, HALF_W, HALF_H);
  calibCtx.restore();
  bgRefData = calibCtx.getImageData(0, 0, HALF_W, HALF_H);
  bgCalibrated = true;
  showToast('Background captured ✓ Now step into frame!');
  if (bgHint) bgHint.textContent = 'Background set — step in and shoot!';
}

if (calibrateBtn) {
  calibrateBtn.addEventListener('click', calibrateBackground);
}

// Build a mask canvas from current local frame vs reference
function buildMask() {
  if (!bgCalibrated || !bgRefData) return null;
  calibCtx.save();
  calibCtx.translate(HALF_W, 0); calibCtx.scale(-1, 1);
  calibCtx.drawImage(localVideo, 0, 0, HALF_W, HALF_H);
  calibCtx.restore();

  const current = calibCtx.getImageData(0, 0, HALF_W, HALF_H);
  const ref = bgRefData;
  const mask = maskCtx.createImageData(HALF_W, HALF_H);
  const THRESH = 30; // pixel difference threshold

  for (let i = 0; i < current.data.length; i += 4) {
    const dr = Math.abs(current.data[i]   - ref.data[i]);
    const dg = Math.abs(current.data[i+1] - ref.data[i+1]);
    const db = Math.abs(current.data[i+2] - ref.data[i+2]);
    const diff = (dr + dg + db) / 3;
    // Smooth the alpha: below threshold = transparent, above = opaque
    const alpha = Math.min(255, Math.max(0, (diff - THRESH + 10) * 12));
    mask.data[i]   = current.data[i];
    mask.data[i+1] = current.data[i+1];
    mask.data[i+2] = current.data[i+2];
    mask.data[i+3] = alpha;
  }
  maskCtx.putImageData(mask, 0, 0);
  return maskCanvas;
}

// ── Draw helper ───────────────────────────────────────────────────────────────
function drawPlaceholder(ctx, x, y, w, h, label) {
  ctx.fillStyle = '#e8e1d6';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#a09488';
  ctx.font = '300 16px Geist, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label || '…', x + w / 2, y + h / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawVignette(ctx, w, h) {
  const v = ctx.createRadialGradient(w/2, h/2, h * 0.25, w/2, h/2, w * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

// ── Preview loop ──────────────────────────────────────────────────────────────
function startPreviewLoop() {
  previewCanvas.width  = FULL_W;
  previewCanvas.height = FULL_H;
  const ctx = previewCanvas.getContext('2d');

  function draw() {
    ctx.clearRect(0, 0, FULL_W, FULL_H);
    const bgColor = BG_COLORS[selectedBg];

    if (bgColor && bgCalibrated) {
      // ── Background replacement mode ────────────────────────────────────────

      // 1. Fill entire canvas with solid background colour
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, FULL_W, FULL_H);

      // 2. Draw remote video on right (no segmentation — just draw it;
      //    user's real bg is still there on remote side without calibration)
      if (remoteVideo.srcObject && remoteVideo.readyState >= 2) {
        ctx.drawImage(remoteVideo, HALF_W, 0, HALF_W, HALF_H);
      } else {
        drawPlaceholder(ctx, HALF_W, 0, HALF_W, HALF_H, remoteName);
      }

      // 3. Build local person mask and draw onto left half
      const mask = buildMask();
      if (mask) {
        ctx.drawImage(mask, 0, 0, HALF_W, HALF_H);
      } else {
        // Fallback: draw full local video if mask not ready
        ctx.save();
        ctx.translate(HALF_W, 0); ctx.scale(-1, 1);
        if (localVideo.readyState >= 2) ctx.drawImage(localVideo, 0, 0, HALF_W, HALF_H);
        ctx.restore();
      }

    } else {
      // ── Normal side-by-side mode ───────────────────────────────────────────

      // Left: local video (mirrored)
      ctx.save();
      ctx.translate(HALF_W, 0); ctx.scale(-1, 1);
      if (currentFilter !== 'none') ctx.filter = currentFilter;
      if (localVideo.readyState >= 2) ctx.drawImage(localVideo, 0, 0, HALF_W, HALF_H);
      else drawPlaceholder(ctx, 0, 0, HALF_W, HALF_H, myName);
      ctx.filter = 'none';
      ctx.restore();

      // Right: remote video
      if (currentFilter !== 'none') ctx.filter = currentFilter;
      if (remoteVideo.srcObject && remoteVideo.readyState >= 2)
        ctx.drawImage(remoteVideo, HALF_W, 0, HALF_W, HALF_H);
      else
        drawPlaceholder(ctx, HALF_W, 0, HALF_W, HALF_H, remoteName);
      ctx.filter = 'none';
    }

    // Stickers
    stickers.forEach(s => {
      ctx.font = `${Math.round(FULL_H * 0.1)}px serif`;
      ctx.fillText(s.emoji, s.x * FULL_W, s.y * FULL_H);
    });

    // Vignette
    drawVignette(ctx, FULL_W, FULL_H);

    rafId = requestAnimationFrame(draw);
  }
  draw();
}

function stopPreviewLoop() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}

// ── Capture ───────────────────────────────────────────────────────────────────
function captureComposite() {
  captureCanvas.width  = FULL_W;
  captureCanvas.height = FULL_H;
  const ctx = captureCanvas.getContext('2d');
  const bgColor = BG_COLORS[selectedBg];

  if (bgColor && bgCalibrated) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, FULL_W, FULL_H);
    if (remoteVideo.srcObject && remoteVideo.readyState >= 2)
      ctx.drawImage(remoteVideo, HALF_W, 0, HALF_W, HALF_H);
    const mask = buildMask();
    if (mask) ctx.drawImage(mask, 0, 0, HALF_W, HALF_H);
    else {
      ctx.save();
      ctx.translate(HALF_W, 0); ctx.scale(-1, 1);
      ctx.drawImage(localVideo, 0, 0, HALF_W, HALF_H);
      ctx.restore();
    }
  } else {
    ctx.save();
    ctx.translate(HALF_W, 0); ctx.scale(-1, 1);
    if (currentFilter !== 'none') ctx.filter = currentFilter;
    if (localVideo.readyState >= 2) ctx.drawImage(localVideo, 0, 0, HALF_W, HALF_H);
    ctx.filter = 'none';
    ctx.restore();
    if (currentFilter !== 'none') ctx.filter = currentFilter;
    if (remoteVideo.srcObject && remoteVideo.readyState >= 2)
      ctx.drawImage(remoteVideo, HALF_W, 0, HALF_W, HALF_H);
    ctx.filter = 'none';
  }

  stickers.forEach(s => {
    ctx.font = `${Math.round(FULL_H * 0.1)}px serif`;
    ctx.fillText(s.emoji, s.x * FULL_W, s.y * FULL_H);
  });
  drawVignette(ctx, FULL_W, FULL_H);

  return captureCanvas.toDataURL('image/png');
}

// ── Filters ───────────────────────────────────────────────────────────────────
document.querySelectorAll('.filter-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentFilter = pill.dataset.filter;
  });
});

// ── Backgrounds ───────────────────────────────────────────────────────────────
document.querySelectorAll('.bg-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.bg-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    selectedBg = pill.dataset.bg;

    if (selectedBg !== 'none') {
      if (!bgCalibrated) {
        if (bgHint) {
          bgHint.textContent = 'Step OUT of frame, then click "Set Background"';
          bgHint.style.color = '#b5664a';
        }
        if (calibrateBtn) calibrateBtn.style.display = 'block';
      }
    } else {
      if (bgHint) bgHint.textContent = '';
      if (calibrateBtn) calibrateBtn.style.display = 'none';
      bgCalibrated = false;
      bgRefData = null;
    }
  });
});

// ── Stickers ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.sticker-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    stickers.push({ emoji: btn.dataset.sticker, x: 0.08 + Math.random() * 0.84, y: 0.15 + Math.random() * 0.7 });
  });
});
clearStickersBtn.addEventListener('click', () => { stickers = []; });

// ── Countdown / Flash ─────────────────────────────────────────────────────────
function showCountdown(n) { countdownOverlay.textContent = n > 0 ? n : ''; }
function doFlash() {
  flashOverlay.style.opacity = '1';
  setTimeout(() => { flashOverlay.style.opacity = '0'; }, 120);
}

// ── Strip abort ───────────────────────────────────────────────────────────────
let abortRequested = false;
function abortStrip(reason) {
  if (!stripRunning) return;
  abortRequested = true;
  showCountdown(0);
  captureStatus.textContent = reason;
  setTimeout(() => { if (captureStatus.textContent === reason) captureStatus.textContent = ''; }, 3500);
}

// ── Strip capture ─────────────────────────────────────────────────────────────
captureBtn.addEventListener('click', () => {
  if (captureBtn.disabled || stripRunning) return;
  if (!isSolo) sendData({ type: 'startStrip' });
  runStripLocal(true);
});

async function runStripLocal(isInitiator) {
  stripRunning = true;
  abortRequested = false;
  capturedPhotos = [];
  updateCaptureBtn();

  for (let i = 0; i < 3; i++) {
    if (abortRequested) break;
    captureStatus.textContent = `Photo ${i + 1} of 3…`;

    for (let c = 3; c >= 1; c--) {
      if (abortRequested) break;
      showCountdown(c);
      if (isInitiator) sendData({ type: 'remoteCountdown', count: c });
      await sleep(1000);
    }
    if (abortRequested) break;

    showCountdown(0);
    if (isInitiator) sendData({ type: 'remoteCountdown', count: 0 });
    doFlash();
    if (isInitiator) sendData({ type: 'remoteFlash' });
    capturedPhotos.push(captureComposite());
    captureStatus.textContent = `✓ Photo ${i + 1} captured!`;
    if (i < 2) await sleep(1400);
  }

  stripRunning = false;
  updateCaptureBtn();
  if (abortRequested || capturedPhotos.length < 3) return;
  captureStatus.textContent = 'Building your strip…';
  await sleep(300);
  buildStrip();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Build strip ───────────────────────────────────────────────────────────────
async function buildStrip() {
  const STRIP_W = 480, PAD = 14;
  const PHOTO_W = STRIP_W - PAD * 2;
  const PHOTO_H = Math.round(PHOTO_W * (FULL_H / FULL_W));
  const GAP = 4, BOTTOM = 56;
  const STRIP_H = PAD + (PHOTO_H + GAP) * 3 - GAP + PAD + BOTTOM;

  stripCanvas.width  = STRIP_W;
  stripCanvas.height = STRIP_H;
  const ctx = stripCanvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, STRIP_W, STRIP_H);

  for (let i = 0; i < capturedPhotos.length; i++) {
    const img = await loadImage(capturedPhotos[i]);
    ctx.drawImage(img, PAD, PAD + i * (PHOTO_H + GAP), PHOTO_W, PHOTO_H);
  }

  const caption = captionInput.value.trim() || 'SnapTogether 💕';
  ctx.fillStyle = '#3a3530';
  ctx.font = `300 19px 'Cormorant Garamond', Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillText(caption, STRIP_W / 2, STRIP_H - 22);

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  ctx.fillStyle = '#b0a090';
  ctx.font = '300 11px Geist, system-ui, sans-serif';
  ctx.fillText(today, STRIP_W / 2, STRIP_H - 7);

  downloadBtn.href = stripCanvas.toDataURL('image/png');
  captureStatus.textContent = '';
  showScreen('result');
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

// ── PeerJS ────────────────────────────────────────────────────────────────────
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return 'ST-' + c;
}

createRoomBtn.addEventListener('click', async () => {
  myName = yourNameCreate.value.trim() || 'You';
  myLabel.textContent = myName;
  createRoomBtn.disabled = true;
  lobbyStatus.textContent = 'Starting camera…';

  try {
    await startCamera();
  } catch {
    lobbyStatus.textContent = 'Camera access denied — please allow it and try again.';
    createRoomBtn.disabled = false;
    return;
  }

  lobbyStatus.textContent = 'Creating room…';
  const roomCode = generateCode();
  peer = new Peer(roomCode, { debug: 0 });

  peer.on('open', id => {
    roomCodeText.textContent = id;
    roomCodeDisplay.classList.remove('hidden');
    waitingMsg.classList.remove('hidden');
    lobbyStatus.textContent = '';
    createRoomBtn.disabled = false;
    roomBadge.textContent = id;
    setConnStatus('waiting', 'waiting for bestie…');
    updateCaptureBtn();
    showScreen('booth');
  });

  peer.on('connection', c => { conn = c; setupDataConnection(); });

  peer.on('call', call => {
    mediaConn = call;
    call.answer(localStream);
    call.on('stream', stream => {
      remoteStream = stream;
      remoteVideo.srcObject = stream;
      remoteVideo.play().catch(() => {});
    });
    call.on('error', handleBestieDropped);
    call.on('close', handleBestieDropped);
  });

  peer.on('error', e => {
    lobbyStatus.textContent = 'Could not create room (' + e.type + ') — try refreshing.';
    createRoomBtn.disabled = false;
  });
});

joinRoomBtn.addEventListener('click', async () => {
  const code = joinCodeInput.value.trim().toUpperCase();
  if (!code) { lobbyStatus.textContent = 'Please enter a room code'; return; }
  myName = yourNameJoin.value.trim() || 'You';
  myLabel.textContent = myName;
  joinRoomBtn.disabled = true;
  lobbyStatus.textContent = 'Starting camera…';

  try {
    await startCamera();
  } catch {
    lobbyStatus.textContent = 'Camera access denied — please allow it and try again.';
    joinRoomBtn.disabled = false;
    return;
  }

  lobbyStatus.textContent = 'Connecting…';
  peer = new Peer(undefined, { debug: 0 });

  peer.on('open', () => {
    conn = peer.connect(code, { reliable: true });
    setupDataConnection();
    mediaConn = peer.call(code, localStream);
    mediaConn.on('stream', stream => {
      remoteStream = stream;
      remoteVideo.srcObject = stream;
      remoteVideo.play().catch(() => {});
    });
    mediaConn.on('error', handleBestieDropped);
    mediaConn.on('close', handleBestieDropped);
    roomBadge.textContent = code;
    setConnStatus('waiting', 'connecting…');
    updateCaptureBtn();
    showScreen('booth');
    joinRoomBtn.disabled = false;
  });

  peer.on('error', () => {
    lobbyStatus.textContent = 'Could not connect — check the code and try again.';
    joinRoomBtn.disabled = false;
  });
});

function setupDataConnection() {
  conn.on('open', () => conn.send({ type: 'hello', name: myName }));
  conn.on('data', data => {
    if (data.type === 'hello') {
      remoteName = data.name;
      remoteLabel.textContent = remoteName;
      bestieConnected = true;
      setConnStatus('connected', `${remoteName} is here`);
      showToast(`${remoteName} joined the booth ✨`);
      updateCaptureBtn();
    }
    if (data.type === 'startStrip')      runStripLocal(false);
    if (data.type === 'remoteCountdown') showCountdown(data.count);
    if (data.type === 'remoteFlash')     doFlash();
    if (data.type === 'abortStrip')      abortStrip(`${remoteName} disconnected`);
  });
  conn.on('close', handleBestieDropped);
  conn.on('error', handleBestieDropped);
}

function sendData(obj) { if (conn && conn.open) conn.send(obj); }

function handleBestieDropped() {
  if (!bestieConnected && !stripRunning) return;
  bestieConnected = false;
  remoteStream = null;
  remoteVideo.srcObject = null;
  setConnStatus('dropped', `${remoteName} disconnected`);
  showToast(`${remoteName} left the booth`, 4000);
  if (stripRunning) abortStrip(`${remoteName} disconnected — strip cancelled`);
  updateCaptureBtn();
}

soloBtn.addEventListener('click', async () => {
  isSolo = true;
  myName = yourNameCreate.value.trim() || 'You';
  myLabel.textContent = myName;
  remoteLabel.textContent = '';
  roomBadge.textContent = 'solo';
  setConnStatus('solo', 'solo mode');
  lobbyStatus.textContent = 'Starting camera…';
  try {
    await startCamera();
  } catch {
    lobbyStatus.textContent = 'Camera access denied.';
    isSolo = false;
    return;
  }
  lobbyStatus.textContent = '';
  updateCaptureBtn();
  showScreen('booth');
});

retakeBtn.addEventListener('click', () => { capturedPhotos = []; showScreen('booth'); });

leaveBtn.addEventListener('click', () => {
  if (stripRunning) { sendData({ type: 'abortStrip' }); abortStrip('You left'); }
  stopPreviewLoop();
  if (conn) conn.close();
  if (mediaConn) mediaConn.close();
  if (peer) peer.destroy();
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  localStream = null; remoteStream = null; conn = null; mediaConn = null; peer = null;
  localVideo.srcObject = null; remoteVideo.srcObject = null;
  bestieConnected = false; stripRunning = false; isSolo = false;
  bgCalibrated = false; bgRefData = null;
  stickers = []; capturedPhotos = [];
  if (calibrateBtn) calibrateBtn.style.display = 'none';
  if (bgHint) bgHint.textContent = '';
  setConnStatus('waiting', 'connecting…');
  showScreen('lobby');
});

copyCodeBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(roomCodeText.textContent).then(() => {
    copyCodeBtn.textContent = 'Copied!';
    setTimeout(() => copyCodeBtn.textContent = 'Copy', 2000);
  });
});// SnapTogether — script.js
// Zero external dependencies beyond PeerJS.
// Background replacement uses a simple first-frame subtraction method:
// captures a background reference frame before the person enters,
// then subtracts it per-pixel to isolate the person.

// ── State ─────────────────────────────────────────────────────────────────────
let peer = null, conn = null, mediaConn = null;
let localStream = null, remoteStream = null;
let isSolo = false;
let bestieConnected = false, stripRunning = false;
let myName = 'You', remoteName = 'Bestie';
let currentFilter = 'none';
let selectedBg = 'none';
let stickers = [];
let capturedPhotos = [];
let rafId = null;

// Background calibration
let bgCalibrated = false;
let bgRefData = null;        // ImageData of the empty background frame
let calibCanvas = null;
let calibCtx = null;
let maskCanvas = null;
let maskCtx = null;

// Canvas resolution
const HALF_W = 480, HALF_H = 360;
const FULL_W = HALF_W * 2, FULL_H = HALF_H;

// Solid background colours
const BG_COLORS = {
  none:  null,
  blush: '#e8b4b8',
  sage:  '#8aab96',
  navy:  '#2c3e6b',
  cream: '#f0e6d3',
  black: '#1a1a1a',
};

// ── DOM ───────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const lobbyEl        = $('lobby');
const createRoomBtn  = $('createRoomBtn');
const joinRoomBtn    = $('joinRoomBtn');
const copyCodeBtn    = $('copyCodeBtn');
const roomCodeDisplay = $('roomCodeDisplay');
const roomCodeText   = $('roomCodeText');
const waitingMsg     = $('waitingMsg');
const lobbyStatus    = $('lobbyStatus');
const soloBtn        = $('soloBtn');
const yourNameCreate = $('yourNameCreate');
const yourNameJoin   = $('yourNameJoin');
const joinCodeInput  = $('joinCodeInput');
const localVideo     = $('localVideo');
const remoteVideo    = $('remoteVideo');
const previewCanvas  = $('previewCanvas');
const countdownOverlay = $('countdownOverlay');
const flashOverlay   = $('flashOverlay');
const captureBtn     = $('captureBtn');
const captureStatus  = $('captureStatus');
const captionInput   = $('captionInput');
const myLabel        = $('myLabel');
const remoteLabel    = $('remoteLabel');
const roomBadge      = $('roomBadge');
const leaveBtn       = $('leaveBtn');
const clearStickersBtn = $('clearStickersBtn');
const connStatus     = $('connStatus');
const connLabel      = $('connLabel');
const toastEl        = $('toast');
const stripCanvas    = $('stripCanvas');
const downloadBtn    = $('downloadBtn');
const retakeBtn      = $('retakeBtn');
const captureCanvas  = $('captureCanvas');
const bgHint         = $('bgHint');
const calibrateBtn   = $('calibrateBtn');

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, dur = 3000) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), dur);
}

// ── Connection status ─────────────────────────────────────────────────────────
function setConnStatus(state, label) {
  connStatus.className = 'conn-status ' + state;
  connLabel.textContent = label;
}
function updateCaptureBtn() {
  const ready = isSolo || bestieConnected;
  captureBtn.disabled = !ready || stripRunning;
  captureBtn.title = ready ? '' : 'Waiting for your bestie to connect…';
}

// ── Tab switching ─────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ── Screen switcher ───────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
  if (id === 'booth') startPreviewLoop();
  else stopPreviewLoop();
}

// ── Camera ────────────────────────────────────────────────────────────────────
async function startCamera() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .catch(() => { throw new Error('camera'); });
  localVideo.srcObject = localStream;
  await localVideo.play().catch(() => {});
}

// ── Background calibration ────────────────────────────────────────────────────
// User clicks "Calibrate" while NOT in frame — we snapshot the empty background.
// Then per-frame we compare pixels to this reference and mask the person out.

function initCalibCanvas() {
  if (calibCanvas) return;
  calibCanvas = document.createElement('canvas');
  calibCanvas.width = HALF_W; calibCanvas.height = HALF_H;
  calibCtx = calibCanvas.getContext('2d', { willReadFrequently: true });
  maskCanvas = document.createElement('canvas');
  maskCanvas.width = HALF_W; maskCanvas.height = HALF_H;
  maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
}

function calibrateBackground() {
  if (localVideo.readyState < 2) {
    showToast('Camera not ready yet — try again in a moment');
    return;
  }
  initCalibCanvas();
  calibCtx.save();
  calibCtx.translate(HALF_W, 0); calibCtx.scale(-1, 1);
  calibCtx.drawImage(localVideo, 0, 0, HALF_W, HALF_H);
  calibCtx.restore();
  bgRefData = calibCtx.getImageData(0, 0, HALF_W, HALF_H);
  bgCalibrated = true;
  showToast('Background captured ✓ Now step into frame!');
  if (bgHint) bgHint.textContent = 'Background set — step in and shoot!';
}

if (calibrateBtn) {
  calibrateBtn.addEventListener('click', calibrateBackground);
}

// Build a mask canvas from current local frame vs reference
function buildMask() {
  if (!bgCalibrated || !bgRefData) return null;
  calibCtx.save();
  calibCtx.translate(HALF_W, 0); calibCtx.scale(-1, 1);
  calibCtx.drawImage(localVideo, 0, 0, HALF_W, HALF_H);
  calibCtx.restore();

  const current = calibCtx.getImageData(0, 0, HALF_W, HALF_H);
  const ref = bgRefData;
  const mask = maskCtx.createImageData(HALF_W, HALF_H);
  const THRESH = 30; // pixel difference threshold

  for (let i = 0; i < current.data.length; i += 4) {
    const dr = Math.abs(current.data[i]   - ref.data[i]);
    const dg = Math.abs(current.data[i+1] - ref.data[i+1]);
    const db = Math.abs(current.data[i+2] - ref.data[i+2]);
    const diff = (dr + dg + db) / 3;
    // Smooth the alpha: below threshold = transparent, above = opaque
    const alpha = Math.min(255, Math.max(0, (diff - THRESH + 10) * 12));
    mask.data[i]   = current.data[i];
    mask.data[i+1] = current.data[i+1];
    mask.data[i+2] = current.data[i+2];
    mask.data[i+3] = alpha;
  }
  maskCtx.putImageData(mask, 0, 0);
  return maskCanvas;
}

// ── Draw helper ───────────────────────────────────────────────────────────────
function drawPlaceholder(ctx, x, y, w, h, label) {
  ctx.fillStyle = '#e8e1d6';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#a09488';
  ctx.font = '300 16px Geist, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label || '…', x + w / 2, y + h / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawVignette(ctx, w, h) {
  const v = ctx.createRadialGradient(w/2, h/2, h * 0.25, w/2, h/2, w * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

// ── Preview loop ──────────────────────────────────────────────────────────────
function startPreviewLoop() {
  previewCanvas.width  = FULL_W;
  previewCanvas.height = FULL_H;
  const ctx = previewCanvas.getContext('2d');

  function draw() {
    ctx.clearRect(0, 0, FULL_W, FULL_H);
    const bgColor = BG_COLORS[selectedBg];

    if (bgColor && bgCalibrated) {
      // ── Background replacement mode ────────────────────────────────────────

      // 1. Fill entire canvas with solid background colour
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, FULL_W, FULL_H);

      // 2. Draw remote video on right (no segmentation — just draw it;
      //    user's real bg is still there on remote side without calibration)
      if (remoteVideo.srcObject && remoteVideo.readyState >= 2) {
        ctx.drawImage(remoteVideo, HALF_W, 0, HALF_W, HALF_H);
      } else {
        drawPlaceholder(ctx, HALF_W, 0, HALF_W, HALF_H, remoteName);
      }

      // 3. Build local person mask and draw onto left half
      const mask = buildMask();
      if (mask) {
        ctx.drawImage(mask, 0, 0, HALF_W, HALF_H);
      } else {
        // Fallback: draw full local video if mask not ready
        ctx.save();
        ctx.translate(HALF_W, 0); ctx.scale(-1, 1);
        if (localVideo.readyState >= 2) ctx.drawImage(localVideo, 0, 0, HALF_W, HALF_H);
        ctx.restore();
      }

    } else {
      // ── Normal side-by-side mode ───────────────────────────────────────────

      // Left: local video (mirrored)
      ctx.save();
      ctx.translate(HALF_W, 0); ctx.scale(-1, 1);
      if (currentFilter !== 'none') ctx.filter = currentFilter;
      if (localVideo.readyState >= 2) ctx.drawImage(localVideo, 0, 0, HALF_W, HALF_H);
      else drawPlaceholder(ctx, 0, 0, HALF_W, HALF_H, myName);
      ctx.filter = 'none';
      ctx.restore();

      // Right: remote video
      if (currentFilter !== 'none') ctx.filter = currentFilter;
      if (remoteVideo.srcObject && remoteVideo.readyState >= 2)
        ctx.drawImage(remoteVideo, HALF_W, 0, HALF_W, HALF_H);
      else
        drawPlaceholder(ctx, HALF_W, 0, HALF_W, HALF_H, remoteName);
      ctx.filter = 'none';
    }

    // Stickers
    stickers.forEach(s => {
      ctx.font = `${Math.round(FULL_H * 0.1)}px serif`;
      ctx.fillText(s.emoji, s.x * FULL_W, s.y * FULL_H);
    });

    // Vignette
    drawVignette(ctx, FULL_W, FULL_H);

    rafId = requestAnimationFrame(draw);
  }
  draw();
}

function stopPreviewLoop() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}

// ── Capture ───────────────────────────────────────────────────────────────────
function captureComposite() {
  captureCanvas.width  = FULL_W;
  captureCanvas.height = FULL_H;
  const ctx = captureCanvas.getContext('2d');
  const bgColor = BG_COLORS[selectedBg];

  if (bgColor && bgCalibrated) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, FULL_W, FULL_H);
    if (remoteVideo.srcObject && remoteVideo.readyState >= 2)
      ctx.drawImage(remoteVideo, HALF_W, 0, HALF_W, HALF_H);
    const mask = buildMask();
    if (mask) ctx.drawImage(mask, 0, 0, HALF_W, HALF_H);
    else {
      ctx.save();
      ctx.translate(HALF_W, 0); ctx.scale(-1, 1);
      ctx.drawImage(localVideo, 0, 0, HALF_W, HALF_H);
      ctx.restore();
    }
  } else {
    ctx.save();
    ctx.translate(HALF_W, 0); ctx.scale(-1, 1);
    if (currentFilter !== 'none') ctx.filter = currentFilter;
    if (localVideo.readyState >= 2) ctx.drawImage(localVideo, 0, 0, HALF_W, HALF_H);
    ctx.filter = 'none';
    ctx.restore();
    if (currentFilter !== 'none') ctx.filter = currentFilter;
    if (remoteVideo.srcObject && remoteVideo.readyState >= 2)
      ctx.drawImage(remoteVideo, HALF_W, 0, HALF_W, HALF_H);
    ctx.filter = 'none';
  }

  stickers.forEach(s => {
    ctx.font = `${Math.round(FULL_H * 0.1)}px serif`;
    ctx.fillText(s.emoji, s.x * FULL_W, s.y * FULL_H);
  });
  drawVignette(ctx, FULL_W, FULL_H);

  return captureCanvas.toDataURL('image/png');
}

// ── Filters ───────────────────────────────────────────────────────────────────
document.querySelectorAll('.filter-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentFilter = pill.dataset.filter;
  });
});

// ── Backgrounds ───────────────────────────────────────────────────────────────
document.querySelectorAll('.bg-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.bg-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    selectedBg = pill.dataset.bg;

    if (selectedBg !== 'none') {
      if (!bgCalibrated) {
        if (bgHint) {
          bgHint.textContent = 'Step OUT of frame, then click "Set Background"';
          bgHint.style.color = '#b5664a';
        }
        if (calibrateBtn) calibrateBtn.style.display = 'block';
      }
    } else {
      if (bgHint) bgHint.textContent = '';
      if (calibrateBtn) calibrateBtn.style.display = 'none';
      bgCalibrated = false;
      bgRefData = null;
    }
  });
});

// ── Stickers ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.sticker-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    stickers.push({ emoji: btn.dataset.sticker, x: 0.08 + Math.random() * 0.84, y: 0.15 + Math.random() * 0.7 });
  });
});
clearStickersBtn.addEventListener('click', () => { stickers = []; });

// ── Countdown / Flash ─────────────────────────────────────────────────────────
function showCountdown(n) { countdownOverlay.textContent = n > 0 ? n : ''; }
function doFlash() {
  flashOverlay.style.opacity = '1';
  setTimeout(() => { flashOverlay.style.opacity = '0'; }, 120);
}

// ── Strip abort ───────────────────────────────────────────────────────────────
let abortRequested = false;
function abortStrip(reason) {
  if (!stripRunning) return;
  abortRequested = true;
  showCountdown(0);
  captureStatus.textContent = reason;
  setTimeout(() => { if (captureStatus.textContent === reason) captureStatus.textContent = ''; }, 3500);
}

// ── Strip capture ─────────────────────────────────────────────────────────────
captureBtn.addEventListener('click', () => {
  if (captureBtn.disabled || stripRunning) return;
  if (!isSolo) sendData({ type: 'startStrip' });
  runStripLocal(true);
});

async function runStripLocal(isInitiator) {
  stripRunning = true;
  abortRequested = false;
  capturedPhotos = [];
  updateCaptureBtn();

  for (let i = 0; i < 3; i++) {
    if (abortRequested) break;
    captureStatus.textContent = `Photo ${i + 1} of 3…`;

    for (let c = 3; c >= 1; c--) {
      if (abortRequested) break;
      showCountdown(c);
      if (isInitiator) sendData({ type: 'remoteCountdown', count: c });
      await sleep(1000);
    }
    if (abortRequested) break;

    showCountdown(0);
    if (isInitiator) sendData({ type: 'remoteCountdown', count: 0 });
    doFlash();
    if (isInitiator) sendData({ type: 'remoteFlash' });
    capturedPhotos.push(captureComposite());
    captureStatus.textContent = `✓ Photo ${i + 1} captured!`;
    if (i < 2) await sleep(1400);
  }

  stripRunning = false;
  updateCaptureBtn();
  if (abortRequested || capturedPhotos.length < 3) return;
  captureStatus.textContent = 'Building your strip…';
  await sleep(300);
  buildStrip();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Build strip ───────────────────────────────────────────────────────────────
async function buildStrip() {
  const STRIP_W = 480, PAD = 14;
  const PHOTO_W = STRIP_W - PAD * 2;
  const PHOTO_H = Math.round(PHOTO_W * (FULL_H / FULL_W));
  const GAP = 4, BOTTOM = 56;
  const STRIP_H = PAD + (PHOTO_H + GAP) * 3 - GAP + PAD + BOTTOM;

  stripCanvas.width  = STRIP_W;
  stripCanvas.height = STRIP_H;
  const ctx = stripCanvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, STRIP_W, STRIP_H);

  for (let i = 0; i < capturedPhotos.length; i++) {
    const img = await loadImage(capturedPhotos[i]);
    ctx.drawImage(img, PAD, PAD + i * (PHOTO_H + GAP), PHOTO_W, PHOTO_H);
  }

  const caption = captionInput.value.trim() || 'SnapTogether 💕';
  ctx.fillStyle = '#3a3530';
  ctx.font = `300 19px 'Cormorant Garamond', Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillText(caption, STRIP_W / 2, STRIP_H - 22);

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  ctx.fillStyle = '#b0a090';
  ctx.font = '300 11px Geist, system-ui, sans-serif';
  ctx.fillText(today, STRIP_W / 2, STRIP_H - 7);

  downloadBtn.href = stripCanvas.toDataURL('image/png');
  captureStatus.textContent = '';
  showScreen('result');
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

// ── PeerJS ────────────────────────────────────────────────────────────────────
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return 'ST-' + c;
}

createRoomBtn.addEventListener('click', async () => {
  myName = yourNameCreate.value.trim() || 'You';
  myLabel.textContent = myName;
  createRoomBtn.disabled = true;
  lobbyStatus.textContent = 'Starting camera…';

  try {
    await startCamera();
  } catch {
    lobbyStatus.textContent = 'Camera access denied — please allow it and try again.';
    createRoomBtn.disabled = false;
    return;
  }

  lobbyStatus.textContent = 'Creating room…';
  const roomCode = generateCode();
  peer = new Peer(roomCode, { debug: 0 });

  peer.on('open', id => {
    roomCodeText.textContent = id;
    roomCodeDisplay.classList.remove('hidden');
    waitingMsg.classList.remove('hidden');
    lobbyStatus.textContent = '';
    createRoomBtn.disabled = false;
    roomBadge.textContent = id;
    setConnStatus('waiting', 'waiting for bestie…');
    updateCaptureBtn();
    showScreen('booth');
  });

  peer.on('connection', c => { conn = c; setupDataConnection(); });

  peer.on('call', call => {
    mediaConn = call;
    call.answer(localStream);
    call.on('stream', stream => {
      remoteStream = stream;
      remoteVideo.srcObject = stream;
      remoteVideo.play().catch(() => {});
    });
    call.on('error', handleBestieDropped);
    call.on('close', handleBestieDropped);
  });

  peer.on('error', e => {
    lobbyStatus.textContent = 'Could not create room (' + e.type + ') — try refreshing.';
    createRoomBtn.disabled = false;
  });
});

joinRoomBtn.addEventListener('click', async () => {
  const code = joinCodeInput.value.trim().toUpperCase();
  if (!code) { lobbyStatus.textContent = 'Please enter a room code'; return; }
  myName = yourNameJoin.value.trim() || 'You';
  myLabel.textContent = myName;
  joinRoomBtn.disabled = true;
  lobbyStatus.textContent = 'Starting camera…';

  try {
    await startCamera();
  } catch {
    lobbyStatus.textContent = 'Camera access denied — please allow it and try again.';
    joinRoomBtn.disabled = false;
    return;
  }

  lobbyStatus.textContent = 'Connecting…';
  peer = new Peer(undefined, { debug: 0 });

  peer.on('open', () => {
    conn = peer.connect(code, { reliable: true });
    setupDataConnection();
    mediaConn = peer.call(code, localStream);
    mediaConn.on('stream', stream => {
      remoteStream = stream;
      remoteVideo.srcObject = stream;
      remoteVideo.play().catch(() => {});
    });
    mediaConn.on('error', handleBestieDropped);
    mediaConn.on('close', handleBestieDropped);
    roomBadge.textContent = code;
    setConnStatus('waiting', 'connecting…');
    updateCaptureBtn();
    showScreen('booth');
    joinRoomBtn.disabled = false;
  });

  peer.on('error', () => {
    lobbyStatus.textContent = 'Could not connect — check the code and try again.';
    joinRoomBtn.disabled = false;
  });
});

function setupDataConnection() {
  conn.on('open', () => conn.send({ type: 'hello', name: myName }));
  conn.on('data', data => {
    if (data.type === 'hello') {
      remoteName = data.name;
      remoteLabel.textContent = remoteName;
      bestieConnected = true;
      setConnStatus('connected', `${remoteName} is here`);
      showToast(`${remoteName} joined the booth ✨`);
      updateCaptureBtn();
    }
    if (data.type === 'startStrip')      runStripLocal(false);
    if (data.type === 'remoteCountdown') showCountdown(data.count);
    if (data.type === 'remoteFlash')     doFlash();
    if (data.type === 'abortStrip')      abortStrip(`${remoteName} disconnected`);
  });
  conn.on('close', handleBestieDropped);
  conn.on('error', handleBestieDropped);
}

function sendData(obj) { if (conn && conn.open) conn.send(obj); }

function handleBestieDropped() {
  if (!bestieConnected && !stripRunning) return;
  bestieConnected = false;
  remoteStream = null;
  remoteVideo.srcObject = null;
  setConnStatus('dropped', `${remoteName} disconnected`);
  showToast(`${remoteName} left the booth`, 4000);
  if (stripRunning) abortStrip(`${remoteName} disconnected — strip cancelled`);
  updateCaptureBtn();
}

soloBtn.addEventListener('click', async () => {
  isSolo = true;
  myName = yourNameCreate.value.trim() || 'You';
  myLabel.textContent = myName;
  remoteLabel.textContent = '';
  roomBadge.textContent = 'solo';
  setConnStatus('solo', 'solo mode');
  lobbyStatus.textContent = 'Starting camera…';
  try {
    await startCamera();
  } catch {
    lobbyStatus.textContent = 'Camera access denied.';
    isSolo = false;
    return;
  }
  lobbyStatus.textContent = '';
  updateCaptureBtn();
  showScreen('booth');
});

retakeBtn.addEventListener('click', () => { capturedPhotos = []; showScreen('booth'); });

leaveBtn.addEventListener('click', () => {
  if (stripRunning) { sendData({ type: 'abortStrip' }); abortStrip('You left'); }
  stopPreviewLoop();
  if (conn) conn.close();
  if (mediaConn) mediaConn.close();
  if (peer) peer.destroy();
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  localStream = null; remoteStream = null; conn = null; mediaConn = null; peer = null;
  localVideo.srcObject = null; remoteVideo.srcObject = null;
  bestieConnected = false; stripRunning = false; isSolo = false;
  bgCalibrated = false; bgRefData = null;
  stickers = []; capturedPhotos = [];
  if (calibrateBtn) calibrateBtn.style.display = 'none';
  if (bgHint) bgHint.textContent = '';
  setConnStatus('waiting', 'connecting…');
  showScreen('lobby');
});

copyCodeBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(roomCodeText.textContent).then(() => {
    copyCodeBtn.textContent = 'Copied!';
    setTimeout(() => copyCodeBtn.textContent = 'Copy', 2000);
  });
});
