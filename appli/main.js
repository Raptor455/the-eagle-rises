// Le .exe Windows : une fenêtre Electron qui ouvre index.html. Reconstruire avec construire-exe.bat (ou npm run exe).
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  const fen = new BrowserWindow({
    width: 1600, height: 900, show: false, backgroundColor: '#c9d6e2', autoHideMenuBar: true,
    title: 'The Eagle Rises',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  fen.setMenu(null);
  fen.maximize(); fen.show();
  fen.webContents.on('before-input-event', (e, k) => {
    if (k.type !== 'keyDown') return;
    if (k.key === 'F11') { fen.setFullScreen(!fen.isFullScreen()); e.preventDefault(); }
    if (k.key === 'F12') { fen.webContents.toggleDevTools(); e.preventDefault(); }
  });
  fen.loadFile(path.join(__dirname, '..', 'index.html'));
});
ipcMain.on('quitter', () => app.quit());
app.on('window-all-closed', () => app.quit());
