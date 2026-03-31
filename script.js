// // ── State ────────────────────────────────────────────────────────────────────
// let peer = null;
// let conn = null;
// let localStream = null;
// let remoteStream = null;
// let mediaConn = null;
// let isSolo = false;
// let currentFilter = 'none';
// let localStickers = [];
// let capturedPhotos = [];
// let myName = 'You';
// let remoteName = 'Bestie';
// let isHost = false;
// let stripRunning = false;   // guard: true while a strip is in progress
// let bestieConnected = false;

// // ── DOM refs ─────────────────────────────────────────────────────────────────
// const $ = id => document.getElementById(id);

// const createRoomBtn  = $('createRoomBtn');
// const joinRoomBtn    = $('joinRoomBtn');
// const copyCodeBtn    = $('copyCodeBtn');
// const roomCodeDisplay = $('roomCodeDisplay');
// const roomCodeText   = $('roomCodeText');
// const waitingMsg     = $('waitingMsg');
// const lobbyStatus    = $('lobbyStatus');
// const soloBtn        = $('soloBtn');
// const yourNameCreate = $('yourNameCreate');
// const yourNameJoin   = $('yourNameJoin');
// const joinCodeInput  = $('joinCodeInput');

// const localVideo      = $('localVideo');
// const remoteVideo     = $('remoteVideo');
// const localCountdown  = $('localCountdown');
// const remoteCountdown = $('remoteCountdown');
// const localFlash      = $('localFlash');
// const remoteFlash     = $('remoteFlash');
// const captureBtn      = $('captureBtn');
// const captureStatus   = $('captureStatus');
// const captionInput    = $('captionInput');
// const noRemote        = $('noRemote');
// const myLabel         = $('myLabel');
// const remoteLabel     = $('remoteLabel');
// const roomBadge       = $('roomBadge');
// const leaveBtn        = $('leaveBtn');
// const clearStickersBtn = $('clearStickersBtn');
// const connStatus      = $('connStatus');
// const connLabel       = $('connLabel');
// const toast           = $('toast');

// const stripCanvas   = $('stripCanvas');
// const downloadBtn   = $('downloadBtn');
// const retakeBtn     = $('retakeBtn');
// const captureCanvas = $('captureCanvas');

// // ── Toast ─────────────────────────────────────────────────────────────────────
// let toastTimer = null;
// function showToast(msg, duration = 3000) {
//   toast.textContent = msg;
//   toast.classList.add('show');
//   clearTimeout(toastTimer);
//   toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
// }

// // ── Connection status dot ─────────────────────────────────────────────────────
// // states: 'waiting' | 'connected' | 'dropped' | 'solo'
// function setConnStatus(state, label) {
//   connStatus.className = 'conn-status ' + state;
//   connLabel.textContent = label;
// }

// // ── Capture button gating ─────────────────────────────────────────────────────
// function updateCaptureBtn() {
//   const canShoot = isSolo || bestieConnected;
//   captureBtn.disabled = !canShoot || stripRunning;
//   captureBtn.title = canShoot ? '' : 'Waiting for your bestie to connect…';
// }

// // ── Tab switching ─────────────────────────────────────────────────────────────
// document.querySelectorAll('.tab-btn').forEach(btn => {
//   btn.addEventListener('click', () => {
//     document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
//     document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
//     btn.classList.add('active');
//     $(`tab-${btn.dataset.tab}`).classList.add('active');
//   });
// });

// // ── Screen switcher ───────────────────────────────────────────────────────────
// function showScreen(id) {
//   document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
//   $(id).classList.add('active');
// }

// // ── Camera ────────────────────────────────────────────────────────────────────
// async function startCamera() {
//   try {
//     localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
//     localVideo.srcObject = localStream;
//   } catch (e) {
//     alert('Camera/mic access is needed for the photobooth 📸\nPlease allow permissions and refresh.');
//     throw e;
//   }
// }

// // ── PeerJS helpers ────────────────────────────────────────────────────────────
// function generateCode() {
//   const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
//   let code = '';
//   for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
//   return 'ST-' + code;
// }

// // ── Create room ───────────────────────────────────────────────────────────────
// createRoomBtn.addEventListener('click', async () => {
//   myName = yourNameCreate.value.trim() || 'You';
//   myLabel.textContent = myName;
//   isHost = true;
//   createRoomBtn.disabled = true;
//   lobbyStatus.textContent = 'Setting up your room…';

