document.addEventListener("DOMContentLoaded", () => {
  const deckA = document.getElementById("deckA");
  const deckB = document.getElementById("deckB");
  const mediaUpload = document.getElementById("mediaUpload");
  const mediaLibrary = document.getElementById("media-library-items");
  const playlist = document.getElementById("playlist-items");
  
  // Media Library Upload Functionality
  mediaUpload.addEventListener("change", (event) => {
      Array.from(event.target.files).forEach(file => {
          let row = document.createElement("tr");
          row.draggable = true;
          row.ondragstart = (ev) => {
              ev.dataTransfer.setData("text", file.name);
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
          
          mediaLibrary.appendChild(row);
      });
  });

  // Playlist Drag and Drop Functionality
  playlist.addEventListener("dragover", (event) => {
      event.preventDefault();
  });

  playlist.addEventListener("drop", (event) => {
      event.preventDefault();
      let data = event.dataTransfer.getData("text");
      let newRow = document.createElement("tr");
      let titleCell = document.createElement("td");
      titleCell.textContent = data;
      let artistCell = document.createElement("td");
      artistCell.textContent = "Unknown";
      let lengthCell = document.createElement("td");
      lengthCell.textContent = "--:--";
      
      newRow.appendChild(titleCell);
      newRow.appendChild(artistCell);
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
