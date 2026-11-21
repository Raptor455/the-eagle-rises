"""Lecture d'un fichier .glb : maillage, squelette, animations."""
import json, struct, io
import numpy as np
CT = {5120: 'i1', 5121: 'u1', 5122: '<i2', 5123: '<u2', 5125: '<u4', 5126: '<f4'}; NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
class Glb:
    def __init__(self, chemin):
        f = open(chemin, 'rb').read(); n = struct.unpack('<I', f[12:16])[0]
        self.j = json.loads(f[20:20 + n]); self.bin = f[20 + n + 8:]
    def acc(self, i):
        a = self.j['accessors'][i]; bv = self.j['bufferViews'][a['bufferView']]; dt = np.dtype(CT[a['componentType']]); k = NC[a['type']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); st = bv.get('byteStride') or dt.itemsize * k
        raw = np.frombuffer(self.bin, np.uint8, st * (a['count'] - 1) + dt.itemsize * k, off)
        return np.lib.stride_tricks.as_strided(raw, (a['count'], dt.itemsize * k), (st, 1)).copy().view(dt).reshape(a['count'], k)
    def image(self, i=0):
        from PIL import Image
        bv = self.j['bufferViews'][self.j['images'][i]['bufferView']]; o = bv.get('byteOffset', 0)
        return Image.open(io.BytesIO(self.bin[o:o + bv['byteLength']])).convert('RGB')
    def maillage(self):
        p = self.j['meshes'][0]['primitives'][0]; A = p['attributes']
        d = {'pos': self.acc(A['POSITION']).astype(np.float32), 'nor': self.acc(A['NORMAL']).astype(np.float32), 'uv': self.acc(A['TEXCOORD_0']).astype(np.float32), 'idx': self.acc(p['indices']).astype(np.uint32).ravel()}
        if 'JOINTS_0' in A: d['os'] = self.acc(A['JOINTS_0']).astype(np.uint8); d['poids'] = self.acc(A['WEIGHTS_0']).astype(np.float32)
        return d

def quat_mat(q):
    x, y, z, w = q; return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
def mat_quat(m):
    m = np.asarray(m, float)[:3, :3]; w = np.sqrt(max(0.0, 1 + m[0, 0] + m[1, 1] + m[2, 2])) / 2; x = np.sqrt(max(0.0, 1 + m[0, 0] - m[1, 1] - m[2, 2])) / 2
    y = np.sqrt(max(0.0, 1 - m[0, 0] + m[1, 1] - m[2, 2])) / 2; z = np.sqrt(max(0.0, 1 - m[0, 0] - m[1, 1] + m[2, 2])) / 2
    x = np.copysign(x, m[2, 1] - m[1, 2]); y = np.copysign(y, m[0, 2] - m[2, 0]); z = np.copysign(z, m[1, 0] - m[0, 1]); q = np.array([x, y, z, w]); return q / np.linalg.norm(q)
def tourner(d, t):
    """Plus petite rotation qui amène la direction d sur la direction t."""
    d = d / np.linalg.norm(d); t = t / np.linalg.norm(t); v = np.cross(d, t); c = float(np.dot(d, t)); K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + K + K @ K / (1 + c)
def trs(t, r, s):
    m = np.eye(4); m[:3, :3] = quat_mat(r) * np.asarray(s)[None, :]; m[:3, 3] = t; return m

class Squelette:
    def __init__(self, g):
        self.g = g; j = g.j; self.noeuds = j['nodes']; sk = j['skins'][0]; self.os = sk['joints']
        self.ibm = g.acc(sk['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64)
        self.parent = {}
        for i, n in enumerate(self.noeuds):
            for c in n.get('children', []): self.parent[c] = i
        self.ordre = []
        def visite(i): self.ordre.append(i); [visite(c) for c in self.noeuds[i].get('children', [])]
        for r in range(len(self.noeuds)):
            if r not in self.parent: visite(r)
        self.clips = {}
        for a in j.get('animations', []):
            pistes = []
            for c in a['channels']:
                s = a['samplers'][c['sampler']]; pistes.append((c['target']['node'], c['target']['path'], g.acc(s['input']).ravel().astype(np.float64), g.acc(s['output']).astype(np.float64), s.get('interpolation', 'LINEAR')))
            self.clips[a['name']] = pistes
    def nom(self, k): return self.noeuds[self.os[k]].get('name')
    def duree(self, clip): return max(p[2][-1] for p in self.clips[clip])
    def locaux(self, clip=None, t=0.0, fixes=None):
        """Position, rotation, échelle locales de chaque nœud à l'instant t du clip.
           fixes : {noeud: rotation locale} imposée quelle que soit l'animation (bras gauche au port d'arme)."""
        loc = {}
        for i, n in enumerate(self.noeuds): loc[i] = [np.array(n.get('translation', [0, 0, 0]), float), np.array(n.get('rotation', [0, 0, 0, 1]), float), np.array(n.get('scale', [1, 1, 1]), float)]
        if clip:
            for node, path, tin, out, interp in self.clips[clip]:
                if interp == 'CUBICSPLINE': out = out.reshape(len(tin), 3, -1)[:, 1]
                k = int(np.clip(np.searchsorted(tin, t) - 1, 0, len(tin) - 2)) if len(tin) > 1 else 0
                if len(tin) == 1 or interp == 'STEP': v = out[k]
                else:
                    a = float(np.clip((t - tin[k]) / max(1e-9, tin[k + 1] - tin[k]), 0, 1)); v0, v1 = out[k], out[k + 1]
                    if path == 'rotation' and np.dot(v0, v1) < 0: v1 = -v1
                    v = v0 * (1 - a) + v1 * a
                    if path == 'rotation': v = v / np.linalg.norm(v)
                loc[node][{'translation': 0, 'rotation': 1, 'scale': 2}[path]] = v
        for node, q in (fixes or {}).items(): loc[node][1] = np.asarray(q, float)
        return loc
    def globaux(self, loc):
        """Matrice de chaque nœud dans le repère du modèle."""
        G = {}
        for i in self.ordre:
            m = trs(*loc[i]) if 'matrix' not in self.noeuds[i] else np.array(self.noeuds[i]['matrix']).reshape(4, 4).T
            G[i] = G[self.parent[i]] @ m if i in self.parent else m
        return G
    def habillage(self, G):
        """Matrices d'habillage (une par os) et matrices des os, à partir des matrices des nœuds."""
        return np.stack([G[n] @ self.ibm[k] for k, n in enumerate(self.os)]), np.stack([G[n] for n in self.os])
    def pose(self, clip=None, t=0.0, fixes=None):
        """Matrices d'habillage (une par os) : position animée = somme des poids x matrice x position de repos."""
        return self.habillage(self.globaux(self.locaux(clip, t, fixes)))
def habiller(M, pos, os, poids):
    p4 = np.concatenate([pos, np.ones((len(pos), 1))], 1); out = np.zeros((len(pos), 3))
    for c in range(4): out += poids[:, c:c + 1] * np.einsum('nij,nj->ni', M[os[:, c]], p4)[:, :3]
    return out
