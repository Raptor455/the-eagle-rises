"""Prépare un soldat Meshy animé (.glb avec squelette et animations) pour la foule.
   python3 outils/convertir_modele.py modeles/fantassin-francais-anime.glb fr --fusil modeles/fusil-1777.glb
   Écrit src/modeles/fr.js : maillage détaillé et allégé, texture réduite, fusil au port d'arme (main gauche,
   contre l'épaule), et les animations sous forme d'une table de matrices d'os (une ligne par image).
   Un soldat Meshy sans squelette (pose A, comme le français) emprunte squelette et animations à un soldat animé :
   python3 outils/convertir_modele.py modeles/fantassin-russe.glb ru --squelette modeles/fantassin-francais-anime.glb --fusil modeles/fusil-1777.glb
   Cavaliers et chevaux (voir LISEZ-MOI) : --sans-port garde les bras de l'animation, --clips choisit les animations,
   --pres allège la version de près des modèles trop lourds, --selle déplace le cavalier sur le dos du cheval."""
import sys, os, json, base64, io, subprocess, tempfile, argparse
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glb import Glb, Squelette, mat_quat, tourner
racine = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('nom'); ap.add_argument('--fusil'); ap.add_argument('--squelette', help='modèle animé dont on reprend squelette et animations, pour un modèle sans squelette')
ap.add_argument('--sans-port', action='store_true', help="pas de port d'arme : les bras suivent l'animation (cavaliers, chevaux)")
ap.add_argument('--clips', help="animations : nom=mot:images par seconde, séparés par des virgules (ex. attente=idle:10,marche=walking:24)")
ap.add_argument('--pres', type=int, help='triangles de la version de près (par défaut : le modèle entier)'); ap.add_argument('--loin', type=int, default=420, help='triangles de la version de loin')
ap.add_argument('--selle', help="x,y,z : décalage du modèle, en hauteurs du modèle (cavalier assis sur le dos du cheval)"); a = ap.parse_args()
# nom dans le jeu : (mot cherché dans le nom du clip, images par seconde)
CLIPS = {'marche': ('walking', 24), 'course': ('running', 24), 'attente': ('idle', 10)}
if a.clips: CLIPS = {n: (v.split(':')[0], int(v.split(':')[1]), *([tuple(map(float, v.split(':')[2].split('-')))] if v.count(':') > 1 else [])) for n, v in (c.split('=') for c in a.clips.split(','))} # mot:ips[:début-fin en s]

b64 = lambda x: base64.b64encode(x.tobytes()).decode()
def alleger(pos, idx, cible, approx=False, uv=None):
    with tempfile.TemporaryDirectory() as t:
        json.dump({'pos': pos.ravel().tolist(), 'idx': idx.tolist(), **({'uv': uv.ravel().tolist()} if uv is not None else {})}, open(t + '/a.json', 'w'))
        print('  ', subprocess.run(['node', os.path.join(racine, 'outils/simplifier.js'), t + '/a.json', t + '/b.json', str(cible)] + (['approx'] if approx else []), capture_output=True, text=True, check=True).stdout.strip())
        return np.array(json.load(open(t + '/b.json')), np.uint32)
def paquet(m, idx):
    used = np.unique(idx); remap = np.zeros(len(m['pos']), np.uint32); remap[used] = np.arange(len(used))
    return {'n': len(used), 'pos': b64(m['pos'][used].astype('<f4')), 'nor': b64(np.clip(np.round(m['nor'][used] * 127), -127, 127).astype('i1')), 'uv': b64(m['uv'][used].astype('<f4')),
            'os': b64(m['os'][used].astype('u1')), 'poids': b64(np.clip(np.round(m['poids'][used] * 255), 0, 255).astype('u1')), 'idx': b64(remap[idx].astype('<u2')), 'tri': len(idx) // 3}
def texture(g, cote):
    im = g.image().resize((cote, cote))
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=86); return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()

