// Version allégée d'un modèle pour l'affichage de loin. Entrée et sortie : JSON {pos, idx}, sortie = nouveaux indices.
const fs = require('fs'), { MeshoptSimplifier } = require('meshoptimizer');
const [, , src, dst, cible, approx] = process.argv; // approx : regroupe les sommets proches, pour les petits objets en mille morceaux
MeshoptSimplifier.ready.then(() => {
  const d = JSON.parse(fs.readFileSync(src, 'utf8')), pos = new Float32Array(d.pos), idx = new Uint32Array(d.idx);
  const [out, err] = approx ? MeshoptSimplifier.simplifySloppy(idx, pos, 3, null, (+cible) * 3, 1.0) : MeshoptSimplifier.simplify(idx, pos, 3, (+cible) * 3, 1.0);
  fs.writeFileSync(dst, JSON.stringify(Array.from(out))); console.log('triangles', idx.length / 3, '->', out.length / 3, 'erreur', err.toFixed(4));
});
