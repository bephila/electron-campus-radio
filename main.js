const { app, BrowserWindow, ipcMain } = require("electron");
const { exec } = require("child_process");
const path = require("path");

let mainWindow;

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile("index.html");

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// 📌 **Run PHP Script and Return Output**
ipcMain.handle("run-php", async (event, scriptName) => {
  return new Promise((resolve, reject) => {
    exec(`php ${path.join(__dirname, "php", scriptName)}`, (error, stdout, stderr) => {
      if (error) {
        reject(`PHP Error: ${error.message}`);
        return;
      }
      if (stderr) {
        reject(`PHP Stderr: ${stderr}`);
        return;
      }
      resolve(stdout.trim());
    });
  });
});
