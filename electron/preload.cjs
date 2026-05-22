const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => {
    callback(payload);
  };

  ipcRenderer.on(channel, listener);

  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld('desktopTracker', {
  isAvailable: () => true,
  requestPresence: () => ipcRenderer.invoke('desktop:presence:request'),
  onPresence: (callback) => subscribe('desktop:presence', callback),
  onSystemEvent: (callback) => subscribe('desktop:system-event', callback),
});