//   try { await startCamera(); } catch { createRoomBtn.disabled = false; return; }

//   const roomCode = generateCode();
//   peer = new Peer(roomCode, { debug: 0 });

//   peer.on('open', id => {
//     roomCodeText.textContent = id;
//     roomCodeDisplay.classList.remove('hidden');
//     waitingMsg.classList.remove('hidden');
//     lobbyStatus.textContent = '';
//     createRoomBtn.disabled = false;
//     roomBadge.textContent = id;
//     setConnStatus('waiting', 'waiting for bestie…');
//     updateCaptureBtn();
//     showScreen('booth');
//   });

//   peer.on('connection', c => {
//     conn = c;
//     setupDataConnection();
//   });

//   peer.on('call', call => {
//     mediaConn = call;
//     call.answer(localStream);
//     call.on('stream', stream => {
//       remoteStream = stream;
//       remoteVideo.srcObject = stream;
//       noRemote.style.display = 'none';
//     });
//     call.on('error', () => handleBestieDropped());
//   });

//   peer.on('error', e => {
//     lobbyStatus.textContent = 'Connection error: ' + e.type;
//     createRoomBtn.disabled = false;
//   });
// });

// // ── Join room ─────────────────────────────────────────────────────────────────
// joinRoomBtn.addEventListener('click', async () => {
//   const code = joinCodeInput.value.trim().toUpperCase();
//   if (!code) { lobbyStatus.textContent = 'Please enter a room code'; return; }
//   myName = yourNameJoin.value.trim() || 'You';
//   myLabel.textContent = myName;
//   isHost = false;
//   joinRoomBtn.disabled = true;
//   lobbyStatus.textContent = 'Connecting…';

//   try { await startCamera(); } catch { joinRoomBtn.disabled = false; return; }

//   peer = new Peer(undefined, { debug: 0 });

//   peer.on('open', () => {
//     conn = peer.connect(code, { reliable: true });
//     setupDataConnection();

//     mediaConn = peer.call(code, localStream);
//     mediaConn.on('stream', stream => {
//       remoteStream = stream;
//       remoteVideo.srcObject = stream;
//       noRemote.style.display = 'none';
//     });
//     mediaConn.on('error', () => handleBestieDropped());

//     roomBadge.textContent = code;
//     setConnStatus('waiting', 'connecting…');
//     updateCaptureBtn();
//     showScreen('booth');
//     joinRoomBtn.disabled = false;
//   });

//   peer.on('error', () => {
//     lobbyStatus.textContent = 'Could not connect — check the code and try again.';
//     joinRoomBtn.disabled = false;
//   });
// });

// // ── Data connection setup ─────────────────────────────────────────────────────
// function setupDataConnection() {
//   conn.on('open', () => {
//     conn.send({ type: 'hello', name: myName });
//   });

//   conn.on('data', data => {
//     if (data.type === 'hello') {
//       remoteName = data.name;
//       remoteLabel.textContent = remoteName;
//       bestieConnected = true;
//       setConnStatus('connected', `${remoteName} is here`);
//       showToast(`${remoteName} joined the booth ✨`);
//       updateCaptureBtn();
//     }
//     if (data.type === 'startStrip') {
//       runStripLocal(false);
//     }
//     if (data.type === 'remoteCountdown') {
//       showCountdownRemote(data.count);
//     }
//     if (data.type === 'remoteFlash') {
//       flashEffect(remoteFlash);
//     }
//     if (data.type === 'abortStrip') {
//       abortStrip(`${remoteName} disconnected mid-strip 💔`);
//     }
//   });

//   conn.on('close', () => {
//     handleBestieDropped();
//   });

//   conn.on('error', () => {
//     handleBestieDropped();
//   });
// }

// function sendData(obj) {
//   if (conn && conn.open) conn.send(obj);
// }

// // ── Bestie dropped ────────────────────────────────────────────────────────────
// function handleBestieDropped() {
//   if (!bestieConnected && !stripRunning) return; // spurious on first connect attempt
//   bestieConnected = false;
//   setConnStatus('dropped', `${remoteName} disconnected`);
//   noRemote.style.display = 'flex';
//   noRemote.querySelector('span').textContent = `${remoteName} left 💔\nShare the code to reconnect`;
//   showToast(`${remoteName} left the booth`, 4000);

