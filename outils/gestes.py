"""Gestes du fantassin, faits à la main d'après le règlement de 1791 (charge en douze temps du fusil modèle 1777) :
   apprêtez armes et joue, feu, rechargement complet, baïonnette croisée (au pas et au pas de course), coup de baïonnette.
   Les gestes sont décrits par des postures-clés (fusil, mains, buste, tête, baguette) ; entre deux clés, tout est
   interpolé en douceur, puis les bras sont posés par cinématique inverse (épaule, coude, poignet).

   Repère des postures : en mètres, le soldat regarde vers +z, sa gauche est +x, origine au sol sous les hanches.
   Les postures sont données dans le repère du buste (tourné de `lacet` degrés autour de la verticale).
   Repère du fusil : X sur le côté, Y de la crosse vers la bouche, Z vers le dessous (sous-garde, capucines).
   La crosse est à l'origine ; la bouche du canon est à 1,42 m, la pointe de la baïonnette à 1,9 m."""
import numpy as np
from glb import mat_quat, quat_mat

BOUCHE = 1.42      # crosse -> bouche du canon (m)
BAGUETTE = 1.1     # longueur de la baguette
LOGE = 1.36        # tête de la baguette rangée, sous le canon
CANON_Z = -0.05    # axe du canon dans le repère du fusil (au-dessus de l'axe de la crosse)


def unit(v): v = np.asarray(v, float); return v / np.linalg.norm(v)
def rot_axe(axe, deg):
    x, y, z = unit(axe); a = np.radians(deg); c, s = np.cos(a), np.sin(a); C = 1 - c
    return np.array([[c + x * x * C, x * y * C - z * s, x * z * C + y * s], [y * x * C + z * s, c + y * y * C, y * z * C - x * s], [z * x * C - y * s, z * y * C + x * s, c + z * z * C]])
def ry(deg): return rot_axe([0, 1, 0], deg)
def m4(R=np.eye(3), t=(0, 0, 0)): m = np.eye(4); m[:3, :3] = R; m[:3, 3] = t; return m
def base(a, b):
    """Rotation dont la 1re colonne est a et la 2e est b (orthogonalisée)."""
    a = unit(a); b = unit(np.asarray(b, float) - np.dot(b, a) * a); return np.stack([a, b, np.cross(a, b)], 1)
def slerp(R0, R1, s):
    q0, q1 = mat_quat(R0), mat_quat(R1)
    if np.dot(q0, q1) < 0: q1 = -q1
    d = float(np.clip(np.dot(q0, q1), -1, 1))
    if d > 0.9995: q = q0 + (q1 - q0) * s
    else: th = np.arccos(d); q = (np.sin((1 - s) * th) * q0 + np.sin(s * th) * q1) / np.sin(th)
    return quat_mat(q / np.linalg.norm(q))
def melange(A, B, s): return m4(slerp(A[:3, :3], B[:3, :3], s), A[:3, 3] * (1 - s) + B[:3, 3] * s)
def lisse(s): return s * s * (3 - 2 * s)
def rot_pure(G): R = G[:3, :3]; return R / np.linalg.norm(R, axis=0)


def fusil(crosse, bouche, dessous):
    """Pose du fusil : crosse (position), direction de la bouche, direction du dessous (repère du buste)."""
    Y = unit(bouche); Z = unit(np.asarray(dessous, float) - np.dot(dessous, Y) * Y); return m4(np.stack([np.cross(Y, Z), Y, Z], 1), crosse)


