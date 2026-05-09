// ── State ────────────────────────────────────────────────────────────────────
let peer = null;
let conn = null;
let localStream  = null;
let remoteStream = null;
let mediaConn    = null;
let isSolo       = false;
let currentFilter   = 'none';
let stickers        = [];   // {emoji, x, y} — on the composite canvas, 0-1 coords
let capturedPhotos  = [];
let myName       = 'You';
let remoteName   = 'Bestie';
let isHost       = false;
let stripRunning = false;
let bestieConnected = false;
let rafId        = null;    // requestAnimationFrame id for the live preview loop

// ── DOM ───────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const createRoomBtn   = $('createRoomBtn');
const joinRoomBtn     = $('joinRoomBtn');
const copyCodeBtn     = $('copyCodeBtn');
const roomCodeDisplay = $('roomCodeDisplay');
const roomCodeText    = $('roomCodeText');
const waitingMsg      = $('waitingMsg');
const lobbyStatus     = $('lobbyStatus');
const soloBtn         = $('soloBtn');
const yourNameCreate  = $('yourNameCreate');
const yourNameJoin    = $('yourNameJoin');
const joinCodeInput   = $('joinCodeInput');

const localVideo      = $('localVideo');
const remoteVideo     = $('remoteVideo');
const previewCanvas   = $('previewCanvas');
const countdownOverlay = $('countdownOverlay');
const flashOverlay    = $('flashOverlay');
const captureBtn      = $('captureBtn');
const captureStatus   = $('captureStatus');
const captionInput    = $('captionInput');
const myLabel         = $('myLabel');
const remoteLabel     = $('remoteLabel');
const roomBadge       = $('roomBadge');
const leaveBtn        = $('leaveBtn');
const clearStickersBtn = $('clearStickersBtn');
const connStatus      = $('connStatus');
const connLabel       = $('connLabel');
const toast           = $('toast');
const stripCanvas     = $('stripCanvas');
const downloadBtn     = $('downloadBtn');
const retakeBtn       = $('retakeBtn');
const captureCanvas   = $('captureCanvas');

// ── Canvas dimensions ─────────────────────────────────────────────────────────
// Composite canvas = 2 × a 4:3 half → total 8:3 ratio
// We keep an internal resolution high so captures are crisp
const HALF_W = 480;  // each person's half
const HALF_H = 360;
const FULL_W = HALF_W * 2;
const FULL_H = HALF_H;

// Frame border config (drawn on canvas)
const FRAME_COLOR  = '#ffffff';
const FRAME_INSET  = 8;    // px inset from edge
const DIVIDER_W    = 2;    // centre divider width
const CORNER_R     = 12;

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, duration = 3000) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
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

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
  if (id === 'booth') startPreviewLoop();
  else stopPreviewLoop();
}

// ── Camera ────────────────────────────────────────────────────────────────────
async function startCamera() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    await localVideo.play();
  } catch (e) {
    alert('Camera/mic access is needed 📸\nPlease allow permissions and refresh.');
    throw e;
  }
}

// ── Live preview loop ─────────────────────────────────────────────────────────
// Draws both feeds into one canvas every frame, with booth frame on top.
function startPreviewLoop() {
  previewCanvas.width  = FULL_W;
  previewCanvas.height = FULL_H;

  // Make the canvas fill its CSS container while preserving ratio
  const ctx = previewCanvas.getContext('2d');

  function draw() {
    ctx.clearRect(0, 0, FULL_W, FULL_H);

    // ── Left half: local video (mirrored like a selfie) ──
    ctx.save();
    ctx.translate(HALF_W, 0);
    ctx.scale(-1, 1);  // mirror
    applyFilter(ctx, currentFilter);
    if (localVideo.readyState >= 2) {
      ctx.drawImage(localVideo, 0, 0, HALF_W, HALF_H);
    } else {
      drawPlaceholder(ctx, 0, 0, HALF_W, HALF_H, myName);
    }
    ctx.filter = 'none';
    ctx.restore();

    // ── Right half: remote video ──
    ctx.save();
    applyFilter(ctx, currentFilter);
    if (remoteVideo.srcObject && remoteVideo.readyState >= 2) {
      ctx.drawImage(remoteVideo, HALF_W, 0, HALF_W, HALF_H);
    } else {
      drawPlaceholder(ctx, HALF_W, 0, HALF_W, HALF_H, remoteName);
    }
    ctx.filter = 'none';
    ctx.restore();

    // ── Stickers ──
    stickers.forEach(s => {
      ctx.font = `${Math.round(FULL_H * 0.12)}px serif`;
      ctx.fillText(s.emoji, s.x * FULL_W, s.y * FULL_H);
    });

    // ── Booth frame (drawn on top) ──
    drawBoothFrame(ctx);

    rafId = requestAnimationFrame(draw);
  }
  draw();
}

function stopPreviewLoop() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}

function applyFilter(ctx, filter) {
  ctx.filter = (filter && filter !== 'none') ? filter : 'none';
}