g = Glb(a.src); m = g.maillage()
if a.squelette: # modèle sans squelette : on le cale sur le soldat animé et chaque sommet prend les os de ses voisins les plus proches
    ref = Glb(a.squelette); mr = ref.maillage(); sq = Squelette(ref); P = m['pos'].astype(np.float64); Q = mr['pos'].astype(np.float64)
    if any('mixamorig' in sq.nom(k) for k in range(len(sq.os))): # soldat en pose A
        main = lambda X: X[np.argmax(np.abs(X[:, 0])), 1] - X[:, 1].min() # hauteur des mains en pose A : la coiffe ne compte pas dans la taille
        P = (P - [0, P[:, 1].min(), 0]) * (main(Q) / main(P)) + [0, Q[:, 1].min(), 0] # même taille, pieds au sol
        for ax in (0, 2): # centré sur le buste ; en largeur, envergure des bras alignée
            bP = P[(P[:, 1] > 0.6 * P[:, 1].max()) & (P[:, 1] < 0.75 * P[:, 1].max()), ax]; bQ = Q[(Q[:, 1] > 0.6 * Q[:, 1].max()) & (Q[:, 1] < 0.75 * Q[:, 1].max()), ax]
            P[:, ax] -= np.median(bP) - np.median(bQ)
        P[:, 0] *= np.ptp(Q[:, 0]) / np.ptp(P[:, 0])
    else: # animal (cheval lourd sur le cheval de selle) : boîte englobante calée axe par axe
        P = (P - P.min(0)) / np.ptp(P, 0) * np.ptp(Q, 0) + Q.min(0)
    k = np.zeros((len(P), 4), int); dk = np.zeros((len(P), 4)) # 4 voisins les plus proches, par paquets pour ménager la mémoire
    for i in range(0, len(P), 100):
        d = np.linalg.norm(P[i:i + 100, None, :] - Q[None, :, :], axis=2); k[i:i + 100] = np.argpartition(d, 4, axis=1)[:, :4]; dk[i:i + 100] = np.take_along_axis(d, k[i:i + 100], 1)
    w = 1 / (dk + 1e-4) ** 2; w /= w.sum(1, keepdims=True)
    J = np.zeros((len(P), len(sq.os))) # poids par os, mélangés entre les 4 voisins
    for c in range(4): np.add.at(J, (np.repeat(np.arange(len(P)), 4), mr['os'][k[:, c]].astype(int).ravel()), (w[:, c:c + 1] * mr['poids'][k[:, c]]).ravel())
    top = np.argsort(-J, axis=1)[:, :4]; tw = np.take_along_axis(J, top, 1); tw /= tw.sum(1, keepdims=True)
    m['pos'] = P.astype(np.float32); m['os'] = top.astype(np.uint8); m['poids'] = tw.astype(np.float32)
    print('squelette repris de', a.squelette)
