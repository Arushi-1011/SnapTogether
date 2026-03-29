// ── State ───────────────────────────────────────────────────────────────────
let peer = null;
let conn = null;
let localStream = null;
let remoteStream = null;
let mediaConn = null;
let isSolo = false;
let currentFilter = 'none';
let localStickers = [];   // [{emoji, x, y}]
let capturedPhotos = [];  // up to 3 DataURLs
let myName = 'You';
let remoteName = 'Bestie';
let isHost = false;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// Lobby
const lobbyEl       = $('lobby');
const boothEl       = $('booth');
const resultEl      = $('result');
const createRoomBtn = $('createRoomBtn');
const joinRoomBtn   = $('joinRoomBtn');
const copyCodeBtn   = $('copyCodeBtn');
const roomCodeDisplay = $('roomCodeDisplay');
const roomCodeText  = $('roomCodeText');
const waitingMsg    = $('waitingMsg');
const lobbyStatus   = $('lobbyStatus');
const soloBtn       = $('soloBtn');
const yourNameCreate = $('yourNameCreate');
const yourNameJoin  = $('yourNameJoin');
const joinCodeInput = $('joinCodeInput');

// Booth
const localVideo    = $('localVideo');
const remoteVideo   = $('remoteVideo');
const localCountdown  = $('localCountdown');
const remoteCountdown = $('remoteCountdown');
const localFlash    = $('localFlash');
const remoteFlash   = $('remoteFlash');
const captureBtn    = $('captureBtn');
const captureStatus = $('captureStatus');
const captionInput  = $('captionInput');
const noRemote      = $('noRemote');
const myLabel       = $('myLabel');
const remoteLabel   = $('remoteLabel');
const roomBadge     = $('roomBadge');
const leaveBtn      = $('leaveBtn');
const clearStickersBtn = $('clearStickersBtn');

// Result
const stripCanvas   = $('stripCanvas');
const downloadBtn   = $('downloadBtn');
const retakeBtn     = $('retakeBtn');
const captureCanvas = $('captureCanvas');

// ── Tab switching (lobby) ────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ── Screen switcher ──────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

// ── Camera ───────────────────────────────────────────────────────────────────
async function startCamera() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
  } catch (e) {
    alert('Camera/mic access is needed for the photobooth 📸\nPlease allow permissions and refresh.');
    throw e;
  }
}

// ── PeerJS ───────────────────────────────────────────────────────────────────
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

  await startCamera();

  const roomCode = generateCode();
  peer = new Peer(roomCode, { debug: 0 });

  peer.on('open', id => {
    roomCodeText.textContent = id;
    roomCodeDisplay.classList.remove('hidden');
    waitingMsg.classList.remove('hidden');
    lobbyStatus.textContent = '';
    createRoomBtn.disabled = false;
  });

  peer.on('connection', c => {
    conn = c;
    setupDataConnection();
    // Answer incoming call
  });

  peer.on('call', call => {
    mediaConn = call;
    call.answer(localStream);
    call.on('stream', stream => {
      remoteStream = stream;
      remoteVideo.srcObject = stream;
      noRemote.style.display = 'none';
    });
  });

  peer.on('error', e => { lobbyStatus.textContent = 'Connection error: ' + e.type; createRoomBtn.disabled = false; });

  // Enter booth immediately (host waits there)
  roomBadge.textContent = roomCode;
  showScreen('booth');
});

joinRoomBtn.addEventListener('click', async () => {
  const code = joinCodeInput.value.trim().toUpperCase();
  if (!code) { lobbyStatus.textContent = 'Please enter a room code'; return; }
  myName = yourNameJoin.value.trim() || 'You';
  myLabel.textContent = myName;
  isHost = false;
  joinRoomBtn.disabled = true;
  lobbyStatus.textContent = 'Connecting…';

  await startCamera();

  peer = new Peer(undefined, { debug: 0 });

  peer.on('open', id => {
    conn = peer.connect(code, { reliable: true });
    setupDataConnection();

    // Call the host
    mediaConn = peer.call(code, localStream);
    mediaConn.on('stream', stream => {
      remoteStream = stream;
      remoteVideo.srcObject = stream;
      noRemote.style.display = 'none';
    });

    mediaConn.on('error', e => lobbyStatus.textContent = 'Call error');
    roomBadge.textContent = code;
    showScreen('booth');
    joinRoomBtn.disabled = false;
  });

  peer.on('error', e => {
    lobbyStatus.textContent = 'Could not connect. Check the code and try again.';
    joinRoomBtn.disabled = false;
  });
});

