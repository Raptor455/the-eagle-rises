"""Prépare un modèle Meshy (.glb, un seul maillage, une texture) pour la foule :
   python3 outils/convertir_modele.py modeles/fantassin-francais.glb fr
   écrit src/modeles/fr.js : maillage détaillé, maillage allégé, texture réduite."""
import sys, json, struct, base64, io, subprocess, tempfile, os
import numpy as np
from PIL import Image
src, nom = sys.argv[1], sys.argv[2]
racine = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
f = open(src, 'rb').read(); n = struct.unpack('<I', f[12:16])[0]; j = json.loads(f[20:20 + n]); binc = f[20 + n + 8:]
CT = {5120: 'i1', 5121: 'u1', 5122: '<i2', 5123: '<u2', 5125: '<u4', 5126: '<f4'}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
def acc(i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]; dt = np.dtype(CT[a['componentType']]); k = NC[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); st = bv.get('byteStride') or dt.itemsize * k
    raw = np.frombuffer(binc, np.uint8, st * (a['count'] - 1) + dt.itemsize * k, off)
    return np.lib.stride_tricks.as_strided(raw, (a['count'], dt.itemsize * k), (st, 1)).copy().view(dt).reshape(a['count'], k)
p = j['meshes'][0]['primitives'][0]
pos = acc(p['attributes']['POSITION']).astype(np.float32); nor = acc(p['attributes']['NORMAL']).astype(np.float32); uv = acc(p['attributes']['TEXCOORD_0']).astype(np.float32)
idx = acc(p['indices']).astype(np.uint32).ravel()
# pieds au sol, centré, hauteur 1 : le jeu règle la taille
pos[:, 1] -= pos[:, 1].min(); pos[:, 0] -= (pos[:, 0].min() + pos[:, 0].max()) / 2; pos[:, 2] -= (pos[:, 2].min() + pos[:, 2].max()) / 2; pos /= pos[:, 1].max()
with tempfile.TemporaryDirectory() as t:
    json.dump({'pos': pos.ravel().tolist(), 'idx': idx.tolist()}, open(t + '/a.json', 'w'))
    print(subprocess.run(['node', os.path.join(racine, 'outils/simplifier.js'), t + '/a.json', t + '/b.json', sys.argv[3] if len(sys.argv) > 3 else '420'], capture_output=True, text=True, check=True).stdout.strip())
    low = np.array(json.load(open(t + '/b.json')), np.uint32)
used = np.unique(low); remap = np.zeros(len(pos), np.uint32); remap[used] = np.arange(len(used))
b64 = lambda a: base64.b64encode(a.tobytes()).decode()
def pack(P, N, U, I): return {'n': len(P), 'pos': b64(P.astype('<f4')), 'nor': b64(np.clip(np.round(N * 127), -127, 127).astype('i1')), 'uv': b64(U.astype('<f4')), 'idx': b64(I.astype('<u2'))}
im = j['images'][0]; bv = j['bufferViews'][im['bufferView']]
img = Image.open(io.BytesIO(binc[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])).convert('RGB'); print('texture', img.size)
img = img.resize((1024, 1024), Image.LANCZOS); buf = io.BytesIO(); img.save(buf, 'JPEG', quality=86)
out = {'pres': pack(pos, nor, uv, idx), 'loin': pack(pos[used], nor[used], uv[used], remap[low]), 'tex': 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()}
os.makedirs(os.path.join(racine, 'src/modeles'), exist_ok=True)
open(os.path.join(racine, f'src/modeles/{nom}.js'), 'w').write('export default ' + json.dumps(out) + ';\n')
print('sommets', len(pos), 'allégé', len(used), 'largeur', np.ptp(pos[:, 0]).round(2), 'épaisseur', np.ptp(pos[:, 2]).round(2), 'texture Ko', len(buf.getvalue()) // 1024)
img.resize((512,512)).save('/home/claude/tex.png')
