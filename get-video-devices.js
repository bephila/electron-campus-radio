document.addEventListener("DOMContentLoaded", () => {
    getVideoDevices();
});

async function getVideoDevices() {
    try {
        const select = document.getElementById("deviceSelect");
        if (!select) {
            console.error("Error: Element #deviceSelect not found in the DOM.");
            return;
        }

        select.innerHTML = ""; // Clear previous options

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === "videoinput");

        videoDevices.forEach((device, index) => {
            let option = document.createElement("option");
            option.value = device.deviceId;
            option.textContent = device.label || `Camera ${index + 1}`;
            select.appendChild(option);
        });

        // Load saved camera
        const savedDevice = localStorage.getItem("selectedCamera");
        if (savedDevice) {
            select.value = savedDevice;
        }
    } catch (error) {
        console.error("Error getting video devices:", error);
    }
}
