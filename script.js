// // ═══════════════════════════════════════════════════════════════════════════════
// // SnapTogether — script.js
// // Background removal via MediaPipe SelfieSegmentation.
// // Both persons are cut out and placed on one shared background canvas.
// // ═══════════════════════════════════════════════════════════════════════════════

// // ── State ────────────────────────────────────────────────────────────────────
// let peer = null, conn = null, mediaConn = null;
// let localStream = null, remoteStream = null;
// let isSolo = false, isHost = false;
// let bestieConnected = false, stripRunning = false;
// let myName = 'You', remoteName = 'Bestie';
// let currentFilter = 'none';
// let selectedBg = 'none';        // currently chosen background key
// let stickers = [];               // {emoji, x, y} in 0-1 coords on full canvas
// let capturedPhotos = [];
// let rafId = null;

// // Segmentation state
// let segmentation = null;         // MediaPipe SelfieSegmentation instance
// let segmentationReady = false;
// let localMask = null;            // latest segmentation mask canvas for local feed
// let localMaskCtx = null;
// let segCanvas = null;            // off-screen canvas fed to MediaPipe
// let segCtx = null;

// // ── Background renderers — solid curtain colours ──────────────────────────────
// const BG_RENDERERS = {
//   none:   null,
//   blush:  (ctx, w, h) => { ctx.fillStyle = '#e8b4b8'; ctx.fillRect(0, 0, w, h); },  // dusty pink
//   sage:   (ctx, w, h) => { ctx.fillStyle = '#8aab96'; ctx.fillRect(0, 0, w, h); },  // sage green
//   navy:   (ctx, w, h) => { ctx.fillStyle = '#2c3e6b'; ctx.fillRect(0, 0, w, h); },  // deep navy
//   cream:  (ctx, w, h) => { ctx.fillStyle = '#f0e6d3'; ctx.fillRect(0, 0, w, h); },  // warm cream
//   black:  (ctx, w, h) => { ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, w, h); },  // classic black
// };

// // Canvas resolution
// const HALF_W = 480, HALF_H = 360;
// const FULL_W = HALF_W * 2, FULL_H = HALF_H;

// // ── DOM ───────────────────────────────────────────────────────────────────────
// const $ = id => document.getElementById(id);
// const createRoomBtn    = $('createRoomBtn');
// const joinRoomBtn      = $('joinRoomBtn');
// const copyCodeBtn      = $('copyCodeBtn');
// const roomCodeDisplay  = $('roomCodeDisplay');
// const roomCodeText     = $('roomCodeText');
// const waitingMsg       = $('waitingMsg');
// const lobbyStatus      = $('lobbyStatus');
// const soloBtn          = $('soloBtn');
// const yourNameCreate   = $('yourNameCreate');
// const yourNameJoin     = $('yourNameJoin');
// const joinCodeInput    = $('joinCodeInput');
// const localVideo       = $('localVideo');
// const remoteVideo      = $('remoteVideo');
// const previewCanvas    = $('previewCanvas');
// const countdownOverlay = $('countdownOverlay');
// const flashOverlay     = $('flashOverlay');
// const captureBtn       = $('captureBtn');
// const captureStatus    = $('captureStatus');
// const captionInput     = $('captionInput');
// const myLabel          = $('myLabel');
// const remoteLabel      = $('remoteLabel');
// const roomBadge        = $('roomBadge');
// const leaveBtn         = $('leaveBtn');
// const clearStickersBtn = $('clearStickersBtn');
// const connStatus       = $('connStatus');
// const connLabel        = $('connLabel');
// const toast            = $('toast');
// const stripCanvas      = $('stripCanvas');
// const downloadBtn      = $('downloadBtn');
// const retakeBtn        = $('retakeBtn');
// const captureCanvas    = $('captureCanvas');
// const bgHint           = $('bgHint');

// // ── Toast ─────────────────────────────────────────────────────────────────────
// let toastTimer = null;
// function showToast(msg, dur = 3000) {
//   toast.textContent = msg;
//   toast.classList.add('show');
//   clearTimeout(toastTimer);
//   toastTimer = setTimeout(() => toast.classList.remove('show'), dur);
// }

// // ── Connection status ─────────────────────────────────────────────────────────
// function setConnStatus(state, label) {
//   connStatus.className = 'conn-status ' + state;
//   connLabel.textContent = label;
// }
// function updateCaptureBtn() {
//   const ready = isSolo || bestieConnected;
//   captureBtn.disabled = !ready || stripRunning;
//   captureBtn.title = ready ? '' : 'Waiting for your bestie…';
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

// function showScreen(id) {
//   document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
//   $(id).classList.add('active');
//   if (id === 'booth') startPreviewLoop();
//   else stopPreviewLoop();
// }

// // ── Camera ────────────────────────────────────────────────────────────────────
// async function startCamera() {
//   try {
//     localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
//     localVideo.srcObject = localStream;
//     await localVideo.play();
//   } catch (e) {
//     alert('Camera/mic access is needed 📸\nPlease allow permissions and refresh.');
//     throw e;
//   }
// }

// // ═══════════════════════════════════════════════════════════════════════════════
// // MEDIAPIPE SEGMENTATION
// // Runs on the local camera feed only. The remote feed's background was already
// // removed on the remote device before transmitting — but since WebRTC compresses
// // video and we can't run segmentation on the received stream reliably, we do a
// // soft cutout on the remote side using luminance + edge blending instead.
// // ═══════════════════════════════════════════════════════════════════════════════

