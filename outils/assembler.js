// Refait index.html : le code de src/ et la bibliothèque 3D réunis dans une seule page.
const fs = require('fs'), path = require('path'), racine = path.join(__dirname, '..');
const r = require('esbuild').buildSync({ entryPoints: [path.join(racine, 'src/main.js')], bundle: true, minify: true, format: 'iife', write: false });
const code = r.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const page = fs.readFileSync(path.join(racine, 'src/page.html'), 'utf8').replace('/*BUNDLE*/', () => code);
fs.writeFileSync(path.join(racine, 'index.html'), page);
console.log('index.html refait :', Math.round(page.length / 1024), 'Ko');
