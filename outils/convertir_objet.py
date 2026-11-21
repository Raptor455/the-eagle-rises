"""Prépare un objet Meshy fixe, sans squelette (canon, bâtiment, muret), pour le jeu.
   python3 outils/convertir_objet.py modeles/canon-gribeauval.glb canon --longueur 4.0 --avant=-x --teinte au:vert-ocre
   python3 outils/convertir_objet.py modeles/ferme-morave.glb maison --longueur 13 --avant=-x --maison (faîte le long de z)
   Écrit src/modeles/canon.js : maillage détaillé et allégé, texture réduite, en mètres, posé au sol (y = 0),
   l'avant de l'objet vers -z comme les soldats. --teinte ajoute une texture repeinte pour un camp
   (vert-ocre : le bois peint en vert devient jaune ocre, la couleur des affûts autrichiens)."""
import sys, os, json, argparse, base64, io, subprocess, tempfile
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glb import Glb
racine = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
b64 = lambda x: base64.b64encode(x.tobytes()).decode()
def alleger(pos, idx, cible):
    with tempfile.TemporaryDirectory() as t:
        json.dump({'pos': pos.ravel().tolist(), 'idx': idx.tolist()}, open(t + '/a.json', 'w'))
        print('  ', subprocess.run(['node', os.path.join(racine, 'outils/simplifier.js'), t + '/a.json', t + '/b.json', str(cible)], capture_output=True, text=True, check=True).stdout.strip())
        return np.array(json.load(open(t + '/b.json')), np.uint32)
def paquet_fixe(m, idx):
    used = np.unique(idx); remap = np.zeros(len(m['pos']), np.uint32); remap[used] = np.arange(len(used))
    return {'n': len(used), 'pos': b64(m['pos'][used].astype('<f4')), 'nor': b64(np.clip(np.round(m['nor'][used] * 127), -127, 127).astype('i1')), 'uv': b64(m['uv'][used].astype('<f4')), 'idx': b64(remap[idx].astype('<u2')), 'tri': len(idx) // 3}
def texture_url(im, cote):
    buf = io.BytesIO(); im.resize((cote, cote)).save(buf, 'JPEG', quality=86); return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()
ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('nom')
ap.add_argument('--longueur', type=float, required=True, help="plus grande dimension au sol, en mètres"); ap.add_argument('--avant', default='-x', help="axe du modèle qui regarde vers l'avant : -x, +x, -z ou +z")
ap.add_argument('--loin', type=int, default=300, help='triangles de la version allégée'); ap.add_argument('--teinte', action='append', default=[]); ap.add_argument('--maison', action='store_true', help='version de loin : murs et toit à deux pans, faîte le long de z, quelques triangles'); a = ap.parse_args()

def maison_de_loin(m, img):
    """Boîte et toit à deux pans (18 triangles), faîte le long de z, qui reprennent la couleur des murs et du toit
       dans la texture du modèle : un point de texture de mur pour les murs, un de toit pour le toit."""
    p, n, uv = m['pos'], m['nor'], m['uv']; H = np.percentile(p[:, 1], 97); x0, x1 = p[:, 0].min(), p[:, 0].max(); z0, z1 = p[:, 2].min(), p[:, 2].max()
    # par triangle : centre, normale, aire ; les grands pans de mur blanchi comptent plus que les boiseries détaillées
    t = m['idx'].reshape(-1, 3); A, B, C = p[t[:, 0]], p[t[:, 1]], p[t[:, 2]]; cr = np.cross(B - A, C - A); aire = np.linalg.norm(cr, axis=1) / 2
    nt = cr / (2 * aire[:, None] + 1e-12); ct = (A + B + C) / 3; ut = (uv[t[:, 0]] + uv[t[:, 1]] + uv[t[:, 2]]) / 3
    toit = (nt[:, 1] > 0.35) & (ct[:, 1] > 0.35 * H); mur = (np.abs(nt[:, 1]) < 0.2) & (ct[:, 1] > 0.15 * H) & (ct[:, 1] < 0.45 * H)
    gout = np.percentile(ct[toit, 1], 3)
    T = np.asarray(img.convert('RGB')).astype(np.float64); W, Hh = img.size
    def typique(sel, q): # parmi les grands triangles de la zone, celui dont la clarté est au quantile q (pondéré par l'aire)
        u = ut[sel]; c = T[np.clip((u[:, 1] * Hh).astype(int), 0, Hh - 1), np.clip((u[:, 0] * W).astype(int), 0, W - 1)]; w = aire[sel]; L = c @ [0.3, 0.59, 0.11]
        o = np.argsort(L); cible = L[o][np.searchsorted(np.cumsum(w[o]), q * w.sum())]
        proches = np.abs(L - cible) < 12; return u[np.argmax(np.where(proches, w, -1))]
    uvm = typique(mur, 0.8); uvt = typique(toit, 0.5) # murs blanchis à la chaux, chaume
    xm = (x0 + x1) / 2; ri = 0.92 # murs un peu en retrait du débord du toit
    a, b, c, d = x0 + (xm - x0) * (1 - ri), x1 - (x1 - xm) * (1 - ri), z0 + 0.3, z1 - 0.3
    V, U, I = [], [], []
    def face(pts, u):
        k = len(V); V.extend(pts); U.extend([u] * len(pts)); I.extend([k, k + 1, k + 2] + ([k, k + 2, k + 3] if len(pts) == 4 else []))
    face([(a, 0, d), (b, 0, d), (b, gout, d), (a, gout, d)], uvm); face([(b, 0, c), (a, 0, c), (a, gout, c), (b, gout, c)], uvm)   # pignons, bas
    face([(b, 0, d), (b, 0, c), (b, gout, c), (b, gout, d)], uvm); face([(a, 0, c), (a, 0, d), (a, gout, d), (a, gout, c)], uvm)   # longs murs
    face([(a, gout, d), (b, gout, d), (xm, H, d)], uvm); face([(b, gout, c), (a, gout, c), (xm, H, c)], uvm)                         # pignons, triangles
    face([(x1, gout, z1), (x1, gout, z0), (xm, H, z0), (xm, H, z1)], uvt); face([(x0, gout, z0), (x0, gout, z1), (xm, H, z1), (xm, H, z0)], uvt) # toit
    V = np.array(V, np.float32); I = np.array(I, np.uint32); N = np.zeros_like(V)
    for t in I.reshape(-1, 3): N[t] += np.cross(V[t[1]] - V[t[0]], V[t[2]] - V[t[0]])
    N /= np.linalg.norm(N, axis=1, keepdims=True)
    return {'pos': V, 'nor': N, 'uv': np.array(U, np.float32)}, I

def vert_ocre(im):
    from PIL import ImageFilter, Image
    x = np.asarray(im.convert('RGB')).astype(np.float64) / 255; r, g, b = x[..., 0], x[..., 1], x[..., 2]; mx = x.max(-1); mn = x.min(-1)
    vert = ((g >= r * 0.95) & (g > b * 1.15) & ((mx - mn) / (mx + 1e-6) > 0.18) & (mx > 0.06)).astype(np.uint8) * 255
    m = np.asarray(Image.fromarray(vert).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.0))).astype(np.float64)[..., None] / 255
    ocre = np.clip(np.array([0.78, 0.58, 0.24])[None, None, :] * (mx / np.median(mx[vert > 0]))[..., None] * 0.55, 0, 1)
    return Image.fromarray(np.round((x * (1 - m) + ocre * m) * 255).astype(np.uint8))