// function initSegmentation() {
//   if (typeof SelfieSegmentation === 'undefined') {
//     console.warn('MediaPipe not loaded — background removal unavailable');
//     return;
//   }

//   // Off-screen canvas to feed frames to MediaPipe
//   segCanvas = document.createElement('canvas');
//   segCanvas.width  = HALF_W;
//   segCanvas.height = HALF_H;
//   segCtx = segCanvas.getContext('2d');

//   // Mask canvas — receives MediaPipe output
//   localMask = document.createElement('canvas');
//   localMask.width  = HALF_W;
//   localMask.height = HALF_H;
//   localMaskCtx = localMask.getContext('2d');

//   segmentation = new SelfieSegmentation({
//     locateFile: file =>
//       `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
//   });

//   segmentation.setOptions({ modelSelection: 1, selfieMode: true });

//   segmentation.onResults(results => {
//     if (!results.segmentationMask) return;
//     // Draw the mask onto our localMask canvas
//     localMaskCtx.clearRect(0, 0, HALF_W, HALF_H);
//     localMaskCtx.drawImage(results.segmentationMask, 0, 0, HALF_W, HALF_H);
//     segmentationReady = true;
//   });

//   segmentation.initialize().then(() => {
//     console.log('MediaPipe ready ✓');
//     pumpFramesToSegmentation();
//   }).catch(e => {
//     console.warn('MediaPipe init failed:', e);
//   });
// }

// // Feed frames from local video to MediaPipe at ~15fps (enough for smooth mask)
// let segPumpId = null;
// function pumpFramesToSegmentation() {
//   async function pump() {
//     if (!segmentation || !localVideo.srcObject) return;
//     if (localVideo.readyState >= 2) {
//       segCtx.drawImage(localVideo, 0, 0, HALF_W, HALF_H);
//       try { await segmentation.send({ image: segCanvas }); } catch (_) {}
//     }
//     segPumpId = setTimeout(pump, 66); // ~15fps for segmentation
//   }
//   pump();
// }

// function stopSegmentation() {
//   if (segPumpId) { clearTimeout(segPumpId); segPumpId = null; }
// }

// // ── Draw local person cutout onto ctx at (dx, dy, dw, dh) ────────────────────
// // Uses the segmentation mask: person pixels are drawn, background is transparent.
// // Falls back to drawing the full video if mask isn't ready.
// function drawLocalCutout(ctx, dx, dy, dw, dh, mirrored) {
//   if (!segmentationReady || selectedBg === 'none') {
//     // No background removal — draw full video
//     ctx.save();
//     if (mirrored) { ctx.translate(dx + dw, dy); ctx.scale(-1, 1); ctx.drawImage(localVideo, 0, 0, dw, dh); }
//     else           { ctx.drawImage(localVideo, dx, dy, dw, dh); }
//     ctx.restore();
//     return;
//   }

//   // 1. Create a temp canvas at the destination size
//   const tmp = document.createElement('canvas');
//   tmp.width = dw; tmp.height = dh;
//   const tctx = tmp.getContext('2d');

//   // 2. Draw the video frame
//   tctx.save();
//   if (mirrored) { tctx.translate(dw, 0); tctx.scale(-1, 1); }
//   tctx.drawImage(localVideo, 0, 0, dw, dh);
//   tctx.restore();

//   // 3. Use the mask as the alpha channel via destination-in
//   //    The mask is white=person, black=background
//   tctx.globalCompositeOperation = 'destination-in';
//   tctx.save();
//   if (mirrored) { tctx.translate(dw, 0); tctx.scale(-1, 1); }
//   tctx.drawImage(localMask, 0, 0, dw, dh);
//   tctx.restore();

//   // 4. Soft edge — blur the edges a tiny bit for a natural look
//   //    We do this by drawing a slightly expanded version behind with lower alpha
//   ctx.save();
//   ctx.globalAlpha = 0.15;
//   ctx.filter = 'blur(4px)';
//   ctx.drawImage(tmp, dx - 2, dy - 2, dw + 4, dh + 4);
//   ctx.filter = 'none';
//   ctx.globalAlpha = 1;
//   ctx.drawImage(tmp, dx, dy, dw, dh);
//   ctx.restore();
// }

// // Draw remote person cutout — we can't run segmentation on the received WebRTC
// // stream in real-time, so we use a canvas composition trick:
// // draw video, then mask the outer edges with a feathered vignette shape
// // centred on the middle of the frame where the person typically is.
// function drawRemoteCutout(ctx, dx, dy, dw, dh) {
//   if (selectedBg === 'none' || !remoteVideo.srcObject || remoteVideo.readyState < 2) {
//     if (remoteVideo.srcObject && remoteVideo.readyState >= 2)
//       ctx.drawImage(remoteVideo, dx, dy, dw, dh);
//     else
//       drawPlaceholder(ctx, dx, dy, dw, dh, remoteName);
//     return;
//   }

//   const tmp = document.createElement('canvas');
//   tmp.width = dw; tmp.height = dh;
//   const tctx = tmp.getContext('2d');

//   // Draw remote video
//   tctx.drawImage(remoteVideo, 0, 0, dw, dh);

//   // Radial mask: keeps centre (person area) fully opaque, fades edges
//   // This isn't perfect cutout but gives a natural blended-in look
//   const grad = tctx.createRadialGradient(
//     dw * 0.5, dh * 0.45,  // centre of person (slightly above centre)
//     dh * 0.22,             // inner radius — fully opaque
//     dw * 0.5, dh * 0.5,
//     dh * 0.62              // outer radius — fade to transparent
//   );
//   grad.addColorStop(0,   'rgba(0,0,0,1)');
//   grad.addColorStop(0.6, 'rgba(0,0,0,1)');
//   grad.addColorStop(1,   'rgba(0,0,0,0)');

