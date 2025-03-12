document.addEventListener("DOMContentLoaded", () => {
    const deckA = document.getElementById("deckA");
    const deckB = document.getElementById("deckB");
    const audioUpload = document.getElementById("audioUpload");
    const videoUpload = document.getElementById("videoUpload");
    const audioLibrary = document.getElementById("audio-library-items");
    const videoLibrary = document.getElementById("video-library-items");
    const playlist = document.getElementById("playlist-items");
    
    // Audio Library Upload Functionality
    audioUpload.addEventListener("change", (event) => {
        Array.from(event.target.files).forEach(file => {
            let row = document.createElement("tr");
            row.draggable = true;
            row.ondragstart = (ev) => {
                ev.dataTransfer.setData("text", JSON.stringify({ type: 'audio', name: file.name }));
            };
            
            let titleCell = document.createElement("td");
            titleCell.textContent = file.name;
            let artistCell = document.createElement("td");
            artistCell.textContent = "Unknown";
            let lengthCell = document.createElement("td");
            lengthCell.textContent = "--:--";
            
            row.appendChild(titleCell);
            row.appendChild(artistCell);
            row.appendChild(lengthCell);
            
            audioLibrary.appendChild(row);
        });
    });
  
    // Video Library Upload Functionality
    videoUpload.addEventListener("change", (event) => {
        Array.from(event.target.files).forEach(file => {
            let row = document.createElement("tr");
            row.draggable = true;
            row.ondragstart = (ev) => {
                ev.dataTransfer.setData("text", JSON.stringify({ type: 'video', name: file.name }));
            };
            
            let titleCell = document.createElement("td");
            titleCell.textContent = file.name;
            let lengthCell = document.createElement("td");
            lengthCell.textContent = "--:--";
            
            row.appendChild(titleCell);
            row.appendChild(lengthCell);
            
            videoLibrary.appendChild(row);
        });
    });
  
    // Playlist Drag and Drop Functionality
    playlist.addEventListener("dragover", (event) => {
        event.preventDefault();
    });
  
    playlist.addEventListener("drop", (event) => {
        event.preventDefault();
        let data = JSON.parse(event.dataTransfer.getData("text"));
        let newRow = document.createElement("tr");
        
        let titleCell = document.createElement("td");
        titleCell.textContent = data.name;
        let typeCell = document.createElement("td");
        typeCell.textContent = data.type;
        let lengthCell = document.createElement("td");
        lengthCell.textContent = "--:--";
        
        newRow.appendChild(titleCell);
        newRow.appendChild(typeCell);
        newRow.appendChild(lengthCell);
        
        playlist.appendChild(newRow);
    });
  
    // Streaming Controls
    document.getElementById("start-stream").addEventListener("click", () => {
        console.log("Live Stream Started");
        // Implement start streaming logic
    });
  
    document.getElementById("stop-stream").addEventListener("click", () => {
        console.log("Live Stream Stopped");
        // Implement stop streaming logic
    });
  });
  