class Gestes:
    def __init__(self, sq, noms, fixes, fusil_port):
        """fusil_port : matrice du fusil au port d'arme, dans le repère de la main gauche (le fusil la suit)."""
        self.sq, self.fixes, self.Fp = sq, fixes, fusil_port
        self.n = {k: sq.os[noms.index('mixamorig:' + k)] for k in ('Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand')}
        self.idle = next(c for c in sq.clips if 'idle' in c.lower())
        G = sq.globaux(sq.locaux(self.idle, 0, fixes)); self.G0 = G
        h = G[self.n['Hips']][:3, 3]; self.c = np.array([h[0], 0, h[2]]) # axe du buste
        # repère « main » : doigts, paume ; tiré de la pose de liaison (pose A, paumes vers le bas et vers le corps)
        Gb = sq.globaux(sq.locaux()); self.main = {}
        for c in ('Left', 'Right'):
            f = unit(Gb[self.n[c + 'Hand']][:3, 3] - Gb[self.n[c + 'ForeArm']][:3, 3]); n = np.cross(f, [0, 0, 1]) if c == 'Left' else np.cross([0, 0, 1], f)
            self.main[c] = rot_pure(Gb[self.n[c + 'Hand']]).T @ base(f, n) # doigts et paume dans le repère de l'os de la main
        self.port = self.pose_port(G)

    # --- repères ---
    def buste(self, lacet, depl=np.zeros(3)):
        """Du repère du buste (centré sur les hanches, tourné de lacet degrés) au repère du modèle."""
        return m4(ry(lacet), self.c + depl)
    def main_virtuelle(self, G, c):
        """Poignet et repère (doigts, paume, pouce) de la main c dans le repère du modèle."""
        return m4(rot_pure(G[self.n[c + 'Hand']]) @ self.main[c], G[self.n[c + 'Hand']][:3, 3])
    def pose_port(self, G):
        F = G[self.n['LeftHand']] @ self.Fp; F = m4(rot_pure(F), F[:3, 3])
        return {'fusil': F, 'mg': np.linalg.inv(F) @ self.main_virtuelle(G, 'Left'), 'md': self.main_virtuelle(G, 'Right')}

    # --- os ---
    def tourner_os(self, loc, G, nom, R):
        """Applique la rotation R (repère du modèle) à l'os nom, puis recalcule les matrices."""
        nd = self.n[nom]; p = self.sq.parent[nd]; Rp = rot_pure(G[p]); Rg = R @ rot_pure(G[nd])
        loc[nd][1] = mat_quat(Rp.T @ Rg); return self.sq.globaux(loc)
    def bras(self, loc, G, c, cible, coude):
        """Cinématique inverse à deux os : poignet sur cible[:3, 3], coude vers la direction coude, main orientée."""
        S = G[self.n[c + 'Arm']][:3, 3]; E = G[self.n[c + 'ForeArm']][:3, 3]; W = G[self.n[c + 'Hand']][:3, 3]
        l1, l2 = np.linalg.norm(E - S), np.linalg.norm(W - E); T = cible[:3, 3]; d = T - S; L = np.linalg.norm(d)
        L2 = np.clip(L, abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999); u = d / L; a = (l1 * l1 - l2 * l2 + L2 * L2) / (2 * L2); h = np.sqrt(max(0, l1 * l1 - a * a))
        p = np.asarray(coude, float) - np.dot(coude, u) * u; p = unit(p) if np.linalg.norm(p) > 1e-6 else unit(np.cross(u, [0, 1, 0]))
        E2 = S + u * a + p * h
        G = self.tourner_os(loc, G, c + 'Arm', rot_axe_de(E - S, E2 - S))
        E = G[self.n[c + 'ForeArm']][:3, 3]; W = G[self.n[c + 'Hand']][:3, 3]; W2 = S + u * L2
        G = self.tourner_os(loc, G, c + 'ForeArm', rot_axe_de(W - E, W2 - E))
        R = cible[:3, :3] @ self.main[c].T @ rot_pure(G[self.n[c + 'Hand']]).T
        return self.tourner_os(loc, G, c + 'Hand', R), np.linalg.norm(T - W2)

    # --- postures ---
    def tenue(self, spec, F, B, port, c):
        """Repère de la main (modèle) : ('f', le long, doigts, paume[, écart]) sur le fusil, ('c', poignet, doigts, paume) dans le buste,
           'port' : comme au port d'arme ; ('b', fraction) : sur la baguette, à cette fraction depuis la tête."""
        if spec == 'port': return F @ port['mg'] if c == 'Left' else B @ np.linalg.inv(self.buste(0)) @ port['md']
        k = spec[0]
        if k == 'f':
            Rm = base(spec[2], spec[3]); prise = np.array([0, spec[1], spec[4] if len(spec) > 4 else 0])
            return F @ m4(Rm, prise - 0.075 * Rm[:, 0] - 0.035 * Rm[:, 1])
        if k == 'c':
            Rm = base(spec[2], spec[3]); return B @ m4(Rm, spec[1])
        raise ValueError(spec)
    def baguette(self, spec, F, Md):
        """'r' : rangée sous le canon ; ('t', glissement) : tirée vers le haut, encore dans ses porte-baguettes ;
           ('k', profondeur) : tête dans le canon ; ('m', fraction, sens) : dans la main droite, tenue à cette fraction
           depuis la tête, tête vers le pouce (sens 1) ou vers le petit doigt (-1)."""
        if spec == 'r' or spec[0] == 't':
            g = 0 if spec == 'r' else spec[1]; return F @ m4(np.diag([-1, -1, 1.0]), [0, LOGE + g, CANON_Z + 0.022])
        if spec[0] == 'k': return F @ m4(np.eye(3), [0, BOUCHE - spec[1], CANON_Z])
        if spec[0] == 'm':
            Rm = Md[:3, :3]; prise = Md[:3, 3] + 0.075 * Rm[:, 0] + 0.03 * Rm[:, 1]; axe = Rm[:, 2] * spec[2] # le pouce
            Y = -axe; X = unit(np.cross(Y, Rm[:, 0])); return m4(np.stack([X, Y, np.cross(X, Y)], 1), prise + axe * spec[1] * BAGUETTE)
        raise ValueError(spec)

    def image(self, cles, t, clip=None, tc=0.0):
        """Matrices des nœuds à l'instant t d'une suite de postures-clés ; le corps suit clip (instant tc) ou l'attente.
           Renvoie aussi le fusil et la baguette (repère du modèle) et l'écart des mains à leur cible (m)."""
        i = max(0, min(len(cles) - 2, int(np.searchsorted([k['t'] for k in cles], t, 'right')) - 1))
        k0, k1 = cles[i], cles[i + 1] if len(cles) > 1 else cles[i]
        s = lisse(float(np.clip((t - k0['t']) / max(1e-6, k1['t'] - k0['t']), 0, 1))) if k1 is not k0 else 0.0
        v = lambda nom, d=0.0: (k0.get(nom, d), k1.get(nom, d))
        mix = lambda nom, d=0.0: np.asarray(v(nom, d)[0], float) * (1 - s) + np.asarray(v(nom, d)[1], float) * s
        sq = self.sq; loc = sq.locaux(clip or self.idle, tc if clip else 0.0, self.fixes); G = sq.globaux(loc)
        depl = G[self.n['Hips']][:3, 3] - self.G0[self.n['Hips']][:3, 3]; depl[1] = 0
        # buste : lacet (tourne à droite si négatif) et penché en avant, répartis sur les trois vertèbres ; tête
        lacet, tang = float(mix('lacet')), float(mix('tang'))
        axe = ry(lacet) @ np.array([1.0, 0, 0])
        for nom in ('Spine', 'Spine1', 'Spine2'): G = self.tourner_os(loc, G, nom, rot_axe(axe, tang / 3) @ ry(lacet / 3))
        tete, tlac = float(mix('tete')), float(mix('tete_lacet'))
        for nom in ('Neck', 'Head'): G = self.tourner_os(loc, G, nom, rot_axe(ry(lacet + tlac) @ np.array([1.0, 0, 0]), tete / 2) @ ry(tlac / 2))
        # fusil : chaque clé donne sa pose dans son propre repère de buste
        B0, B1 = self.buste(k0.get('lacet', 0), depl), self.buste(k1.get('lacet', 0), depl)
        def pose_fusil(k, B):
            f = k.get('fusil', 'port'); return B @ np.linalg.inv(self.buste(0)) @ self.port['fusil'] if isinstance(f, str) else B @ f
        F = melange(pose_fusil(k0, B0), pose_fusil(k1, B1), s); Bm = self.buste(lacet, depl)
        # mains : chaque clé place la main (sur le fusil d'aujourd'hui ou dans le buste d'aujourd'hui), puis on mélange
        ecart = 0; mains = {}
        for c, cle, cdef in (('Right', 'md', [-1, -0.3, -0.4]), ('Left', 'mg', [1, -0.5, 0])):
            a, b = v(cle, 'port'); A = self.tenue(a, F, Bm, self.port, c); Bt = self.tenue(b, F, Bm, self.port, c)
            M = melange(A, Bt, s); co = ry(lacet) @ unit(mix('c' + cle, cdef))
            G, e = self.bras(loc, G, c, M, co); ecart = max(ecart, e); mains[c] = self.main_virtuelle(G, c)
        a, b = v('bag', 'r'); Bag = melange(self.baguette(a, F, mains['Right']), self.baguette(b, F, mains['Right']), s)
        return G, F, Bag, ecart