//   tctx.globalCompositeOperation = 'destination-in';
//   tctx.fillStyle = grad;
//   tctx.fillRect(0, 0, dw, dh);

//   ctx.drawImage(tmp, dx, dy, dw, dh);
// }

// // ── Background renderers — solid curtain colours ──────────────────────────────
// // Each is just a flat fill — clean, like a real photobooth backdrop.

// // const BG_RENDERERS = {
// //   none:   null,
// //   blush:  (ctx, w, h) => { ctx.fillStyle = '#e8b4b8'; ctx.fillRect(0, 0, w, h); },  // dusty pink
// //   sage:   (ctx, w, h) => { ctx.fillStyle = '#8aab96'; ctx.fillRect(0, 0, w, h); },  // sage green
// //   navy:   (ctx, w, h) => { ctx.fillStyle = '#2c3e6b'; ctx.fillRect(0, 0, w, h); },  // deep navy
// //   cream:  (ctx, w, h) => { ctx.fillStyle = '#f0e6d3'; ctx.fillRect(0, 0, w, h); },  // warm cream
// //   black:  (ctx, w, h) => { ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, w, h); },  // classic black
// // };

// // ═══════════════════════════════════════════════════════════════════════════════
// // COMPOSITE PREVIEW LOOP
// // ═══════════════════════════════════════════════════════════════════════════════

// function startPreviewLoop() {
//   previewCanvas.width  = FULL_W;
//   previewCanvas.height = FULL_H;
//   const ctx = previewCanvas.getContext('2d');

//   function draw() {
//     ctx.clearRect(0, 0, FULL_W, FULL_H);

//     const bgRenderer = BG_RENDERERS[selectedBg];

//     if (bgRenderer) {
//       // ── Background removal mode ──────────────────────────────────────────
//       // 1. Draw shared background full-width
//       bgRenderer(ctx, FULL_W, FULL_H);

//       // 2. Apply colour filter over background (so persons stand out)
//       if (currentFilter !== 'none') ctx.filter = currentFilter;

//       // 3. Draw remote cutout on right half
//       drawRemoteCutout(ctx, HALF_W, 0, HALF_W, HALF_H);
//       ctx.filter = 'none';

//       // 4. Draw local cutout on left half (mirrored)
//       if (currentFilter !== 'none') ctx.filter = currentFilter;
//       drawLocalCutout(ctx, 0, 0, HALF_W, HALF_H, true);
//       ctx.filter = 'none';

//     } else {
//       // ── No background removal — original side-by-side ────────────────────
//       // Left half: local (mirrored)
//       ctx.save();
//       ctx.translate(HALF_W, 0);
//       ctx.scale(-1, 1);
//       if (currentFilter !== 'none') ctx.filter = currentFilter;
//       if (localVideo.readyState >= 2) ctx.drawImage(localVideo, 0, 0, HALF_W, HALF_H);
//       else drawPlaceholder(ctx, 0, 0, HALF_W, HALF_H, myName);
//       ctx.filter = 'none';
//       ctx.restore();

//       // Right half: remote
//       if (currentFilter !== 'none') ctx.filter = currentFilter;
//       if (remoteVideo.srcObject && remoteVideo.readyState >= 2)
//         ctx.drawImage(remoteVideo, HALF_W, 0, HALF_W, HALF_H);
//       else
//         drawPlaceholder(ctx, HALF_W, 0, HALF_W, HALF_H, remoteName);
//       ctx.filter = 'none';
//     }

//     // 5. Stickers
//     stickers.forEach(s => {
//       ctx.font = `${Math.round(FULL_H * 0.1)}px serif`;
//       ctx.fillText(s.emoji, s.x * FULL_W, s.y * FULL_H);
//     });

//     // 6. Vignette
//     drawVignette(ctx, FULL_W, FULL_H);

//     rafId = requestAnimationFrame(draw);
//   }
//   draw();
// }

// function stopPreviewLoop() {
//   if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
// }

// function drawPlaceholder(ctx, x, y, w, h, label) {
//   ctx.fillStyle = '#e8e1d6';
//   ctx.fillRect(x, y, w, h);
//   ctx.fillStyle = '#a09488';
//   ctx.font = '300 16px Geist, system-ui, sans-serif';
//   ctx.textAlign = 'center';
//   ctx.textBaseline = 'middle';
//   ctx.fillText(label || '…', x + w / 2, y + h / 2);
//   ctx.textAlign = 'left';
//   ctx.textBaseline = 'alphabetic';
// }

// function drawVignette(ctx, w, h) {
//   ctx.save();
//   const v = ctx.createRadialGradient(w/2, h/2, h * 0.25, w/2, h/2, w * 0.72);
//   v.addColorStop(0, 'rgba(0,0,0,0)');
//   v.addColorStop(1, 'rgba(0,0,0,0.32)');
//   ctx.fillStyle = v;
//   ctx.fillRect(0, 0, w, h);
//   ctx.restore();
// }

// function roundRect(ctx, x, y, w, h, r) {
//   ctx.beginPath();
//   ctx.moveTo(x + r, y);
//   ctx.lineTo(x + w - r, y);
//   ctx.quadraticCurveTo(x + w, y, x + w, y + r);
//   ctx.lineTo(x + w, y + h - r);
//   ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
//   ctx.lineTo(x + r, y + h);
//   ctx.quadraticCurveTo(x, y + h, x, y + h - r);
//   ctx.lineTo(x, y + r);
//   ctx.quadraticCurveTo(x, y, x + r, y);
//   ctx.closePath();
// }