else: sq = Squelette(g)
noms = [sq.nom(k) for k in range(len(sq.os))]
Y0 = float((mr if a.squelette else m)['pos'][:, 1].min()); haut = float((mr if a.squelette else m)['pos'][:, 1].max()) - Y0 # hauteur du modèle qui porte le squelette (sol : y = Y0)
if a.pres and len(m['idx']) // 3 > a.pres: m['idx'] = alleger(m['pos'], m['idx'], a.pres, uv=m['uv']) # modèle trop lourd pour la foule : coutures de texture franchissables
# PORT D'ARME : le bras gauche est figé dans toutes les animations, main à hauteur de hanche sous l'épaule ;
# le fusil y est fixé, vertical contre l'épaule gauche. Le soldat regarde vers +z, sa gauche est +x, 1,75 m de haut.
FIXES = {}
if not a.sans_port:
    os_ = {n: sq.os[noms.index('mixamorig:' + n)] for n in ('Spine2', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand')}
    FIXES = {os_['LeftShoulder']: sq.noeuds[os_['LeftShoulder']].get('rotation', [0, 0, 0, 1]), os_['LeftHand']: sq.noeuds[os_['LeftHand']].get('rotation', [0, 0, 0, 1])}
    COUDE = np.array([0.205, 1.14, 0.045]) * haut / 1.75; POIGNET = np.array([0.215, 0.95, 0.175]) * haut / 1.75
    for nom_os, enfant, cible in (('LeftArm', 'LeftForeArm', COUDE), ('LeftForeArm', 'LeftHand', POIGNET)):
        G = sq.pose(fixes=FIXES)[1]; k = noms.index('mixamorig:' + nom_os); kp = sq.parent[os_[nom_os]]
        Gp = G[sq.os.index(kp)] if kp in sq.os else None
        d = G[noms.index('mixamorig:' + enfant)][:3, 3] - G[k][:3, 3]; R = tourner(d, cible - G[k][:3, 3]) @ G[k][:3, :3]
        FIXES[os_[nom_os]] = mat_quat(np.linalg.inv(Gp[:3, :3]) @ R)
    _G = sq.pose(fixes=FIXES)[1]; print('port d\'arme : coude', np.round(_G[noms.index('mixamorig:LeftForeArm')][:3, 3], 3), 'poignet', np.round(_G[noms.index('mixamorig:LeftHand')][:3, 3], 3))
print('soldat :', len(m['pos']), 'sommets,', len(m['idx']) // 3, 'triangles, hauteur', round(haut, 3), ',', len(noms), 'os')
out = {'pres': paquet(m, m['idx']), 'loin': paquet(m, alleger(m['pos'], m['idx'], a.loin, uv=m['uv'] if a.pres else None)), 'tex': texture(g, 1024), 'haut': round(haut, 4)}

# FUSIL : il a son propre os (après ceux du squelette), et la baguette aussi. Au port d'arme, le fusil suit la main gauche,
# vertical contre l'épaule ; dans les gestes (outils/gestes.py : charge en douze temps, joue, feu, baïonnette), il est posé
# à la main et les bras vont le chercher.
from gestes import Gestes, suites, rot_pure, m4
GESTES = a.fusil and not a.sans_port
if a.fusil:
    f = Glb(a.fusil).maillage(); p = f['pos'].astype(np.float64); L = np.ptp(p[:, 0]); k = 1.9 / L # 1,52 m de fusil et sa baïonnette
    ih = noms.index('mixamorig:LeftHand'); Mf, Gf = sq.pose(fixes=FIXES); poignet = Gf[ih][:3, 3]
    # repère du fusil : crosse à l'origine, bouche du canon (-x du modèle) vers +y, sous-garde (-y) vers +z ; au port d'arme,
    # vertical, un peu penché en avant pour compenser le buste qui se cambre au repos
    R = np.array([[0, 0, 1], [-1, 0, 0], [0, -1, 0]], float)
    s_, c_ = np.sin(np.radians(4)), np.cos(np.radians(4)); Tl = np.array([[1, 0, 0], [0, c_, -s_], [0, s_, c_]])
    crosse = poignet + np.array([-0.01, -0.05, 0.05]) * haut / 1.75
    FUSIL_PORT = np.linalg.inv(Gf[ih]) @ m4(Tl, crosse) # dans le repère de la main gauche
    f['pos'] = (((p - np.array([p[:, 0].max(), 0, 0])) * k) @ R.T).astype(np.float32)
    f['nor'] = f['nor'].astype(np.float64) @ R.T; f['nor'] = (f['nor'] / np.linalg.norm(f['nor'], axis=1, keepdims=True)).astype(np.float32)
    f['os'] = np.zeros((len(p), 4), np.uint8); f['os'][:, 0] = len(noms); f['poids'] = np.zeros((len(p), 4), np.float32); f['poids'][:, 0] = 1
    print('fusil :', len(p), 'sommets,', len(f['idx']) // 3, 'triangles')
    # baguette : un fin cylindre d'acier (tête à l'origine, vers +y), couleur prise sur la baïonnette
    nb, ray, LB = 6, 0.0055, 1.1; a_ = np.arange(nb) * 2 * np.pi / nb
    bpos = np.array([[ray * np.cos(t), y, ray * np.sin(t)] for y in (0, LB) for t in a_], np.float32)
    bnor = np.array([[np.cos(t), 0, np.sin(t)] for y in (0, LB) for t in a_], np.float32)
    bidx = np.array([[i, (i + 1) % nb, nb + i, (i + 1) % nb, nb + (i + 1) % nb, nb + i] for i in range(nb)], np.uint32).ravel()
    sel = f['pos'][:, 1] > 1.5; buv = np.repeat(np.median(f['uv'][sel], 0)[None], 2 * nb, 0).astype(np.float32)
    bag = {'pos': bpos, 'nor': bnor, 'uv': buv, 'os': np.tile([len(noms) + 1, 0, 0, 0], (2 * nb, 1)).astype(np.uint8), 'poids': np.tile([1, 0, 0, 0], (2 * nb, 1)).astype(np.float32)}
    def avec_baguette(idx):
        n0 = len(f['pos']); fb = {c: np.concatenate([f[c], bag[c]]) for c in ('pos', 'nor', 'uv', 'os', 'poids')}
        return paquet(fb, np.concatenate([idx, bidx + n0]))
    out['fusil'] = {'pres': avec_baguette(alleger(f['pos'], f['idx'], int(os.environ.get('FUSIL_PRES', 1200)), True)), 'loin': paquet(f, alleger(f['pos'], f['idx'], 60, True)), 'tex': texture(Glb(a.fusil), 256)}

# animations : le jeu veut un soldat de hauteur 1, pieds au sol, qui regarde vers -z
N = np.diag([-1 / haut, 1 / haut, -1 / haut, 1.0]) @ np.array([[1, 0, 0, 0], [0, 1, 0, -Y0], [0, 0, 1, 0], [0, 0, 0, 1.0]]) # sol à y = 0
if a.selle: S = np.eye(4); S[:3, 3] = [float(v) for v in a.selle.split(',')]; N = S @ N # en hauteurs du modèle, dans le repère du jeu (avant : -z)
if a.fusil: GE = Gestes(sq, noms, FIXES, FUSIL_PORT)
def ligne(G):
    """Une image de la table : les os, puis le fusil et la baguette."""
    M, Gos = sq.habillage(G); M = list(M)
    if a.fusil:
        F, B = G['fusil'], G['baguette']; M += [F, B]
    return (N @ np.stack(M))[:, :3, :], Gos
def au_port(G):
    F = G[sq.os[ih]] @ FUSIL_PORT; F = m4(rot_pure(F), F[:3, 3]); G['fusil'] = F; G['baguette'] = GE.baguette('r', F, None); return G
PIEDS = [k for k, nm in enumerate(noms) if nm.lower().endswith('foot') or nm.lower().split('.')[0].endswith('foot')] # deux pieds, ou quatre sabots
def chemin(Gs):
    """Chemin parcouru par cycle : à chaque image, le pied le plus bas est posé et recule sous le corps d'autant que le soldat avance."""
    pieds = np.array([[(N @ g[k])[:3, 3] for k in PIEDS] for g in Gs]); n = len(Gs) - 1
    return round(float(sum(abs(pieds[i + 1, k, 2] - pieds[i, k, 2]) for i in range(n) for k in [int(np.argmin((pieds[i, :, 1] + pieds[i + 1, :, 1])))])), 4)
lignes = []; clips = {}; BASE = {}
for nom, (mot, ips, *plage) in CLIPS.items():
    c = next((k for k in sq.clips if mot in k.lower()), None)
    if not c: print('  animation absente :', nom); continue
    t0, t1 = plage[0] if plage else (0, sq.duree(c)); d = t1 - t0; n = max(2, int(round(d * ips))); clips[nom] = [len(lignes), n, n / d]; BASE[nom] = (c, t0, d, n)
    Gs = []
    for i in range(n + 1):
        G = sq.globaux(sq.locaux(c, t0 + d * i / n, FIXES))
        if a.fusil: G = au_port(G)
        L_, Gos = ligne(G); Gs.append(Gos)
        if i < n: lignes.append(L_)
    clips[nom].append(chemin(Gs))
    print('  animation', nom, '<-', c, ':', n, 'images, avance par cycle', clips[nom][3], '(hauteur du soldat = 1)')
if GESTES:
    for nom, (cles, ips, duree, corps, boucle) in suites().items():
        if corps: c, t0, d, n = BASE[corps]
        else: c, t0, d = None, 0, duree; n = max(2, int(round(d * ips)))
        Gs = []; pire = 0; clips[nom] = [len(lignes), n, (n if boucle else n - 1) / d]
        for i in range(n + 1 if corps else n):
            t = d * i / (n if boucle else n - 1)
            G, F, B, e = GE.image(cles, 0 if corps else t, c, t0 + t if corps else 0); G['fusil'], G['baguette'] = F, B; pire = max(pire, e)
            L_, Gos = ligne(G); Gs.append(Gos)
            if i < n: lignes.append(L_)
        clips[nom].append(chemin(Gs) if corps else 0)
        print('  geste', nom, ':', n, 'images', ('(corps : ' + corps + ')') if corps else '', '; main la plus loin de sa prise :', round(pire * 100), 'cm')
T = np.stack(lignes).astype(np.float16) # images x os x 3 lignes x 4
out['anim'] = {'os': len(noms) + (2 if a.fusil else 0), 'images': len(lignes), 'clips': clips, 'table': b64(T)}
os.makedirs(os.path.join(racine, 'src/modeles'), exist_ok=True)
ch = os.path.join(racine, f'src/modeles/{a.nom}.js'); open(ch, 'w').write('export default ' + json.dumps(out) + ';\n'); print('écrit', ch, os.path.getsize(ch) // 1024, 'Ko')
