"""Prépare un soldat Meshy animé (.glb avec squelette et animations) pour la foule.
   python3 outils/convertir_modele.py modeles/fantassin-francais-anime.glb fr --fusil modeles/fusil-1777.glb
   Écrit src/modeles/fr.js : maillage détaillé et allégé, texture réduite, fusil tenu en main droite,
   et les animations sous forme d'une table de matrices d'os (une ligne par image)."""
import sys, os, json, base64, io, subprocess, tempfile, argparse
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glb import Glb, Squelette
racine = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('nom'); ap.add_argument('--fusil'); a = ap.parse_args()
# nom dans le jeu : (mot cherché dans le nom du clip, images par seconde)
CLIPS = {'marche': ('walking', 24), 'course': ('running', 24), 'attente': ('idle', 10), 'tir': ('shooting', 20)}

b64 = lambda x: base64.b64encode(x.tobytes()).decode()
def alleger(pos, idx, cible, approx=False):
    with tempfile.TemporaryDirectory() as t:
        json.dump({'pos': pos.ravel().tolist(), 'idx': idx.tolist()}, open(t + '/a.json', 'w'))
        print('  ', subprocess.run(['node', os.path.join(racine, 'outils/simplifier.js'), t + '/a.json', t + '/b.json', str(cible)] + (['approx'] if approx else []), capture_output=True, text=True, check=True).stdout.strip())
        return np.array(json.load(open(t + '/b.json')), np.uint32)
def paquet(m, idx):
    used = np.unique(idx); remap = np.zeros(len(m['pos']), np.uint32); remap[used] = np.arange(len(used))
    return {'n': len(used), 'pos': b64(m['pos'][used].astype('<f4')), 'nor': b64(np.clip(np.round(m['nor'][used] * 127), -127, 127).astype('i1')), 'uv': b64(m['uv'][used].astype('<f4')),
            'os': b64(m['os'][used].astype('u1')), 'poids': b64(np.clip(np.round(m['poids'][used] * 255), 0, 255).astype('u1')), 'idx': b64(remap[idx].astype('<u2')), 'tri': len(idx) // 3}
def texture(g, cote):
    buf = io.BytesIO(); g.image().resize((cote, cote)).save(buf, 'JPEG', quality=86); return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()

g = Glb(a.src); m = g.maillage(); sq = Squelette(g); noms = [sq.nom(k) for k in range(len(sq.os))]
haut = float(m['pos'][:, 1].max()); print('soldat :', len(m['pos']), 'sommets,', len(m['idx']) // 3, 'triangles, hauteur', round(haut, 3), ',', len(noms), 'os')
out = {'pres': paquet(m, m['idx']), 'loin': paquet(m, alleger(m['pos'], m['idx'], 420)), 'tex': texture(g, 1024)}

# animations : le jeu veut un soldat de hauteur 1, pieds au sol, qui regarde vers -z
N = np.diag([-1 / haut, 1 / haut, -1 / haut, 1.0]); lignes = []; clips = {}
for nom, (mot, ips) in CLIPS.items():
    c = next((k for k in sq.clips if mot in k.lower()), None)
    if not c: print('  animation absente :', nom); continue
    d = sq.duree(c); n = max(2, int(round(d * ips))); clips[nom] = [len(lignes), n, n / d]
    for i in range(n): lignes.append((N @ sq.pose(c, d * i / n)[0])[:, :3, :])
    print('  animation', nom, '<-', c, ':', n, 'images')
T = np.stack(lignes).astype(np.float16) # images x os x 3 lignes x 4
out['anim'] = {'os': len(noms), 'images': len(lignes), 'clips': clips, 'table': b64(T)}

if a.fusil:
    f = Glb(a.fusil).maillage(); p = f['pos'].astype(np.float64); L = np.ptp(p[:, 0]); k = 1.9 / L # 1,52 m de fusil et sa baïonnette
    ih = noms.index('mixamorig:RightHand'); G = sq.pose()[1]; main = G[ih][:3, 3]; bras = main - G[noms.index('mixamorig:RightForeArm')][:3, 3]; prise = main + bras / np.linalg.norm(bras) * 0.08
    R = np.array([[0, 0, 1], [0, 1, 0], [-1, 0, 0]], float) # bouche du canon (-x du modèle) vers l'avant du soldat (+z)
    s, c = np.sin(np.radians(12)), np.cos(np.radians(12)); Tl = np.array([[1, 0, 0], [0, c, s], [0, -s, c]]) # bouche un peu relevée
    centre = np.array([0.10 * L / 0.96, 0, 0]) # point tenu : un peu en arrière du milieu
    f['pos'] = (((p - centre) * k) @ R.T @ Tl.T + prise).astype(np.float32); f['nor'] = (f['nor'].astype(np.float64) @ R.T @ Tl.T).astype(np.float32)
    f['os'] = np.zeros((len(p), 4), np.uint8); f['os'][:, 0] = ih; f['poids'] = np.zeros((len(p), 4), np.float32); f['poids'][:, 0] = 1
    print('fusil :', len(p), 'sommets,', len(f['idx']) // 3, 'triangles')
    out['fusil'] = {'pres': paquet(f, alleger(f['pos'], f['idx'], 400, True)), 'loin': paquet(f, alleger(f['pos'], f['idx'], 60, True)), 'tex': texture(Glb(a.fusil), 256)}
os.makedirs(os.path.join(racine, 'src/modeles'), exist_ok=True)
ch = os.path.join(racine, f'src/modeles/{a.nom}.js'); open(ch, 'w').write('export default ' + json.dumps(out) + ';\n'); print('écrit', ch, os.path.getsize(ch) // 1024, 'Ko')