// // ── Capture composite frame ───────────────────────────────────────────────────
// function captureComposite() {
//   captureCanvas.width  = FULL_W;
//   captureCanvas.height = FULL_H;
//   const ctx = captureCanvas.getContext('2d');
//   const bgRenderer = BG_RENDERERS[selectedBg];

//   if (bgRenderer) {
//     bgRenderer(ctx, FULL_W, FULL_H);
//     drawRemoteCutout(ctx, HALF_W, 0, HALF_W, HALF_H);
//     drawLocalCutout(ctx, 0, 0, HALF_W, HALF_H, true);
//   } else {
//     // Left half
//     ctx.save();
//     ctx.translate(HALF_W, 0);
//     ctx.scale(-1, 1);
//     if (currentFilter !== 'none') ctx.filter = currentFilter;
//     if (localVideo.readyState >= 2) ctx.drawImage(localVideo, 0, 0, HALF_W, HALF_H);
//     ctx.filter = 'none';
//     ctx.restore();
//     // Right half
//     if (currentFilter !== 'none') ctx.filter = currentFilter;
//     if (remoteVideo.srcObject && remoteVideo.readyState >= 2)
//       ctx.drawImage(remoteVideo, HALF_W, 0, HALF_W, HALF_H);
//     ctx.filter = 'none';
//   }

//   stickers.forEach(s => {
//     ctx.font = `${Math.round(FULL_H * 0.1)}px serif`;
//     ctx.fillText(s.emoji, s.x * FULL_W, s.y * FULL_H);
//   });

//   drawVignette(ctx, FULL_W, FULL_H);
//   return captureCanvas.toDataURL('image/png');
// }

// // ── Background picker ─────────────────────────────────────────────────────────
// document.querySelectorAll('.bg-pill').forEach(pill => {
//   pill.addEventListener('click', () => {
//     document.querySelectorAll('.bg-pill').forEach(p => p.classList.remove('active'));
//     pill.classList.add('active');
//     selectedBg = pill.dataset.bg;

//     if (selectedBg !== 'none') {
//       if (typeof SelfieSegmentation === 'undefined') {
//         bgHint.textContent = 'Background removal needs Chrome/Edge';
//         bgHint.style.color = '#b5664a';
//         selectedBg = 'none';
//         pill.classList.remove('active');
//         document.querySelector('.bg-pill[data-bg="none"]').classList.add('active');
//       } else {
//         bgHint.textContent = 'Stand ~1–2m from camera for best results';
//         bgHint.style.color = '#a09488';
//         if (!segmentation) initSegmentation();
//       }
//     } else {
//       bgHint.textContent = '';
//     }
//   });
// });

// // ── Filters ───────────────────────────────────────────────────────────────────
// document.querySelectorAll('.filter-pill').forEach(pill => {
//   pill.addEventListener('click', () => {
//     document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
//     pill.classList.add('active');
//     currentFilter = pill.dataset.filter;
//   });
// });

// // ── Stickers ──────────────────────────────────────────────────────────────────
// document.querySelectorAll('.sticker-btn').forEach(btn => {
//   btn.addEventListener('click', () => {
//     stickers.push({
//       emoji: btn.dataset.sticker,
//       x: 0.08 + Math.random() * 0.84,
//       y: 0.12 + Math.random() * 0.72,
//     });
//   });
// });
// clearStickersBtn.addEventListener('click', () => { stickers = []; });

// // ── Countdown / Flash ─────────────────────────────────────────────────────────
// function showCountdown(n) { countdownOverlay.textContent = n > 0 ? n : ''; }
// function doFlash() {
//   flashOverlay.style.opacity = '1';
//   setTimeout(() => { flashOverlay.style.opacity = '0'; }, 120);
// }

// // ── Strip abort ───────────────────────────────────────────────────────────────
// let abortRequested = false;
// function abortStrip(reason) {
//   if (!stripRunning) return;
//   abortRequested = true;
//   showCountdown(0);
//   captureStatus.textContent = reason;
//   setTimeout(() => { if (captureStatus.textContent === reason) captureStatus.textContent = ''; }, 3500);
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

//   for (let i = 0; i < 3; i++) {
//     if (abortRequested) break;
//     captureStatus.textContent = `Photo ${i + 1} of 3…`;

//     for (let c = 3; c >= 1; c--) {
//       if (abortRequested) break;
//       showCountdown(c);
//       if (isInitiator) sendData({ type: 'remoteCountdown', count: c });
//       await sleep(1000);
//     }
//     if (abortRequested) break;

//     showCountdown(0);
//     if (isInitiator) sendData({ type: 'remoteCountdown', count: 0 });

//     doFlash();
//     if (isInitiator) sendData({ type: 'remoteFlash' });
//     capturedPhotos.push(captureComposite());
//     captureStatus.textContent = `✓ Photo ${i + 1} captured!`;

//     if (i < 2) await sleep(1400);
//   }

//   stripRunning = false;
//   updateCaptureBtn();
//   if (abortRequested || capturedPhotos.length < 3) return;

//   captureStatus.textContent = 'Building your strip…';
//   await sleep(300);
//   buildStrip();
// }