def rot_axe_de(a, b):
    """Plus petite rotation qui amène la direction a sur la direction b."""
    a, b = unit(a), unit(b); v = np.cross(a, b); c = float(np.dot(a, b))
    if c < -0.9999: return rot_axe(np.cross(a, [1, 0, 0]) if abs(a[0]) < 0.9 else np.cross(a, [0, 1, 0]), 180)
    K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]); return np.eye(3) + K + K @ K / (1 + c)


# ===== Postures =====
# mains sur le fusil : ('f', distance depuis la crosse, doigts, paume) dans le repère du fusil ; dans le buste : ('c', poignet, doigts, paume)
DROITE_POIGNEE = ('f', 0.30, [0.3, 0, 1], [1, 0, 0])      # main droite à la poignée, index sur la détente
GAUCHE_DESSOUS = lambda le_long: ('f', le_long, [-1, 0, 0.2], [0, 0, -1]) # main gauche sous le fût, paume vers le haut
VISEE = (35, [0.574, -0.03, 0.819])                        # buste tourné à droite de 35° ; dans son repère, l'axe du tir
JOUE = {'lacet': -VISEE[0], 'tete': 14, 'tete_lacet': 22, 'fusil': fusil([-0.15, 1.44, 0.05], VISEE[1], [0, -1, 0]),
        'md': DROITE_POIGNEE, 'mg': GAUCHE_DESSOUS(0.54), 'cmd': [-1, 0.15, 0], 'cmg': [0.3, -1, 0.2]}