//   if (stripRunning) {
//     abortStrip(`${remoteName} disconnected — strip cancelled`);
//   }
//   updateCaptureBtn();
// }

// // ── Solo mode ─────────────────────────────────────────────────────────────────
// soloBtn.addEventListener('click', async () => {
//   isSolo = true;
//   myName = yourNameCreate.value.trim() || 'You';
//   myLabel.textContent = myName;
//   roomBadge.textContent = 'solo mode';
//   setConnStatus('solo', 'solo mode');
//   noRemote.querySelector('span').textContent = 'solo mode';
//   await startCamera();
//   updateCaptureBtn();
//   showScreen('booth');
// });

// // ── Filters ───────────────────────────────────────────────────────────────────
// document.querySelectorAll('.filter-pill').forEach(pill => {
//   pill.addEventListener('click', () => {
//     document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
//     pill.classList.add('active');
//     currentFilter = pill.dataset.filter;
//     localVideo.style.filter = currentFilter;
//   });
// });

// // ── Stickers ──────────────────────────────────────────────────────────────────
// document.querySelectorAll('.sticker-btn').forEach(btn => {
//   btn.addEventListener('click', () => {
//     const emoji = btn.dataset.sticker;
//     const x = 10 + Math.random() * 70;
//     const y = 10 + Math.random() * 70;
//     localStickers.push({ emoji, x, y });
//     renderLocalStickers();
//   });
// });

// clearStickersBtn.addEventListener('click', () => {
//   localStickers = [];
//   renderLocalStickers();
// });

// function renderLocalStickers() {
//   const layer = $('localStickers');
//   layer.innerHTML = '';
//   localStickers.forEach(s => {
//     const span = document.createElement('span');
//     span.className = 'sticker-on-cam';
//     span.textContent = s.emoji;
//     span.style.left = s.x + '%';
//     span.style.top  = s.y + '%';
//     layer.appendChild(span);
//   });
// }

// // ── Flash effect ──────────────────────────────────────────────────────────────
// function flashEffect(el) {
//   el.style.opacity = '1';
//   setTimeout(() => { el.style.opacity = '0'; }, 120);
// }

// // ── Countdown ─────────────────────────────────────────────────────────────────
// function showCountdownRemote(n) {
//   remoteCountdown.textContent = n > 0 ? n : '';
// }

// // ── Capture frame ─────────────────────────────────────────────────────────────
// function captureFrame() {
//   const w = localVideo.videoWidth || 640;
//   const h = localVideo.videoHeight || 480;
//   captureCanvas.width = w;
//   captureCanvas.height = h;
//   const ctx = captureCanvas.getContext('2d');
//   ctx.filter = currentFilter === 'none' ? 'none' : currentFilter;
//   ctx.drawImage(localVideo, 0, 0, w, h);
//   ctx.filter = 'none';
//   localStickers.forEach(s => {
//     ctx.font = `${Math.round(w * 0.08)}px serif`;
//     ctx.fillText(s.emoji, (s.x / 100) * w, (s.y / 100) * h);
//   });
//   return captureCanvas.toDataURL('image/png');
// }

// // ── Strip abort ───────────────────────────────────────────────────────────────
// let abortRequested = false;
// function abortStrip(reason) {
//   if (!stripRunning) return;
//   abortRequested = true;
//   localCountdown.textContent = '';
//   remoteCountdown.textContent = '';
//   captureStatus.textContent = reason;
//   setTimeout(() => {
//     if (captureStatus.textContent === reason) captureStatus.textContent = '';
//   }, 3500);
// }

// // ── Strip capture ─────────────────────────────────────────────────────────────
// captureBtn.addEventListener('click', () => {
//   if (captureBtn.disabled || stripRunning) return;
//   if (!isSolo) sendData({ type: 'startStrip' });
//   runStripLocal(true);
// });

// async function runStripLocal(isInitiator) {
//   stripRunning = true;
//   abortRequested = false;
//   capturedPhotos = [];
//   updateCaptureBtn();
//   captureStatus.textContent = 'Get ready…';

//   for (let i = 0; i < 3; i++) {
//     if (abortRequested) break;
//     captureStatus.textContent = `Photo ${i + 1} of 3…`;

//     for (let c = 3; c >= 1; c--) {
//       if (abortRequested) break;
//       localCountdown.textContent = c;
//       if (isInitiator) sendData({ type: 'remoteCountdown', count: c });
//       await sleep(1000);
//     }