// function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// // ── Build strip ───────────────────────────────────────────────────────────────
// async function buildStrip() {
//   const STRIP_W = 480, PAD = 14;
//   const PHOTO_W = STRIP_W - PAD * 2;
//   const PHOTO_H = Math.round(PHOTO_W * (FULL_H / FULL_W));
//   const GAP = 4, BOTTOM = 56;
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
//   ctx.fillStyle = '#3a3530';
//   ctx.font = `300 19px 'Cormorant Garamond', Georgia, serif`;
//   ctx.textAlign = 'center';
//   ctx.fillText(caption, STRIP_W / 2, STRIP_H - 22);

//   const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
//   ctx.fillStyle = '#b0a090';
//   ctx.font = '300 11px Geist, system-ui, sans-serif';
//   ctx.fillText(today, STRIP_W / 2, STRIP_H - 7);

//   downloadBtn.href = stripCanvas.toDataURL('image/png');
//   captureStatus.textContent = '';
//   showScreen('result');
// }

// function loadImage(src) {
//   return new Promise((res, rej) => {
//     const img = new Image();
//     img.onload = () => res(img);
//     img.onerror = rej;
//     img.src = src;
//   });
// }

// // ─── PeerJS ────────────────────────────────────────────────────────────────────
// function generateCode() {
//   const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
//   let code = '';
//   for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
//   return 'ST-' + code;
// }

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
//   peer.on('connection', c => { conn = c; setupDataConnection(); });
//   peer.on('call', call => {
//     mediaConn = call;
//     call.answer(localStream);
//     call.on('stream', stream => { remoteStream = stream; remoteVideo.srcObject = stream; remoteVideo.play().catch(() => {}); });
//     call.on('error', () => handleBestieDropped());
//   });
//   peer.on('error', e => { lobbyStatus.textContent = 'Error: ' + e.type; createRoomBtn.disabled = false; });
// });

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
//     mediaConn.on('stream', stream => { remoteStream = stream; remoteVideo.srcObject = stream; remoteVideo.play().catch(() => {}); });
//     mediaConn.on('error', () => handleBestieDropped());
//     roomBadge.textContent = code;
//     setConnStatus('waiting', 'connecting…');
//     updateCaptureBtn();
//     showScreen('booth');
//     joinRoomBtn.disabled = false;
//   });
//   peer.on('error', () => { lobbyStatus.textContent = 'Could not connect — check the code and try again.'; joinRoomBtn.disabled = false; });
// });

// function setupDataConnection() {
//   conn.on('open', () => conn.send({ type: 'hello', name: myName }));
//   conn.on('data', data => {
//     if (data.type === 'hello') {
//       remoteName = data.name;
//       remoteLabel.textContent = remoteName;
//       bestieConnected = true;
//       setConnStatus('connected', `${remoteName} is here`);
//       showToast(`${remoteName} joined the booth ✨`);
//       updateCaptureBtn();
//     }
//     if (data.type === 'startStrip')      runStripLocal(false);
//     if (data.type === 'remoteCountdown') showCountdown(data.count);
//     if (data.type === 'remoteFlash')     doFlash();
//     if (data.type === 'abortStrip')      abortStrip(`${remoteName} disconnected`);
//   });
//   conn.on('close', () => handleBestieDropped());
//   conn.on('error', () => handleBestieDropped());
// }

// function sendData(obj) { if (conn && conn.open) conn.send(obj); }

// function handleBestieDropped() {
//   bestieConnected = false;
//   remoteStream = null;
//   remoteVideo.srcObject = null;
//   setConnStatus('dropped', `${remoteName} disconnected`);
//   showToast(`${remoteName} left the booth`, 4000);
//   if (stripRunning) abortStrip(`${remoteName} disconnected — strip cancelled`);
//   updateCaptureBtn();
// }

// soloBtn.addEventListener('click', async () => {
//   isSolo = true;
//   myName = yourNameCreate.value.trim() || 'You';
//   myLabel.textContent = myName;
//   remoteLabel.textContent = '';
//   roomBadge.textContent = 'solo';
//   setConnStatus('solo', 'solo mode');
//   await startCamera();
//   updateCaptureBtn();
//   showScreen('booth');
// });

// retakeBtn.addEventListener('click', () => { capturedPhotos = []; showScreen('booth'); });

// leaveBtn.addEventListener('click', () => {
//   if (stripRunning) { sendData({ type: 'abortStrip' }); abortStrip('You left'); }
//   stopPreviewLoop();
//   stopSegmentation();
//   if (conn) conn.close();
//   if (mediaConn) mediaConn.close();
//   if (peer) peer.destroy();
//   if (localStream) localStream.getTracks().forEach(t => t.stop());
//   localStream = null; remoteStream = null; conn = null; mediaConn = null; peer = null;
//   localVideo.srcObject = null; remoteVideo.srcObject = null;
//   bestieConnected = false; stripRunning = false; isSolo = false;
//   stickers = []; capturedPhotos = [];
//   segmentation = null; segmentationReady = false;
//   setConnStatus('waiting', 'connecting…');
//   showScreen('lobby');
// });

// copyCodeBtn.addEventListener('click', () => {
//   navigator.clipboard.writeText(roomCodeText.textContent).then(() => {
//     copyCodeBtn.textContent = 'Copied!';
//     setTimeout(() => copyCodeBtn.textContent = 'Copy', 2000);
//   });
// });
// ════════════════════════════════════════════════
// SnapTogether — script.js
// Virtual photobooth with merged shared background
// ════════════════════════════════════════════════

// ───────────────── STATE ─────────────────

// ════════════════════════════════════════════════
// SnapTogether — FULL FIXED script.js
// ════════════════════════════════════════════════

