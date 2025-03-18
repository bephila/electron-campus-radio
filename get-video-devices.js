document.addEventListener("DOMContentLoaded", async () => {
    await getVideoDevices();
});

async function getVideoDevices() {
    try {
        const selects = document.querySelectorAll(".camera-select");

        if (selects.length === 0) {
            console.error("Error: No camera select elements found.");
            return;
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === "videoinput");

        selects.forEach((select) => {
            select.innerHTML = ""; // Clear previous options

            videoDevices.forEach((device, index) => {
                let option = document.createElement("option");
                option.value = device.deviceId;
                option.textContent = device.label || `Camera ${index + 1}`;
                select.appendChild(option);
            });

            // Load saved camera preference
            const savedDevice = localStorage.getItem(`selectedCamera-${select.dataset.camera}`);
            if (savedDevice) {
                select.value = savedDevice;
            }

            // Save selection when changed
            select.addEventListener("change", (event) => {
                localStorage.setItem(`selectedCamera-${select.dataset.camera}`, event.target.value);
                console.log(`Saved ${event.target.value} for ${select.dataset.camera}`);
            });
        });
    } catch (error) {
        console.error("Error getting video devices:", error);
    }
}
