// Le .exe Windows : une fenêtre Electron qui ouvre le jeu. Reconstruire avec construire-exe.bat (ou npm run exe).
// Mise à jour : à chaque lancement, on télécharge le index.html de la branche main sur GitHub.
// S'il a changé, il remplace la copie gardée sur le PC. Sans connexion, on joue la dernière copie
// téléchargée, ou à défaut celle livrée avec le .exe.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path'), fs = require('fs');

const SOURCE = 'https://raw.githubusercontent.com/Raptor455/the-eagle-rises/main/index.html';

async function jeuAJour() {
  const dossier = path.join(app.getPath('userData'), 'jeu'), copie = path.join(dossier, 'index.html');
  const marque = path.join(dossier, 'etag.txt'); // l'empreinte de la copie : GitHub répond « inchangé » sans rien renvoyer
  try {
    const connu = fs.existsSync(copie) && fs.existsSync(marque) ? fs.readFileSync(marque, 'utf8') : '';
    // 10 s pour joindre GitHub (hors ligne, on n'attend pas), puis 3 min pour télécharger : le jeu pèse plusieurs Mo.
    const arret = new AbortController(); let delai = setTimeout(() => arret.abort(), 10000);
    const r = await fetch(SOURCE, { cache: 'no-store', signal: arret.signal, headers: connu ? { 'If-None-Match': connu } : {} });
    clearTimeout(delai);
    if (r.status === 304) return { fichier: copie, etat: 'à jour' };
    if (!r.ok) throw new Error('GitHub a répondu ' + r.status);
    delai = setTimeout(() => arret.abort(), 180000);
    const page = await r.text(); clearTimeout(delai);
    if (!page.includes('<html')) throw new Error('réponse inattendue');
    fs.mkdirSync(dossier, { recursive: true });
    fs.writeFileSync(copie + '.tmp', page); fs.renameSync(copie + '.tmp', copie); // jamais de copie à moitié écrite
    fs.writeFileSync(marque, r.headers.get('etag') || '');
    return { fichier: copie, etat: 'mis à jour' };
  } catch (e) {
    console.log('Mise à jour impossible :', e.message);
    if (fs.existsSync(copie)) return { fichier: copie, etat: 'hors ligne' };
    return { fichier: path.join(__dirname, '..', 'index.html'), etat: 'version livrée' };
  }
}

app.whenReady().then(async () => {
  const fen = new BrowserWindow({
    width: 1600, height: 900, show: false, backgroundColor: '#c9d6e2', autoHideMenuBar: true,
    title: 'The Eagle Rises',
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  fen.setMenu(null);
  fen.maximize(); fen.show();
  fen.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
    '<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#181c24;color:#f5d98a;font:20px Georgia,serif">Recherche de mise à jour… (un téléchargement peut prendre une minute)</body>'));
  fen.webContents.on('before-input-event', (e, k) => {
    if (k.type !== 'keyDown') return;
    if (k.key === 'F11') { fen.setFullScreen(!fen.isFullScreen()); e.preventDefault(); }
    if (k.key === 'F12') { fen.webContents.toggleDevTools(); e.preventDefault(); }
  });
  const { fichier, etat } = await jeuAJour();
  ipcMain.handle('etat-maj', () => etat);
  fen.loadFile(fichier);
});
ipcMain.on('quitter', () => app.quit());
app.on('window-all-closed', () => app.quit());