function drawPlaceholder(ctx, x, y, w, h, label) {
  ctx.fillStyle = '#e8e1d6';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#a09488';
  ctx.font = '300 18px Geist, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label || '…', x + w / 2, y + h / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawBoothFrame(ctx) {
  const w = FULL_W, h = FULL_H;
  const ins = FRAME_INSET;

  ctx.save();

  // Outer rounded rect border
  ctx.strokeStyle = FRAME_COLOR;
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.85;
  roundRect(ctx, ins, ins, w - ins * 2, h - ins * 2, CORNER_R);
  ctx.stroke();

  // Centre divider line
  ctx.lineWidth = DIVIDER_W;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.moveTo(w / 2, ins + 6);
  ctx.lineTo(w / 2, h - ins - 6);
  ctx.stroke();

  // Corner tick marks (cute detail)
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.5;
  const tick = 14;
  const corners = [
    [ins, ins],
    [w - ins, ins],
    [ins, h - ins],
    [w - ins, h - ins],
  ];
  corners.forEach(([cx, cy]) => {
    ctx.beginPath();
    ctx.moveTo(cx + (cx < w / 2 ? tick : -tick), cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + (cy < h / 2 ? tick : -tick));
    ctx.stroke();
  });

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── PeerJS ────────────────────────────────────────────────────────────────────
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return 'ST-' + code;
}

createRoomBtn.addEventListener('click', async () => {
  myName = yourNameCreate.value.trim() || 'You';
  myLabel.textContent = myName;
  isHost = true;
  createRoomBtn.disabled = true;
  lobbyStatus.textContent = 'Setting up your room…';

  try { await startCamera(); } catch { createRoomBtn.disabled = false; return; }

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
    call.on('error', () => handleBestieDropped());
  });

  peer.on('error', e => {
    lobbyStatus.textContent = 'Error: ' + e.type;
    createRoomBtn.disabled = false;
  });
});

joinRoomBtn.addEventListener('click', async () => {
  const code = joinCodeInput.value.trim().toUpperCase();
  if (!code) { lobbyStatus.textContent = 'Please enter a room code'; return; }
  myName = yourNameJoin.value.trim() || 'You';
  myLabel.textContent = myName;
  isHost = false;
  joinRoomBtn.disabled = true;
  lobbyStatus.textContent = 'Connecting…';

  try { await startCamera(); } catch { joinRoomBtn.disabled = false; return; }

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
    mediaConn.on('error', () => handleBestieDropped());

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

  conn.on('close', () => handleBestieDropped());
  conn.on('error', () => handleBestieDropped());
}

function sendData(obj) {
  if (conn && conn.open) conn.send(obj);
}

function handleBestieDropped() {
  bestieConnected = false;
  remoteStream = null;
  if (remoteVideo.srcObject) { remoteVideo.srcObject = null; }
  setConnStatus('dropped', `${remoteName} disconnected`);
  showToast(`${remoteName} left the booth`, 4000);
  if (stripRunning) abortStrip(`${remoteName} disconnected — strip cancelled`);
  updateCaptureBtn();
}

// ── Solo mode ─────────────────────────────────────────────────────────────────
soloBtn.addEventListener('click', async () => {
  isSolo = true;
  myName = yourNameCreate.value.trim() || 'You';
  myLabel.textContent = myName;
  remoteLabel.textContent = '';
  roomBadge.textContent = 'solo';
  setConnStatus('solo', 'solo mode');
  await startCamera();
  updateCaptureBtn();
  showScreen('booth');
});

// ── Filters ───────────────────────────────────────────────────────────────────
document.querySelectorAll('.filter-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentFilter = pill.dataset.filter;
  });
});

// ── Stickers ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.sticker-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    // Place randomly, avoiding the very edges
    stickers.push({
      emoji: btn.dataset.sticker,
      x: 0.08 + Math.random() * 0.84,
      y: 0.12 + Math.random() * 0.72,
    });
  });
});

clearStickersBtn.addEventListener('click', () => { stickers = []; });

// ── Countdown overlay ─────────────────────────────────────────────────────────
function showCountdown(n) {
  countdownOverlay.textContent = n > 0 ? n : '';
}

// ── Flash ─────────────────────────────────────────────────────────────────────
function doFlash() {
  flashOverlay.style.opacity = '1';
  setTimeout(() => { flashOverlay.style.opacity = '0'; }, 120);
}