function setupDataConnection() {
  conn.on('open', () => {
    conn.send({ type: 'hello', name: myName });
  });

  conn.on('data', data => {
    if (data.type === 'hello') {
      remoteName = data.name;
      remoteLabel.textContent = remoteName;
    }
    if (data.type === 'startStrip') {
      // Remote triggered a strip — sync countdown & capture on our side
      runStripLocal(false);
    }
    if (data.type === 'remoteCountdown') {
      showCountdownRemote(data.count);
    }
    if (data.type === 'remoteFlash') {
      flashEffect(remoteFlash);
    }
  });

  conn.on('close', () => {
    noRemote.style.display = 'flex';
    noRemote.querySelector('span').textContent = `${remoteName} left the booth 💔`;
  });
}

function sendData(obj) {
  if (conn && conn.open) conn.send(obj);
}

// ── Solo mode ─────────────────────────────────────────────────────────────────
soloBtn.addEventListener('click', async () => {
  isSolo = true;
  myName = 'You';
  myLabel.textContent = myName;
  roomBadge.textContent = 'Solo Mode';
  noRemote.querySelector('span').textContent = 'Solo mode —\nno bestie connected';
  await startCamera();
  showScreen('booth');
});

// ── Filters ───────────────────────────────────────────────────────────────────
document.querySelectorAll('.filter-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentFilter = pill.dataset.filter;
    localVideo.style.filter = currentFilter;
  });
});

// ── Stickers ──────────────────────────────────────────────────────────────────
document.querySelectorAll('.sticker-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const emoji = btn.dataset.sticker;
    // Place at random position inside cam
    const x = 10 + Math.random() * 70;
    const y = 10 + Math.random() * 70;
    localStickers.push({ emoji, x, y });
    renderLocalStickers();
  });
});

clearStickersBtn.addEventListener('click', () => {
  localStickers = [];
  renderLocalStickers();
});

function renderLocalStickers() {
  const layer = $('localStickers');
  layer.innerHTML = '';
  localStickers.forEach(s => {
    const span = document.createElement('span');
    span.className = 'sticker-on-cam';
    span.textContent = s.emoji;
    span.style.left = s.x + '%';
    span.style.top  = s.y + '%';
    layer.appendChild(span);
  });
}

// ── Flash effect ──────────────────────────────────────────────────────────────
function flashEffect(el) {
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 120);
}

// ── Countdown helper ──────────────────────────────────────────────────────────
function runCountdown(el, seconds) {
  return new Promise(resolve => {
    let n = seconds;
    el.textContent = n;
    const iv = setInterval(() => {
      n--;
      if (n > 0) {
        el.textContent = n;
      } else {
        clearInterval(iv);
        el.textContent = '';
        resolve();
      }
    }, 1000);
  });
}

function showCountdownRemote(n) {
  remoteCountdown.textContent = n > 0 ? n : '';
}

// ── Capture a single frame from localVideo to DataURL ─────────────────────────
function captureFrame() {
  const w = localVideo.videoWidth || 640;
  const h = localVideo.videoHeight || 480;
  captureCanvas.width = w;
  captureCanvas.height = h;
  const ctx = captureCanvas.getContext('2d');

  // Apply filter
  ctx.filter = currentFilter === 'none' ? 'none' : currentFilter;
  ctx.drawImage(localVideo, 0, 0, w, h);
  ctx.filter = 'none';

  // Draw stickers onto capture
  const camWrap = document.getElementById('myCamWrap');
  const cw = camWrap.offsetWidth;
  const ch = camWrap.offsetHeight;
  localStickers.forEach(s => {
    const sx = (s.x / 100) * w;
    const sy = (s.y / 100) * h;
    ctx.font = `${Math.round(w * 0.08)}px serif`;
    ctx.fillText(s.emoji, sx, sy);
  });

  return captureCanvas.toDataURL('image/png');
}