let peer = null;
let conn = null;
let mediaConn = null;

let localStream = null;
let remoteStream = null;

let isSolo = false;
let bestieConnected = false;
let stripRunning = false;

let myName = "You";
let remoteName = "Bestie";

let currentFilter = "none";
let selectedBg = "none";

let stickers = [];
let capturedPhotos = [];

let rafId = null;

// segmentation
let segmentation = null;
let segmentationReady = false;

let localMask = null;
let localMaskCtx = null;

let segCanvas = null;
let segCtx = null;

// sizes
const FULL_W = 960;
const FULL_H = 540;

// ════════════════════════════════════════════════
// DOM
// ════════════════════════════════════════════════

const $ = id => document.getElementById(id);

const createRoomBtn = $("createRoomBtn");
const joinRoomBtn = $("joinRoomBtn");

const copyCodeBtn = $("copyCodeBtn");

const roomCodeDisplay = $("roomCodeDisplay");
const roomCodeText = $("roomCodeText");

const waitingMsg = $("waitingMsg");
const lobbyStatus = $("lobbyStatus");

const yourNameCreate = $("yourNameCreate");
const yourNameJoin = $("yourNameJoin");

const joinCodeInput = $("joinCodeInput");

const soloBtn = $("soloBtn");

const localVideo = $("localVideo");
const remoteVideo = $("remoteVideo");

remoteVideo.autoplay = true;
remoteVideo.playsInline = true;
remoteVideo.muted = true;

const previewCanvas = $("previewCanvas");

const captureCanvas = $("captureCanvas");

const captureBtn = $("captureBtn");
const captureStatus = $("captureStatus");

const stripCanvas = $("stripCanvas");

const countdownOverlay = $("countdownOverlay");
const flashOverlay = $("flashOverlay");

const captionInput = $("captionInput");

const myLabel = $("myLabel");
const remoteLabel = $("remoteLabel");

const connStatus = $("connStatus");
const connLabel = $("connLabel");

const roomBadge = $("roomBadge");

const leaveBtn = $("leaveBtn");

const retakeBtn = $("retakeBtn");
const downloadBtn = $("downloadBtn");

const clearStickersBtn = $("clearStickersBtn");

const bgHint = $("bgHint");

const toast = $("toast");

// ════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => {
    s.classList.remove("active");
  });

  $(id).classList.add("active");

  if (id === "booth") {
    startPreviewLoop();
  }
}

function showToast(text) {
  toast.innerText = text;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

function setConnStatus(type, text) {
  connStatus.className = `conn-status ${type}`;
  connLabel.innerText = text;
}

function updateCaptureBtn() {
  captureBtn.disabled = !(isSolo || bestieConnected);
}

// ════════════════════════════════════════════════
// TABS
// ════════════════════════════════════════════════

document.querySelectorAll(".tab-btn").forEach(btn => {

  btn.addEventListener("click", () => {

    document.querySelectorAll(".tab-btn").forEach(b => {
      b.classList.remove("active");
    });

    document.querySelectorAll(".tab-panel").forEach(p => {
      p.classList.remove("active");
    });

    btn.classList.add("active");

    $(`tab-${btn.dataset.tab}`).classList.add("active");

  });

});

// ════════════════════════════════════════════════
// CAMERA
// ════════════════════════════════════════════════

async function startCamera() {

  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  localVideo.srcObject = localStream;

  await localVideo.play();

}

// ════════════════════════════════════════════════
// SEGMENTATION
// ════════════════════════════════════════════════

function initSegmentation() {

  if (segmentation) return;

  segCanvas = document.createElement("canvas");
  segCanvas.width = 480;
  segCanvas.height = 360;

  segCtx = segCanvas.getContext("2d");

  localMask = document.createElement("canvas");
  localMask.width = 480;
  localMask.height = 360;

  localMaskCtx = localMask.getContext("2d");

  segmentation = new SelfieSegmentation({
    locateFile: file =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
  });

  segmentation.setOptions({
    modelSelection: 1
  });

  segmentation.onResults(results => {

    localMaskCtx.clearRect(0, 0, 480, 360);

    localMaskCtx.drawImage(
      results.segmentationMask,
      0,
      0,
      480,
      360
    );

    segmentationReady = true;

  });

  async function pump() {

    if (localVideo.readyState >= 2) {

      segCtx.drawImage(localVideo, 0, 0, 480, 360);

      await segmentation.send({
        image: segCanvas
      });

    }

    requestAnimationFrame(pump);

  }

  pump();

}

// ════════════════════════════════════════════════
// BACKGROUNDS
// ════════════════════════════════════════════════

const BG_RENDERERS = {

  none: null,

  blush: (ctx, w, h) => {

    const g = ctx.createLinearGradient(0, 0, w, 0);

    g.addColorStop(0, "#cf8d96");
    g.addColorStop(0.5, "#d99ca5");
    g.addColorStop(1, "#c88790");

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < w; i += 40) {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(i, 0, 18, h);
    }

  },

  cream: (ctx, w, h) => {
    ctx.fillStyle = "#efe3d2";
    ctx.fillRect(0, 0, w, h);
  },

  sage: (ctx, w, h) => {
    ctx.fillStyle = "#9caf9a";
    ctx.fillRect(0, 0, w, h);
  },

  black: (ctx, w, h) => {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, w, h);
  }

};

// ════════════════════════════════════════════════
// CUTOUTS
// ════════════════════════════════════════════════

