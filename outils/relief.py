"""Fabrique src/heights.js : le relief d'un champ de bataille et ses ruisseaux.

  python3 outils/relief.py

Le cadre (latitude, longitude) est réglé plus bas. Les tuiles d'altitude Terrarium
(zoom 12) manquantes sont téléchargées dans donnees/. Les ruisseaux sont tirés du
relief lui-même : on suit la pente et on garde les fonds où l'eau s'accumule.
Demande Python avec numpy et Pillow.
"""
import base64, heapq, json, math, os, sys, urllib.request
import numpy as np
from PIL import Image

RACINE = os.path.join(os.path.dirname(__file__), '..')
Z = 12
NORD, SUD, OUEST, EST = 49.205, 49.072, 16.700, 16.885   # Pratzen, Santon, Žuráň, étangs de Satschan
PAS = 25.0             # mètres entre deux points d'altitude
SEUIL_RUISSEAU = 2.2e6 # m² de bassin versant pour qu'un fond devienne un ruisseau

def merc(lat, lon):  # position en tuiles au zoom Z
    n = 2 ** Z
    return (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n

def tuile(x, y):
    f = os.path.join(RACINE, 'donnees', f'relief-{Z}-{x}-{y}.png')
    if not os.path.exists(f):
        url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{Z}/{x}/{y}.png'
        print('téléchargement', url)
        urllib.request.urlretrieve(url, f)
    a = np.asarray(Image.open(f).convert('RGB')).astype(np.float64)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768

x0, y0 = merc(NORD, OUEST); x1, y1 = merc(SUD, EST)
tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
mosaique = np.vstack([np.hstack([tuile(x, y) for x in range(tx0, tx1 + 1)]) for y in range(ty0, ty1 + 1)])

latc = (NORD + SUD) / 2
TILE = 40075016.686 * math.cos(math.radians(latc)) / 2 ** Z   # mètres par tuile
WX, WZ = (x1 - x0) * TILE, (y1 - y0) * TILE
HW, HH = int(round(WX / PAS)) + 1, int(round(WZ / PAS)) + 1

# rééchantillonnage bilinéaire (les pixels Terrarium sont centrés sur +0,5)
gx = (np.linspace(x0, x1, HW) - tx0) * 256 - 0.5
gy = (np.linspace(y0, y1, HH) - ty0) * 256 - 0.5
GX, GY = np.meshgrid(gx, gy)
i, j = np.floor(GX).astype(int), np.floor(GY).astype(int)
a, b = GX - i, GY - j
M = lambda jj, ii: mosaique[np.clip(jj, 0, mosaique.shape[0] - 1), np.clip(ii, 0, mosaique.shape[1] - 1)]
H = (M(j, i) * (1 - a) + M(j, i + 1) * a) * (1 - b) + (M(j + 1, i) * (1 - a) + M(j + 1, i + 1) * a) * b

# ruisseaux : remplissage des creux (priority flood), sens d'écoulement, accumulation
F = H.copy(); vu = np.zeros(H.shape, bool); pq = []
for jj in range(HH):
    for ii in range(HW):
        if jj in (0, HH - 1) or ii in (0, HW - 1):
            heapq.heappush(pq, (F[jj, ii], jj, ii)); vu[jj, ii] = True
V8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
aval = np.full(H.shape + (2,), -1, int); ordre = []
while pq:
    h, jj, ii = heapq.heappop(pq); ordre.append((jj, ii))
    for dj, di in V8:
        nj, ni = jj + dj, ii + di
        if 0 <= nj < HH and 0 <= ni < HW and not vu[nj, ni]:
            vu[nj, ni] = True; F[nj, ni] = max(F[nj, ni], h + 1e-4)
            aval[nj, ni] = (jj, ii); heapq.heappush(pq, (F[nj, ni], nj, ni))
acc = np.full(H.shape, PAS * PAS)
for jj, ii in reversed(ordre):
    aj, ai = aval[jj, ii]
    if aj >= 0: acc[aj, ai] += acc[jj, ii]

lit = (acc >= SEUIL_RUISSEAU) & (F - H < 1.5)   # pas de ruisseau à travers une cuvette comblée
traces, fait = [], np.zeros(H.shape, bool)
# on part des sources (cases de lit sans amont dans le lit) et on descend
amont = np.zeros(H.shape, int)
for jj, ii in ordre:
    aj, ai = aval[jj, ii]
    if aj >= 0 and lit[jj, ii]: amont[aj, ai] += 1
for jj, ii in reversed(ordre):
    if not lit[jj, ii] or amont[jj, ii] or fait[jj, ii]: continue
    t = []; cj, ci = jj, ii
    while cj >= 0:
        t.append((cj, ci, acc[cj, ci]))
        if fait[cj, ci]: break
        fait[cj, ci] = True
        cj, ci = aval[cj, ci]
    if len(t) > 3: traces.append(t)

def vers_monde(jj, ii):
    return round(ii / (HW - 1) * WX - WX / 2, 1), round(jj / (HH - 1) * WZ - WZ / 2, 1)
ruisseaux = []
for t in traces:
    pts = []
    for k, (jj, ii, ac) in enumerate(t):
        if k % 2 and k != len(t) - 1: continue   # un point sur deux suffit
        x, z = vers_monde(jj, ii)
        pts += [x, z, round(min(1.0, math.sqrt(ac / SEUIL_RUISSEAU) / 4), 2)]  # largeur relative
    ruisseaux.append(pts)

q = np.clip(np.round(H * 10), 0, 65535).astype('<u2')
cadre = dict(nord=NORD, sud=SUD, ouest=OUEST, est=EST, z=Z, x0=x0, y0=y0, x1=x1, y1=y1, tuile=TILE)
out = (f'// Fait par outils/relief.py : ne pas modifier à la main.\n'
       f'export const HW={HW},HH={HH};\nexport const CADRE={json.dumps(cadre)};\n'
       f'export const RUISSEAUX={json.dumps(ruisseaux, separators=(",", ":"))};\n'
       f'export const H64="{base64.b64encode(q.tobytes()).decode()}";\n')
open(os.path.join(RACINE, 'src', 'heights.js'), 'w').write(out)
print(f'{HW}×{HH} points, {WX/1000:.1f} × {WZ/1000:.1f} km, altitude {H.min():.0f} à {H.max():.0f} m, '
      f'{len(ruisseaux)} ruisseaux, {len(out)//1024} Ko')