// ── Capture the composite frame ───────────────────────────────────────────────
// We capture from previewCanvas directly — it already has both feeds composited.
// Before capturing we draw one final frame without the semi-transparent frame
// so the captured image has a clean opaque frame.
function captureComposite() {
  captureCanvas.width  = FULL_W;
  captureCanvas.height = FULL_H;
  const ctx = captureCanvas.getContext('2d');

  // Left half (local, mirrored)
  ctx.save();
  ctx.translate(HALF_W, 0);
  ctx.scale(-1, 1);
  applyFilter(ctx, currentFilter);
  if (localVideo.readyState >= 2) ctx.drawImage(localVideo, 0, 0, HALF_W, HALF_H);
  else drawPlaceholder(ctx, 0, 0, HALF_W, HALF_H, myName);
  ctx.filter = 'none';
  ctx.restore();

  // Right half (remote)
  ctx.save();
  applyFilter(ctx, currentFilter);
  if (remoteVideo.srcObject && remoteVideo.readyState >= 2) {
    ctx.drawImage(remoteVideo, HALF_W, 0, HALF_W, HALF_H);
  } else {
    drawPlaceholder(ctx, HALF_W, 0, HALF_W, HALF_H, remoteName);
  }
  ctx.filter = 'none';
  ctx.restore();

  // Stickers
  stickers.forEach(s => {
    ctx.font = `${Math.round(FULL_H * 0.12)}px serif`;
    ctx.fillText(s.emoji, s.x * FULL_W, s.y * FULL_H);
  });

  // Frame — fully opaque this time
  ctx.save();
  const ins = FRAME_INSET, w = FULL_W, h = FULL_H;
  ctx.strokeStyle = FRAME_COLOR;
  ctx.lineWidth = 4;
  roundRect(ctx, ins, ins, w - ins * 2, h - ins * 2, CORNER_R);
  ctx.stroke();
  ctx.lineWidth = DIVIDER_W;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(w / 2, ins + 6);
  ctx.lineTo(w / 2, h - ins - 6);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.7;
  const tick = 14;
  [[ins, ins],[w - ins, ins],[ins, h - ins],[w - ins, h - ins]].forEach(([cx, cy]) => {
    ctx.beginPath();
    ctx.moveTo(cx + (cx < w / 2 ? tick : -tick), cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + (cy < h / 2 ? tick : -tick));
    ctx.stroke();
  });
  ctx.restore();

  return captureCanvas.toDataURL('image/png');
}

// ── Strip abort ───────────────────────────────────────────────────────────────
let abortRequested = false;
function abortStrip(reason) {
  if (!stripRunning) return;
  abortRequested = true;
  showCountdown(0);
  captureStatus.textContent = reason;
  setTimeout(() => {
    if (captureStatus.textContent === reason) captureStatus.textContent = '';
  }, 3500);
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

// ── Build photo strip ─────────────────────────────────────────────────────────
async function buildStrip() {
  // Each photo is 2:1 wide (landscape, both faces)
  // Strip is portrait: 3 photos stacked
  const STRIP_W  = 560;
  const PAD      = 16;
  const PHOTO_W  = STRIP_W - PAD * 2;
  const PHOTO_H  = Math.round(PHOTO_W * (FULL_H / FULL_W)); // preserve ratio
  const GAP      = 12;
  const BOTTOM   = 60;
  const STRIP_H  = PAD + (PHOTO_H + GAP) * 3 - GAP + PAD + BOTTOM;

  stripCanvas.width  = STRIP_W;
  stripCanvas.height = STRIP_H;
  const ctx = stripCanvas.getContext('2d');

  // Paper white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, STRIP_W, STRIP_H);

  // Draw each captured composite photo
  for (let i = 0; i < capturedPhotos.length; i++) {
    const img = await loadImage(capturedPhotos[i]);
    const y = PAD + i * (PHOTO_H + GAP);
    ctx.drawImage(img, PAD, y, PHOTO_W, PHOTO_H);
  }

  // Caption
  const caption = captionInput.value.trim() || 'SnapTogether 💕';
  ctx.fillStyle = '#3a3530';
  ctx.font = `300 19px 'Cormorant Garamond', Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillText(caption, STRIP_W / 2, STRIP_H - 22);

  // Date
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  ctx.fillStyle = '#b0a090';
  ctx.font = '300 11px Geist, system-ui, sans-serif';
  ctx.fillText(today, STRIP_W / 2, STRIP_H - 7);

  downloadBtn.href = stripCanvas.toDataURL('image/png');
  captureStatus.textContent = '';
  showScreen('result');
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ── Retake ────────────────────────────────────────────────────────────────────
retakeBtn.addEventListener('click', () => {
  capturedPhotos = [];
  showScreen('booth');
});

// ── Leave ─────────────────────────────────────────────────────────────────────
leaveBtn.addEventListener('click', () => {
  if (stripRunning) { sendData({ type: 'abortStrip' }); abortStrip('You left'); }
  stopPreviewLoop();
  if (conn) conn.close();
  if (mediaConn) mediaConn.close();
  if (peer) peer.destroy();
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  localStream = null; remoteStream = null; conn = null; mediaConn = null; peer = null;
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  bestieConnected = false; stripRunning = false; isSolo = false;
  stickers = []; capturedPhotos = [];
  setConnStatus('waiting', 'connecting…');
  showScreen('lobby');
});

// ── Copy code ─────────────────────────────────────────────────────────────────
copyCodeBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(roomCodeText.textContent).then(() => {
    copyCodeBtn.textContent = 'Copied!';
    setTimeout(() => copyCodeBtn.textContent = 'Copy', 2000);
  });
});
