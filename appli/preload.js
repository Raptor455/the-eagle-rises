// Donne au menu du jeu un bouton Quitter qui ferme vraiment l'application.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('eagle', { quitter: () => ipcRenderer.send('quitter') });