//     if (abortRequested) break;
//     localCountdown.textContent = '';
//     if (isInitiator) sendData({ type: 'remoteCountdown', count: 0 });

//     flashEffect(localFlash);
//     if (isInitiator) sendData({ type: 'remoteFlash' });
//     capturedPhotos.push(captureFrame());
//     captureStatus.textContent = `✓ Photo ${i + 1} captured!`;

//     if (i < 2) await sleep(1200);
//   }

//   stripRunning = false;
//   updateCaptureBtn();

//   if (abortRequested || capturedPhotos.length < 3) return;

//   captureStatus.textContent = 'Building your strip…';
//   await sleep(300);
//   buildStrip();
// }

// function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// // ── Build photo strip ─────────────────────────────────────────────────────────
// async function buildStrip() {
//   const STRIP_W = 320;
//   const PAD     = 14;
//   const PHOTO_W = STRIP_W - PAD * 2;
//   const PHOTO_H = Math.round(PHOTO_W * (3 / 4));
//   const GAP     = 10;
//   const BOTTOM  = 56;
//   const STRIP_H = PAD + (PHOTO_H + GAP) * 3 - GAP + PAD + BOTTOM;

//   stripCanvas.width  = STRIP_W;
//   stripCanvas.height = STRIP_H;
//   const ctx = stripCanvas.getContext('2d');

//   ctx.fillStyle = '#ffffff';
//   ctx.fillRect(0, 0, STRIP_W, STRIP_H);

//   for (let i = 0; i < capturedPhotos.length; i++) {
//     const img = await loadImage(capturedPhotos[i]);
//     ctx.drawImage(img, PAD, PAD + i * (PHOTO_H + GAP), PHOTO_W, PHOTO_H);
//   }

//   const caption = captionInput.value.trim() || 'SnapTogether 💕';
//   ctx.fillStyle = '#444';
//   ctx.font = `500 17px 'Cormorant Garamond', Georgia, serif`;
//   ctx.textAlign = 'center';
//   ctx.fillText(caption, STRIP_W / 2, STRIP_H - 20);

//   const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
//   ctx.fillStyle = '#aaa';
//   ctx.font = '11px Geist, system-ui, sans-serif';
//   ctx.fillText(today, STRIP_W / 2, STRIP_H - 6);

//   downloadBtn.href = stripCanvas.toDataURL('image/png');
//   captureStatus.textContent = '';
//   showScreen('result');
// }

// function loadImage(src) {
//   return new Promise((resolve, reject) => {
//     const img = new Image();
//     img.onload = () => resolve(img);
//     img.onerror = reject;
//     img.src = src;
//   });
// }

// // ── Retake ────────────────────────────────────────────────────────────────────
// retakeBtn.addEventListener('click', () => {
//   capturedPhotos = [];
//   showScreen('booth');
// });

// // ── Leave ─────────────────────────────────────────────────────────────────────
// leaveBtn.addEventListener('click', () => {
//   if (stripRunning) {
//     sendData({ type: 'abortStrip' });
//     abortStrip('You left the booth');
//   }
//   if (conn) conn.close();
//   if (mediaConn) mediaConn.close();
//   if (peer) peer.destroy();
//   if (localStream) localStream.getTracks().forEach(t => t.stop());
//   localStream = null; remoteStream = null;
//   conn = null; mediaConn = null; peer = null;
//   localVideo.srcObject = null;
//   remoteVideo.srcObject = null;
//   bestieConnected = false;
//   stripRunning = false;
//   isSolo = false;
//   localStickers = [];
//   capturedPhotos = [];
//   noRemote.style.display = 'flex';
//   noRemote.querySelector('span').textContent = 'Waiting for\nyour bestie…';
//   setConnStatus('waiting', 'connecting…');
//   showScreen('lobby');
// });

// // ── Copy code ─────────────────────────────────────────────────────────────────
// copyCodeBtn.addEventListener('click', () => {
//   navigator.clipboard.writeText(roomCodeText.textContent).then(() => {
//     copyCodeBtn.textContent = 'Copied!';
//     setTimeout(() => copyCodeBtn.textContent = 'Copy', 2000);
//   });
// });
// ── State ────────────────────────────────────────────────────────────────────
let peer          = null;
let conn          = null;
let localStream   = null;
let remoteStream  = null;
let mediaConn     = null;
let isSolo        = false;
let currentFilter = 'none';
let stickers      = [];        // [{emoji, x, y}] — positions as % of full canvas
let capturedPhotos = [];
let myName        = 'You';
let remoteName    = 'Bestie';
let bestieConnected = false;
let stripRunning  = false;
let abortRequested = false;
let rafId         = null;      // requestAnimationFrame handle

