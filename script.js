const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const captureBtn = document.getElementById('captureBtn');
const downloadLink = document.getElementById('downloadLink');
const countdownEl = document.getElementById('countdown');
const captionInput = document.getElementById("captionInput");

context.fillText(captionInput.value || "SnapTogether 💕", canvas.width / 2, canvas.height - 40);

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
    const padding = 40;
    const bottomSpace = 90;

    const width = video.videoWidth;
    const height = video.videoHeight;

    canvas.width = width + padding * 2;
    canvas.height = height + padding * 2 + bottomSpace;

    const context = canvas.getContext('2d');

    // White polaroid background
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw photo
    context.drawImage(video, padding, padding, width, height);

    // Caption
    const caption = captionInput.value || "SnapTogether 💕";
    context.fillStyle = "#444";
    context.font = "22px Poppins";
    context.textAlign = "center";
    context.fillText(caption, canvas.width / 2, canvas.height - 40);

    // Convert to image
    const imageData = canvas.toDataURL("image/png");

    // Hide camera
    video.style.display = "none";

    // Show polaroid
    canvas.style.display = "block";
    canvas.style.marginTop = "20px";

    // Show download button
    downloadLink.href = imageData;
    downloadLink.download = "snaptogether-polaroid.png";
    downloadLink.innerText = "Download Photo";
    downloadLink.style.display = "block";
}
