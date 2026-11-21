// Version allégée d'un modèle. Entrée : JSON {pos, idx, uv?}, sortie : nouveaux indices.
// approx : regroupe les sommets proches, pour les petits objets en mille morceaux.
// Avec uv : les coutures de texture peuvent être franchies (« Permissive ») tant que la texture ne glisse pas trop,
// ce qui permet d'alléger beaucoup les modèles Meshy, découpés en centaines d'îlots de texture.
const fs = require('fs'), { MeshoptSimplifier } = require('meshoptimizer');
const [, , src, dst, cible, approx] = process.argv;
MeshoptSimplifier.ready.then(() => {
  const d = JSON.parse(fs.readFileSync(src, 'utf8')), pos = new Float32Array(d.pos), idx = new Uint32Array(d.idx), n = (+cible) * 3;
  const [out, err] = approx ? MeshoptSimplifier.simplifySloppy(idx, pos, 3, null, n, 1.0)
    : d.uv ? MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, new Float32Array(d.uv), 2, [0.5, 0.5], null, n, 1.0, ['Permissive'])
    : MeshoptSimplifier.simplify(idx, pos, 3, n, 1.0);
  fs.writeFileSync(dst, JSON.stringify(Array.from(out))); console.log('triangles', idx.length / 3, '->', out.length / 3, 'erreur', err.toFixed(4));
});