function drawLocalCutout(ctx, dx, dy, dw, dh) {

  if (!segmentationReady) {

    ctx.save();

    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);

    ctx.drawImage(localVideo, 0, 0, dw, dh);

    ctx.restore();

    return;
  }

  const temp = document.createElement("canvas");

  temp.width = dw;
  temp.height = dh;

  const tctx = temp.getContext("2d");

  tctx.save();

  tctx.translate(dw, 0);
  tctx.scale(-1, 1);

  tctx.drawImage(localVideo, 0, 0, dw, dh);

  tctx.restore();

  tctx.globalCompositeOperation = "destination-in";

  tctx.drawImage(localMask, 0, 0, dw, dh);

  ctx.drawImage(temp, dx, dy, dw, dh);

}

function drawRemoteCutout(ctx, dx, dy, dw, dh) {

  if (!remoteVideo.srcObject || remoteVideo.readyState < 2) {
    return;
  }

  ctx.save();

  ctx.shadowColor = "rgba(0,0,0,0.18)";
  ctx.shadowBlur = 25;
  ctx.shadowOffsetY = 8;

  ctx.drawImage(
    remoteVideo,
    dx,
    dy,
    dw,
    dh
  );

  ctx.restore();

}

// ════════════════════════════════════════════════
// PREVIEW LOOP
// ════════════════════════════════════════════════

function startPreviewLoop() {

  previewCanvas.width = FULL_W;
  previewCanvas.height = FULL_H;

  const ctx = previewCanvas.getContext("2d");

  function draw() {

    ctx.clearRect(0, 0, FULL_W, FULL_H);

    // background
    if (selectedBg !== "none") {

      BG_RENDERERS[selectedBg](ctx, FULL_W, FULL_H);

    } else {

      ctx.fillStyle = "#f5f0ea";
      ctx.fillRect(0, 0, FULL_W, FULL_H);

    }

    // filter
    if (currentFilter !== "none") {
      ctx.filter = currentFilter;
    }

    // REMOTE
    if (remoteVideo.readyState >= 2) {

      drawRemoteCutout(
        ctx,
        FULL_W * 0.38,
        20,
        FULL_W * 0.48,
        FULL_H * 0.92
      );

    }

    // LOCAL
    drawLocalCutout(
      ctx,
      -20,
      20,
      FULL_W * 0.58,
      FULL_H * 0.92
    );

    ctx.filter = "none";

    // stickers
    stickers.forEach(s => {

      ctx.font = "50px serif";

      ctx.fillText(
        s.emoji,
        s.x * FULL_W,
        s.y * FULL_H
      );

    });

    drawVignette(ctx);

    rafId = requestAnimationFrame(draw);

  }

  draw();

}

// ════════════════════════════════════════════════
// EFFECTS
// ════════════════════════════════════════════════

function drawVignette(ctx) {

  const g = ctx.createRadialGradient(
    FULL_W / 2,
    FULL_H / 2,
    120,
    FULL_W / 2,
    FULL_H / 2,
    FULL_W / 1.2
  );

  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.35)");

  ctx.fillStyle = g;

  ctx.fillRect(0, 0, FULL_W, FULL_H);

}

function doFlash() {

  flashOverlay.style.opacity = "1";

  setTimeout(() => {
    flashOverlay.style.opacity = "0";
  }, 100);

}

function showCountdown(num) {
  countdownOverlay.innerText = num || "";
}

// ════════════════════════════════════════════════
// CAPTURE
// ════════════════════════════════════════════════

function captureComposite() {

  captureCanvas.width = FULL_W;
  captureCanvas.height = FULL_H;

  const ctx = captureCanvas.getContext("2d");

  if (selectedBg !== "none") {

    BG_RENDERERS[selectedBg](ctx, FULL_W, FULL_H);

  } else {

    ctx.fillStyle = "#f5f0ea";
    ctx.fillRect(0, 0, FULL_W, FULL_H);

  }

  if (currentFilter !== "none") {
    ctx.filter = currentFilter;
  }

  if (remoteVideo.readyState >= 2) {

    drawRemoteCutout(
      ctx,
      FULL_W * 0.38,
      20,
      FULL_W * 0.48,
      FULL_H * 0.92
    );

  }

  drawLocalCutout(
    ctx,
    -20,
    20,
    FULL_W * 0.58,
    FULL_H * 0.92
  );

  ctx.filter = "none";

  drawVignette(ctx);

  return captureCanvas.toDataURL("image/png");

}

// ════════════════════════════════════════════════
// STRIP
// ════════════════════════════════════════════════

captureBtn.addEventListener("click", async () => {

  if (stripRunning) return;

  stripRunning = true;

  capturedPhotos = [];

  for (let i = 0; i < 3; i++) {

    for (let c = 3; c >= 1; c--) {

      showCountdown(c);

      await sleep(1000);

    }

    showCountdown("");

    doFlash();

    capturedPhotos.push(
      captureComposite()
    );

    await sleep(1200);

  }

  buildStrip();

  stripRunning = false;

});

async function buildStrip() {

  const STRIP_W = 700;
  const PHOTO_H = 350;

  stripCanvas.width = STRIP_W;
  stripCanvas.height = 1200;

  const ctx = stripCanvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, stripCanvas.width, stripCanvas.height);

  for (let i = 0; i < capturedPhotos.length; i++) {

    const img = await loadImage(capturedPhotos[i]);

    ctx.drawImage(
      img,
      40,
      40 + i * 370,
      620,
      PHOTO_H
    );

  }

  ctx.fillStyle = "#666";

  ctx.textAlign = "center";

  ctx.font = "52px 'Cormorant Garamond'";

  ctx.fillText(
    "SnapTogether 💕",
    STRIP_W / 2,
    1160
  );

  ctx.font = "28px Inter";

  ctx.fillText(
    new Date().toDateString(),
    STRIP_W / 2,
    1190
  );

  downloadBtn.href = stripCanvas.toDataURL("image/png");

  showScreen("result");

}

