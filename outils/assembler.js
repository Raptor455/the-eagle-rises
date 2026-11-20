// Refait index.html (le jeu) et galerie.html (les modèles en gros plan) : le code de src/ et la bibliothèque 3D réunis dans une seule page.
const fs = require('fs'), path = require('path'), racine = path.join(__dirname, '..');
for (const [entree, gabarit, sortie] of [['src/main.js', 'src/page.html', 'index.html'], ['outils/galerie/galerie.js', 'outils/galerie/page.html', 'galerie.html']]) {
  const r = require('esbuild').buildSync({ entryPoints: [path.join(racine, entree)], bundle: true, minify: true, format: 'iife', write: false });
  const code = r.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
  const page = fs.readFileSync(path.join(racine, gabarit), 'utf8').replace('/*BUNDLE*/', () => code);
  fs.writeFileSync(path.join(racine, sortie), page);
  console.log(sortie, 'refait :', Math.round(page.length / 1024), 'Ko');
}