// Canvas dimensions  (2:1 ratio — two square-ish faces side by side)
const CANVAS_W = 1280;
const CANVAS_H = 480;

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
const toastEl         = $('toast');
const stripCanvas     = $('stripCanvas');
const downloadBtn     = $('downloadBtn');
const retakeBtn       = $('retakeBtn');
const captureCanvas   = $('captureCanvas');
const remotePlaceholder = $('remotePlaceholder');

// Set canvas internal resolution
previewCanvas.width  = CANVAS_W;
previewCanvas.height = CANVAS_H;
const ctx = previewCanvas.getContext('2d');

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, ms = 3200) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

// ── Connection status ─────────────────────────────────────────────────────────
function setConnStatus(state, label) {
  connStatus.className = 'conn-status ' + state;
  connLabel.textContent = label;
}

// ── Capture button gating ─────────────────────────────────────────────────────
function updateCaptureBtn() {
  const canShoot = isSolo || bestieConnected;
  captureBtn.disabled = !canShoot || stripRunning;
  captureBtn.title = canShoot ? '' : 'Waiting for your bestie to connect…';
}

// ── Live canvas compositing loop ──────────────────────────────────────────────
function startCompositing() {
  if (rafId) cancelAnimationFrame(rafId);

  function draw() {
    const W = CANVAS_W, H = CANVAS_H;
    const half = W / 2;

    ctx.clearRect(0, 0, W, H);

    // Apply filter across entire canvas
    ctx.filter = currentFilter === 'none' ? 'none' : currentFilter;

    // Left half — local video (mirrored like a selfie)
    if (localVideo.readyState >= 2) {
      ctx.save();
      ctx.translate(half, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(localVideo, 0, 0, half, H);
      ctx.restore();
    } else {
      ctx.fillStyle = '#1c1814';
      ctx.fillRect(0, 0, half, H);
    }

    // Right half — remote video (natural orientation)
    if (bestieConnected && remoteVideo.readyState >= 2) {
      ctx.drawImage(remoteVideo, half, 0, half, H);
    } else if (!isSolo) {
      // Placeholder — dark fill; the HTML overlay handles the text
      ctx.fillStyle = '#1c1814';
      ctx.fillRect(half, 0, half, H);
    }

    // In solo mode, mirror local to right side too (so you can see yourself centered)
    if (isSolo && localVideo.readyState >= 2) {
      ctx.save();
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(localVideo, half, 0, half, H);
      ctx.restore();
    }

    ctx.filter = 'none';

    // Centre divider line (thin, subtle)
    ctx.strokeStyle = 'rgba(28,24,20,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(half, 0);
    ctx.lineTo(half, H);
    ctx.stroke();

    // Draw stickers on top
    stickers.forEach(s => {
      const sx = (s.x / 100) * W;
      const sy = (s.y / 100) * H;
      ctx.font = `${Math.round(H * 0.12)}px serif`;
      ctx.fillText(s.emoji, sx, sy);
    });

    rafId = requestAnimationFrame(draw);
  }

  draw();
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
}

// ── Camera ────────────────────────────────────────────────────────────────────
async function startCamera() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    // Wait for video to be ready then start drawing
    localVideo.onloadedmetadata = () => startCompositing();
  } catch (e) {
    alert('Camera/mic access is needed 📸\nPlease allow permissions and refresh.');
    throw e;
  }
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
  lobbyStatus.textContent = 'Setting up your room…';
  try { await startCamera(); } catch { createRoomBtn.disabled = false; return; }

  const code = generateCode();
  peer = new Peer(code, { debug: 0 });

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

  peer.on('connection', c => { conn = c; setupDataConn(); });

  peer.on('call', call => {
    mediaConn = call;
    call.answer(localStream);
    call.on('stream', stream => {
      remoteStream = stream;
      remoteVideo.srcObject = stream;
      if (remotePlaceholder) remotePlaceholder.classList.add('hidden');
    });
    call.on('error', handleDrop);
  });

  peer.on('error', e => { lobbyStatus.textContent = 'Error: ' + e.type; createRoomBtn.disabled = false; });
});