TEINTES = {'vert-ocre': vert_ocre}

g = Glb(a.src); m = g.maillage(); p = m['pos'].astype(np.float64); n = m['nor'].astype(np.float64)
R = {'-x': [[0, 0, -1], [0, 1, 0], [1, 0, 0]], '+x': [[0, 0, 1], [0, 1, 0], [-1, 0, 0]], '-z': np.eye(3), '+z': [[-1, 0, 0], [0, 1, 0], [0, 0, -1]]}[a.avant]
R = np.array(R, float); p = p @ R.T; n = n @ R.T # l'avant vers -z
k = a.longueur / max(np.ptp(p[:, 0]), np.ptp(p[:, 2])); p = (p - [(p[:, 0].max() + p[:, 0].min()) / 2, p[:, 1].min(), 0]) * k
m['pos'] = p.astype(np.float32); m['nor'] = n.astype(np.float32)
print(a.nom, ':', len(p), 'sommets,', len(m['idx']) // 3, 'triangles,', np.round(np.ptp(p, 0), 2), 'm (largeur, hauteur, longueur)')
img = g.image(); out = {'pres': paquet_fixe(m, m['idx']), 'loin': paquet_fixe(*maison_de_loin(m, img)) if a.maison else paquet_fixe(m, alleger(m['pos'], m['idx'], a.loin)), 'tex': texture_url(img, 1024), 'teintes': {}}
for t in a.teinte: camp, nom = t.split(':'); out['teintes'][camp] = texture_url(TEINTES[nom](img.resize((1024, 1024))), 1024)
ch = os.path.join(racine, f'src/modeles/{a.nom}.js'); open(ch, 'w').write('export default ' + json.dumps(out) + ';\n'); print('écrit', ch, os.path.getsize(ch) // 1024, 'Ko')
