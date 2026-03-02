const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const captureBtn = document.getElementById('captureBtn');
const downloadLink = document.getElementById('downloadLink');
const countdownEl = document.getElementById('countdown');

// Access webcam
navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
        video.srcObject = stream;
    });

captureBtn.addEventListener('click', () => {
    let count = 3;
    countdownEl.innerText = count;

    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownEl.innerText = count;
        } else {
            clearInterval(interval);
            countdownEl.innerText = "";
            capturePhoto();
        }
    }, 1000);
});

function capturePhoto() {
    const padding = 40;        // side padding
    const bottomSpace = 80;    // extra space for caption

    const width = video.videoWidth;
    const height = video.videoHeight;

    canvas.width = width + padding * 2;
    canvas.height = height + padding * 2 + bottomSpace;

    const context = canvas.getContext('2d');

    // Draw white polaroid background
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw photo inside frame
    context.drawImage(video, padding, padding, width, height);

    // Optional caption text
    context.fillStyle = "#555";
    context.font = "20px Poppins";
    context.textAlign = "center";
    context.fillText("SnapTogether 💕", canvas.width / 2, canvas.height - 40);

    const imageData = canvas.toDataURL("image/png");

    downloadLink.href = imageData;
    downloadLink.download = "snaptogether-polaroid.png";
    downloadLink.innerText = "Download Photo";
    downloadLink.style.display = "block";
}
