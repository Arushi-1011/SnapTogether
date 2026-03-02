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
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL('image/png');
    downloadLink.href = imageData;
    downloadLink.download = "snaptogether.png";
    downloadLink.innerText = "Download Photo";
    downloadLink.style.display = "block";
}