function loadImage(src) {

  return new Promise(resolve => {

    const img = new Image();

    img.onload = () => resolve(img);

    img.src = src;

  });

}

// ════════════════════════════════════════════════
// FILTERS
// ════════════════════════════════════════════════

document.querySelectorAll(".filter-pill").forEach(btn => {

  btn.addEventListener("click", () => {

    document.querySelectorAll(".filter-pill").forEach(b => {
      b.classList.remove("active");
    });

    btn.classList.add("active");

    currentFilter = btn.dataset.filter;

  });

});

// ════════════════════════════════════════════════
// BACKGROUNDS
// ════════════════════════════════════════════════

document.querySelectorAll(".bg-pill").forEach(btn => {

  btn.addEventListener("click", () => {

    document.querySelectorAll(".bg-pill").forEach(b => {
      b.classList.remove("active");
    });

    btn.classList.add("active");

    selectedBg = btn.dataset.bg;

    if (selectedBg !== "none") {

      initSegmentation();

      bgHint.innerText =
        "background merge enabled ✨";

    } else {

      bgHint.innerText = "";

    }

  });

});

// ════════════════════════════════════════════════
// STICKERS
// ════════════════════════════════════════════════

document.querySelectorAll(".sticker-btn").forEach(btn => {

  btn.addEventListener("click", () => {

    stickers.push({

      emoji: btn.dataset.sticker,

      x: Math.random() * 0.8 + 0.1,

      y: Math.random() * 0.7 + 0.1

    });

  });

});

clearStickersBtn.addEventListener("click", () => {
  stickers = [];
});

// ════════════════════════════════════════════════
// PEER HELPERS
// ════════════════════════════════════════════════

function generateCode() {

  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "";

  for (let i = 0; i < 6; i++) {

    code += chars[
      Math.floor(Math.random() * chars.length)
    ];

  }

  return "ST-" + code;

}

function setupDataConnection() {

  conn.on("open", () => {

    conn.send({
      type: "hello",
      name: myName
    });

  });

  conn.on("data", data => {

    if (data.type === "hello") {

      remoteName = data.name;

      remoteLabel.innerText = remoteName;

      bestieConnected = true;

      updateCaptureBtn();

      setConnStatus(
        "connected",
        `${remoteName} connected`
      );

      showToast(`${remoteName} joined ✨`);

    }

  });

}

// ════════════════════════════════════════════════
// CREATE ROOM
// ════════════════════════════════════════════════

createRoomBtn.addEventListener("click", async () => {

  await startCamera();

  myName =
    yourNameCreate.value.trim() || "You";

  myLabel.innerText = myName;

  const roomCode = generateCode();

  peer = new Peer(roomCode);

  peer.on("open", id => {

    roomCodeText.innerText = id;

    roomCodeDisplay.classList.remove("hidden");

    waitingMsg.classList.remove("hidden");

    roomBadge.innerText = id;

    showScreen("booth");

  });

  peer.on("connection", c => {

    conn = c;

    setupDataConnection();

  });

  peer.on("call", call => {

    mediaConn = call;

    call.answer(localStream);

    call.on("stream", async stream => {

      console.log("REMOTE STREAM RECEIVED");

      remoteStream = stream;

      remoteVideo.srcObject = stream;

      try {

        await remoteVideo.play();

        console.log("REMOTE VIDEO PLAYING");

      } catch(err) {

        console.error(err);

      }

    });

  });

});

// ════════════════════════════════════════════════
// JOIN ROOM
// ════════════════════════════════════════════════

joinRoomBtn.addEventListener("click", async () => {

  const code = joinCodeInput.value.trim();

  await startCamera();

  peer = new Peer();

  peer.on("open", () => {

    conn = peer.connect(code);

    setupDataConnection();

    mediaConn = peer.call(code, localStream);

    mediaConn.on("stream", async stream => {

      console.log("REMOTE STREAM RECEIVED");

      remoteStream = stream;

      remoteVideo.srcObject = stream;

      try {

        await remoteVideo.play();

        console.log("REMOTE VIDEO PLAYING");

      } catch(err) {

        console.error(err);

      }

    });

    roomBadge.innerText = code;

    showScreen("booth");

  });

});

// ════════════════════════════════════════════════
// SOLO
// ════════════════════════════════════════════════

soloBtn.addEventListener("click", async () => {

  isSolo = true;

  await startCamera();

  updateCaptureBtn();

  showScreen("booth");

});

// ════════════════════════════════════════════════
// RETAKE
// ════════════════════════════════════════════════

retakeBtn.addEventListener("click", () => {

  showScreen("booth");

});

// ════════════════════════════════════════════════
// LEAVE
// ════════════════════════════════════════════════

leaveBtn.addEventListener("click", () => {

  if (localStream) {

    localStream.getTracks().forEach(t => {
      t.stop();
    });

  }

  location.reload();

});

// ════════════════════════════════════════════════
// COPY
// ════════════════════════════════════════════════

copyCodeBtn.addEventListener("click", async () => {

  await navigator.clipboard.writeText(
    roomCodeText.innerText
  );

  copyCodeBtn.innerText = "Copied!";

  setTimeout(() => {
    copyCodeBtn.innerText = "Copy";
  }, 2000);

});