APPRETEZ = {'lacet': -20, 'tete': 4, 'fusil': fusil([-0.06, 0.82, 0.24], [0.04, 1, 0.08], [0, 0, 1]),
            'md': ('f', 0.33, [0.3, 0, 1], [1, 0, 0]), 'mg': ('f', 0.76, [1, 0, 0], [0, 0, -1]), 'cmd': [-1, -0.6, 0], 'cmg': [0.5, -1, 0]}
_d = unit([0.3, 0.32, 0.85])
CHARGEZ = {'lacet': -40, 'tete': 22, 'tete_lacet': 15, 'fusil': fusil(np.array([-0.08, 1.12, 0.16]) - 0.47 * _d, _d, [-0.5, -0.6, 0.25]),
           'md': ('f', 0.47, [0, 1, 0], [1, 0, 0]), 'mg': GAUCHE_DESSOUS(0.74), 'cmd': [-1, -0.5, -0.3], 'cmg': [0.3, -1, 0]}
GIBERNE = ('c', [-0.17, 0.98, -0.2], [0, -1, -0.2], [0.3, 0, -1])
BOUCHE_H = ('c', [-0.13, 1.44, 0.16], [1, 0.25, 0.1], [0, 0, -1])
A_GAUCHE = {'lacet': -10, 'tete': 25, 'fusil': fusil([0.07, 0.03, 0.38], [-0.02, 1, -0.09], [0, 0, -1]),
            'mg': ('f', 0.98, [1, 0, 0], [0, 0, -1]), 'cmg': [0.5, -1, -0.2], 'cmd': [-1, -0.4, -0.3]}
SUR_BAGUETTE = lambda le_long: ('f', le_long, [0, 0, -1], [-1, 0, 0], -0.03) # main droite sur la baguette, pouce en haut
CROISEZ = {'lacet': -30, 'tete': 0, 'tete_lacet': 25, 'fusil': fusil([-0.2, 0.95, -0.1], [0.5, 0.22, 0.866], [0, -1, 0]),
           'md': DROITE_POIGNEE, 'mg': GAUCHE_DESSOUS(0.62), 'cmd': [-0.6, -0.3, -1], 'cmg': [0.3, -1, 0]}
PORT = {'lacet': 0, 'tete': 0}

def cle(t, base, **k): d = dict(base); d.update(k); d['t'] = t; return d
def decaler(F, depl=(0, 0, 0), rot=None):
    F = F.copy(); F[:3, 3] += depl
    if rot is not None: F[:3, :3] = rot @ F[:3, :3]
    return F

