const { app, BrowserWindow, ipcMain, powerMonitor } = require('electron');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({
  path: path.resolve(__dirname, '../.env'),
});

const isDev = !app.isPackaged;
const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? 'http://localhost:5173';
const idleThresholdSeconds = Number(process.env.IDLE_TIMEOUT_MINUTES ?? '1') * 60;
const heartbeatIntervalMs = 5000;

let mainWindow = null;
let isLocked = false;
let presenceInterval = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  if (isDev) {
    void mainWindow.loadURL(rendererUrl);
  } else {
    void mainWindow.loadFile(path.resolve(__dirname, '../frontend/dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function getPresenceSnapshot() {
  const idleSeconds = powerMonitor.getSystemIdleTime();
  const lastInputAt = new Date(Date.now() - idleSeconds * 1000).toISOString();

  return {
    idleSeconds,
    idleThresholdSeconds,
    isLocked,
    lastInputAt,
    source: 'electron',
  };
}

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

function broadcastPresence() {
  sendToRenderer('desktop:presence', getPresenceSnapshot());
}

function broadcastSystemEvent(state, reason) {
  sendToRenderer('desktop:system-event', {
    state,
    reason,
    occurredAt: new Date().toISOString(),
  });
}

function setupPowerMonitor() {
  powerMonitor.on('lock-screen', () => {
    isLocked = true;
    broadcastSystemEvent('lock', 'OS lock-screen event');
    broadcastPresence();
  });

  powerMonitor.on('unlock-screen', () => {
    isLocked = false;
    broadcastPresence();
  });

  powerMonitor.on('suspend', () => {
    isLocked = true;
    broadcastSystemEvent('lock', 'System suspend event');
    broadcastPresence();
  });

  powerMonitor.on('resume', () => {
    isLocked = false;
    broadcastPresence();
  });

  powerMonitor.on('shutdown', () => {
    broadcastSystemEvent('shutdown', 'OS shutdown event');
  });

  ipcMain.handle('desktop:presence:request', () => getPresenceSnapshot());

  presenceInterval = setInterval(() => {
    broadcastPresence();
  }, heartbeatIntervalMs);
}

app.whenReady().then(() => {
  createWindow();
  setupPowerMonitor();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  if (presenceInterval) {
    clearInterval(presenceInterval);
  }
});