joinRoomBtn.addEventListener('click', async () => {
  const code = joinCodeInput.value.trim().toUpperCase();
  if (!code) { lobbyStatus.textContent = 'Please enter a room code'; return; }
  myName = yourNameJoin.value.trim() || 'You';
  myLabel.textContent = myName;
  joinRoomBtn.disabled = true;
  lobbyStatus.textContent = 'Connecting…';
  try { await startCamera(); } catch { joinRoomBtn.disabled = false; return; }

  peer = new Peer(undefined, { debug: 0 });

  peer.on('open', () => {
    conn = peer.connect(code, { reliable: true });
    setupDataConn();
    mediaConn = peer.call(code, localStream);
    mediaConn.on('stream', stream => {
      remoteStream = stream;
      remoteVideo.srcObject = stream;
      if (remotePlaceholder) remotePlaceholder.classList.add('hidden');
    });
    mediaConn.on('error', handleDrop);
    roomBadge.textContent = code;
    setConnStatus('waiting', 'connecting…');
    updateCaptureBtn();
    showScreen('booth');
    joinRoomBtn.disabled = false;
  });

  peer.on('error', () => { lobbyStatus.textContent = 'Could not connect — check the code.'; joinRoomBtn.disabled = false; });
});

function setupDataConn() {
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
    if (data.type === 'startStrip')    runStripLocal(false);
    if (data.type === 'countdown')     showCountdown(data.n);
    if (data.type === 'flash')         doFlash();
    if (data.type === 'abortStrip')    abortStrip(`${remoteName} disconnected`);
  });

  conn.on('close', handleDrop);
  conn.on('error', handleDrop);
}

function sendData(obj) { if (conn && conn.open) conn.send(obj); }

// ── Bestie dropped ────────────────────────────────────────────────────────────
function handleDrop() {
  bestieConnected = false;
  setConnStatus('dropped', `${remoteName} disconnected`);
  if (remotePlaceholder) remotePlaceholder.classList.remove('hidden');
  showToast(`${remoteName} left the booth`, 4000);
  if (stripRunning) abortStrip(`${remoteName} disconnected — strip cancelled`);
  updateCaptureBtn();
}

// ── Solo mode ─────────────────────────────────────────────────────────────────
soloBtn.addEventListener('click', async () => {
  isSolo = true;
  myName = yourNameCreate.value.trim() || 'You';
  myLabel.textContent = myName;
  remoteLabel.textContent = myName; // mirror label
  roomBadge.textContent = 'solo';
  setConnStatus('solo', 'solo mode');
  if (remotePlaceholder) remotePlaceholder.classList.add('hidden');
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
    // Place sticker in a random zone that avoids the very edges
    stickers.push({
      emoji: btn.dataset.sticker,
      x: 8 + Math.random() * 84,
      y: 15 + Math.random() * 70
    });
  });
});
clearStickersBtn.addEventListener('click', () => { stickers = []; });

// ── Flash ─────────────────────────────────────────────────────────────────────
function doFlash() {
  flashOverlay.style.opacity = '1';
  setTimeout(() => { flashOverlay.style.opacity = '0'; }, 120);
}

// ── Countdown display ─────────────────────────────────────────────────────────
function showCountdown(n) {
  countdownOverlay.textContent = n > 0 ? n : '';
}

// ── Capture a still from the live composite canvas ────────────────────────────
function captureFrame() {
  // Draw one final frame at full resolution into captureCanvas
  captureCanvas.width  = CANVAS_W;
  captureCanvas.height = CANVAS_H;
  const c = captureCanvas.getContext('2d');

  c.filter = currentFilter === 'none' ? 'none' : currentFilter;
  const half = CANVAS_W / 2;

  // Left — local (mirrored)
  if (localVideo.readyState >= 2) {
    c.save(); c.translate(half, 0); c.scale(-1, 1);
    c.drawImage(localVideo, 0, 0, half, CANVAS_H);
    c.restore();
  }

  // Right — remote or mirrored local for solo
  if (bestieConnected && remoteVideo.readyState >= 2) {
    c.drawImage(remoteVideo, half, 0, half, CANVAS_H);
  } else if (isSolo && localVideo.readyState >= 2) {
    c.save(); c.translate(CANVAS_W, 0); c.scale(-1, 1);
    c.drawImage(localVideo, half, 0, half, CANVAS_H);
    c.restore();
  }

  c.filter = 'none';

  // Divider
  c.strokeStyle = 'rgba(28,24,20,0.35)';
  c.lineWidth = 2;
  c.beginPath(); c.moveTo(half, 0); c.lineTo(half, CANVAS_H); c.stroke();

  // Stickers
  stickers.forEach(s => {
    c.font = `${Math.round(CANVAS_H * 0.12)}px serif`;
    c.fillText(s.emoji, (s.x / 100) * CANVAS_W, (s.y / 100) * CANVAS_H);
  });

  return captureCanvas.toDataURL('image/jpeg', 0.92);
}