def suites():
    """nom -> (clés, images par seconde, durée, clip du corps (mot) ou None, en boucle)."""
    recul = decaler(JOUE['fusil'], -0.05 * np.array(VISEE[1]), rot_axe(np.cross(VISEE[1], [0, 1, 0]), -6))
    feu = [cle(0, JOUE), cle(0.06, JOUE, fusil=recul, tang=-5, tete=10), cle(0.35, JOUE), cle(1.3, CHARGEZ)]
    joue = [cle(0, PORT), cle(0.7, APPRETEZ), cle(1.35, JOUE), cle(1.6, JOUE)]
    H = BOUCHE # hauteur de la bouche du canon, l'arme à gauche (crosse au sol)
    verser = ('c', [0.02, 1.50, 0.22], [0.3, -0.4, 1], [0, -1, -0.4])
    haut = ('c', [0.06, 1.70, 0.24], [0, 0, 1], [1, 0, 0])
    rec = [cle(0, CHARGEZ),
           cle(0.6, CHARGEZ, md=('f', 0.50, [0, 1, 0], [1, 0, 0])),                 # 2. ouvrez le bassinet
           cle(1.3, CHARGEZ, md=GIBERNE, cmd=[-0.6, 0, -1], tete=15),               # 3. prenez la cartouche
           cle(2.0, CHARGEZ, md=BOUCHE_H, cmd=[-1, -1, 0], tete=-6),                # 4. déchirez la cartouche
           cle(2.5, CHARGEZ, md=BOUCHE_H, cmd=[-1, -1, 0], tete=-6),
           cle(3.1, CHARGEZ, md=('f', 0.45, [0, 1, 0], [1, 0, 0])),                 # 5. amorcez
           cle(3.6, CHARGEZ, md=('f', 0.49, [0, 1, 0], [1, 0, 0])),
           cle(4.1, CHARGEZ, md=('f', 0.47, [0, 1, 0], [1, 0, 0])),                 # 6. fermez le bassinet
           cle(5.0, A_GAUCHE, md=verser),                                           # 7. l'arme à gauche
           cle(5.7, A_GAUCHE, md=verser),                                           # 8. la cartouche dans le canon
           cle(6.2, A_GAUCHE, md=SUR_BAGUETTE(LOGE + 0.03)),                        # 9. tirez la baguette
           cle(6.7, A_GAUCHE, md=SUR_BAGUETTE(LOGE + 0.45), bag=('t', 0.42)),
           cle(7.2, A_GAUCHE, md=haut, bag=('m', 0.42, -1), tete=10),               #    retournez-la au-dessus du canon
           cle(7.7, A_GAUCHE, md=SUR_BAGUETTE(H - 0.35 + 0.42), bag=('k', 0.35)),
           cle(8.1, A_GAUCHE, md=SUR_BAGUETTE(H - 0.72 + 0.9), bag=('k', 0.72)),   #    elle glisse ; on la reprend par le bout
           cle(8.5, A_GAUCHE, md=SUR_BAGUETTE(H - 1.0 + 0.9), bag=('k', 1.0)),     # 10. bourrez (deux coups)
           cle(8.8, A_GAUCHE, md=SUR_BAGUETTE(H - 0.85 + 0.9), bag=('k', 0.85)),
           cle(9.1, A_GAUCHE, md=SUR_BAGUETTE(H - 1.0 + 0.9), bag=('k', 1.0)),
           cle(9.6, A_GAUCHE, md=SUR_BAGUETTE(H - 0.70 + 0.9), bag=('k', 0.70)),   # 11. remettez la baguette
           cle(10.1, A_GAUCHE, md=haut, bag=('m', 0.04, 1), tete=10),
           cle(10.5, A_GAUCHE, md=SUR_BAGUETTE(LOGE + 0.42), bag=('t', 0.40)),
           cle(10.9, A_GAUCHE, md=SUR_BAGUETTE(LOGE + 0.03), bag='r'),
           cle(11.8, PORT),                                                         # 12. portez vos armes
           cle(12.2, PORT)]
    pousse = decaler(CROISEZ['fusil'], 0.13 * unit([0.5, 0.1, 0.866]))
    estoc = [cle(0, CROISEZ), cle(0.3, CROISEZ, fusil=pousse, tang=20, lacet=-18), cle(0.5, CROISEZ, fusil=pousse, tang=20, lacet=-18), cle(1.0, CROISEZ)]
    return {'joue': (joue, 20, 1.6, None, False), 'feu': (feu, 20, 1.3, None, False), 'recharge': (rec, 10, 12.2, None, False),
            'estoc': (estoc, 15, 1.0, None, True), 'charge': ([cle(0, CROISEZ)], None, None, 'marche', True), 'assaut': ([cle(0, CROISEZ)], None, None, 'course', True)}
