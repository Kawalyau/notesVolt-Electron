
// main.js
const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const isDev = require('electron-is-dev');
const path = require('path');
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

// Correctly determine the Next.js app directory for both dev and prod.
const appDir = isDev ? '.' : path.join(app.getAppPath(), '.next/standalone');
const nextApp = next({ dev: isDev, dir: appDir });
const handle = nextApp.getRequestHandler();

app.on('ready', async () => {
  try {
    await nextApp.prepare();
    const server = createServer((req, res) => {
      const parsedUrl = parse(req.url, true);
      handle(req, res, parsedUrl);
    });

    server.listen(3000, (err) => {
      if (err) throw err;
      console.log('> Ready on http://localhost:3000');
      createWindow();
    });
  } catch (err) {
    console.error("Error starting Next.js server:", err);
    process.exit(1);
  }
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadURL('http://localhost:3000');

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.on('show-notification', (event, { title, body }) => {
  new Notification({ title, body }).show();
});