// ── Strip capture logic ────────────────────────────────────────────────────────
captureBtn.addEventListener('click', () => {
  if (captureBtn.disabled) return;
  captureBtn.disabled = true;

  if (!isSolo) {
    sendData({ type: 'startStrip' });
  }
  runStripLocal(true);
});

async function runStripLocal(isInitiator) {
  capturedPhotos = [];
  captureStatus.textContent = 'Get ready…';

  for (let i = 0; i < 3; i++) {
    captureStatus.textContent = `Photo ${i + 1} of 3…`;

    // Countdown
    for (let c = 3; c >= 1; c--) {
      localCountdown.textContent = c;
      if (!isInitiator) showCountdownRemote(c);
      if (isInitiator) sendData({ type: 'remoteCountdown', count: c });
      await sleep(1000);
    }
    localCountdown.textContent = '';
    if (isInitiator) sendData({ type: 'remoteCountdown', count: 0 });

    // Flash + capture
    flashEffect(localFlash);
    if (isInitiator) sendData({ type: 'remoteFlash' });
    const photo = captureFrame();
    capturedPhotos.push(photo);
    captureStatus.textContent = `✓ Photo ${i + 1} captured!`;

    if (i < 2) await sleep(1200);
  }

  captureStatus.textContent = 'Building your strip…';
  await sleep(300);
  buildStrip();
  captureBtn.disabled = false;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Build photo strip ─────────────────────────────────────────────────────────
async function buildStrip() {
  const STRIP_W = 320;
  const PAD     = 14;
  const PHOTO_W = STRIP_W - PAD * 2;
  const PHOTO_H = Math.round(PHOTO_W * (3 / 4));
  const GAP     = 10;
  const BOTTOM  = 56; // caption space

  const STRIP_H = PAD + (PHOTO_H + GAP) * 3 - GAP + PAD + BOTTOM;

  stripCanvas.width  = STRIP_W;
  stripCanvas.height = STRIP_H;

  const ctx = stripCanvas.getContext('2d');

  // White polaroid background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, STRIP_W, STRIP_H);

  // Load and draw photos
  for (let i = 0; i < capturedPhotos.length; i++) {
    const img = await loadImage(capturedPhotos[i]);
    const y = PAD + i * (PHOTO_H + GAP);
    ctx.drawImage(img, PAD, y, PHOTO_W, PHOTO_H);
  }

  // Caption
  const caption = captionInput.value.trim() || 'SnapTogether 💕';
  ctx.fillStyle = '#444';
  ctx.font = `500 17px 'Playfair Display', Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillText(caption, STRIP_W / 2, STRIP_H - 20);

  // Small date stamp
  const today = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  ctx.fillStyle = '#aaa';
  ctx.font = '11px DM Sans, sans-serif';
  ctx.fillText(today, STRIP_W / 2, STRIP_H - 6);

  // Update download link
  downloadBtn.href = stripCanvas.toDataURL('image/png');

  showScreen('result');
  captureStatus.textContent = '';
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
  if (conn) conn.close();
  if (mediaConn) mediaConn.close();
  if (peer) peer.destroy();
  if (localStream) localStream.getTracks().forEach(t => t.stop());
  localStream = null; remoteStream = null; conn = null; mediaConn = null; peer = null;
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  noRemote.style.display = 'flex';
  noRemote.querySelector('span').textContent = 'Waiting for\nyour bestie…';
  isSolo = false;
  localStickers = [];
  capturedPhotos = [];
  showScreen('lobby');
});

// ── Copy room code ─────────────────────────────────────────────────────────────
copyCodeBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(roomCodeText.textContent).then(() => {
    copyCodeBtn.textContent = 'Copied!';
    setTimeout(() => copyCodeBtn.textContent = 'Copy', 2000);
  });
});