// ── Strip abort ───────────────────────────────────────────────────────────────
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
  stripRunning    = true;
  abortRequested  = false;
  capturedPhotos  = [];
  updateCaptureBtn();
  captureStatus.textContent = 'Get ready…';

  for (let i = 0; i < 3; i++) {
    if (abortRequested) break;
    captureStatus.textContent = `Photo ${i + 1} of 3…`;

    // 3-second countdown
    for (let c = 3; c >= 1; c--) {
      if (abortRequested) break;
      showCountdown(c);
      if (isInitiator) sendData({ type: 'countdown', n: c });
      await sleep(1000);
    }
    if (abortRequested) break;
    showCountdown(0);
    if (isInitiator) sendData({ type: 'countdown', n: 0 });

    // Flash & capture
    doFlash();
    if (isInitiator) sendData({ type: 'flash' });
    capturedPhotos.push(captureFrame());
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Build photo strip ─────────────────────────────────────────────────────────
async function buildStrip() {
  // Each photo is CANVAS_W × CANVAS_H (wide). Strip stacks them.
  const PAD      = 18;
  const GAP      = 12;
  const PHOTO_W  = 640;   // display width in strip
  const PHOTO_H  = Math.round(PHOTO_W * (CANVAS_H / CANVAS_W)); // maintain ratio
  const BOTTOM   = 60;
  const STRIP_W  = PHOTO_W + PAD * 2;
  const STRIP_H  = PAD + (PHOTO_H + GAP) * 3 - GAP + PAD + BOTTOM;

  stripCanvas.width  = STRIP_W;
  stripCanvas.height = STRIP_H;
  const c = stripCanvas.getContext('2d');

  // White background
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, STRIP_W, STRIP_H);

  // Photos
  for (let i = 0; i < capturedPhotos.length; i++) {
    const img = await loadImage(capturedPhotos[i]);
    c.drawImage(img, PAD, PAD + i * (PHOTO_H + GAP), PHOTO_W, PHOTO_H);
  }

  // Caption
  const caption = captionInput.value.trim() || 'SnapTogether 💕';
  c.fillStyle = '#3a3330';
  c.font = `300 20px 'Cormorant Garamond', Georgia, serif`;
  c.textAlign = 'center';
  c.fillText(caption, STRIP_W / 2, STRIP_H - 22);

  // Date
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  c.fillStyle = '#b0a89e';
  c.font = '12px Geist, system-ui, sans-serif';
  c.fillText(today, STRIP_W / 2, STRIP_H - 7);

  downloadBtn.href = stripCanvas.toDataURL('image/png');
  captureStatus.textContent = '';
  showScreen('result');
}

const loadImage = src => new Promise((res, rej) => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = rej;
  img.src = src;
});

// ── Retake ────────────────────────────────────────────────────────────────────
retakeBtn.addEventListener('click', () => { capturedPhotos = []; showScreen('booth'); });

// ── Leave ─────────────────────────────────────────────────────────────────────
leaveBtn.addEventListener('click', () => {
  if (stripRunning) { sendData({ type: 'abortStrip' }); abortStrip('You left'); }
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  [conn, mediaConn].forEach(c => c && c.close());
  if (peer) peer.destroy();
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  localStream = null; remoteStream = null; conn = null; mediaConn = null; peer = null;
  localVideo.srcObject = null; remoteVideo.srcObject = null;
  bestieConnected = false; stripRunning = false; isSolo = false;
  stickers = []; capturedPhotos = [];
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  if (remotePlaceholder) remotePlaceholder.classList.remove('hidden');
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
