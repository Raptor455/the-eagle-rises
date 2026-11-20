// Version allégée d'un modèle pour l'affichage de loin. Entrée et sortie : JSON {pos, idx}, sortie = nouveaux indices.
const fs = require('fs'), { MeshoptSimplifier } = require('meshoptimizer');
const [, , src, dst, cible] = process.argv;
MeshoptSimplifier.ready.then(() => {
  const d = JSON.parse(fs.readFileSync(src, 'utf8')), pos = new Float32Array(d.pos), idx = new Uint32Array(d.idx);
  const [out, err] = MeshoptSimplifier.simplify(idx, pos, 3, (+cible) * 3, 1.0);
  fs.writeFileSync(dst, JSON.stringify(Array.from(out))); console.log('triangles', idx.length / 3, '->', out.length / 3, 'erreur', err.toFixed(4));
});
