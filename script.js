const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const captureBtn = document.getElementById('captureBtn');
const downloadLink = document.getElementById('downloadLink');
const countdownEl = document.getElementById('countdown');
const captionInput = document.getElementById('captionInput');
const retakeBtn = document.getElementById('retakeBtn');

// Start webcam
navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
        video.srcObject = stream;
    })
    .catch(error => {
        console.error("Camera error:", error);
    });

// Countdown
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

    // White frame
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw image
    context.drawImage(video, padding, padding, width, height);

    // Caption
    const caption = captionInput.value || "SnapTogether 💕";
    context.fillStyle = "#444";
    context.font = "22px Poppins";
    context.textAlign = "center";
    context.fillText(caption, canvas.width / 2, canvas.height - 40);

    // Flash effect
   const flash = document.getElementById("flash");

flash.style.transition = "none";
flash.style.opacity = "1";

setTimeout(() => {
    flash.style.transition = "opacity 0.3s ease";
    flash.style.opacity = "0";
}, 50);

    const imageData = canvas.toDataURL("image/png");

    video.style.display = "none";
    canvas.style.display = "block";

    downloadLink.href = imageData;
    downloadLink.download = "snaptogether-polaroid.png";
    downloadLink.innerText = "Download Photo";
    downloadLink.style.display = "block";

    retakeBtn.style.display = "inline-block";
}

// Retake logic (OUTSIDE function)
retakeBtn.addEventListener("click", () => {
    canvas.style.display = "none";
    video.style.display = "block";
    downloadLink.style.display = "none";
    retakeBtn.style.display = "none";
});
