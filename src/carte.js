/* ===== CARTE : relief réel, eau, routes, villages, bois =====
   Le relief et les ruisseaux viennent de outils/relief.py (src/heights.js).
   Positions de villages, routes et faisanderie : placées à la main, à vérifier sur sources. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HW, HH, H64, CADRE, RUISSEAUX } from './heights.js';

export const TILE = CADRE.tuile, WX = (CADRE.x1 - CADRE.x0) * TILE, WZ = (CADRE.y1 - CADRE.y0) * TILE, VE = 2.5, H0 = 180;
const N = 2 ** CADRE.z;
export function ll(lat, lon) { // latitude, longitude -> position sur la carte (mètres, x vers l'est, z vers le sud)
  const tx = (lon + 180) / 360 * N, ty = (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * N;
  return [((tx - CADRE.x0) / (CADRE.x1 - CADRE.x0) - 0.5) * WX, ((ty - CADRE.y0) / (CADRE.y1 - CADRE.y0) - 0.5) * WZ];
}
const hRaw = (() => { const b = atob(H64), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new Uint16Array(u.buffer); })();
const alt = (i, j) => hRaw[Math.min(HH - 1, Math.max(0, j)) * HW + Math.min(HW - 1, Math.max(0, i))] / 10;
export function altAt(x, z) { // altitude réelle en mètres
  const fx = (x / WX + 0.5) * (HW - 1), fz = (z / WZ + 0.5) * (HH - 1);
  const i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j;
  return (alt(i, j) * (1 - a) + alt(i + 1, j) * a) * (1 - b) + (alt(i, j + 1) * (1 - a) + alt(i + 1, j + 1) * a) * b;
}
export const yAt = (x, z) => (altAt(x, z) - H0) * VE;

/* ---- étangs gelés de Satschan et de Menitz (forme approximative) : la glace est plate ---- */
const ETANGS = [
  { nom: 'Étang de Satschan', lat: 49.0835, lon: 16.7390, rx: 900, rz: 330, ang: 0.25 },
  { nom: 'Étang de Menitz', lat: 49.0770, lon: 16.7110, rx: 650, rz: 260, ang: -0.35 },
];
for (const e of ETANGS) {
  [e.x, e.z] = ll(e.lat, e.lon);
  let s = 0, n = 0; // niveau de la glace : fond de la cuvette
  for (let k = 0; k < 200; k++) { const a = k * 2.4, r = Math.sqrt(k / 200) * 0.6; const p = ell(e, Math.cos(a) * r, Math.sin(a) * r); s += altAt(p[0], p[1]); n++; }
  e.niv = s / n - 0.6;
}
function ell(e, u, v) { const c = Math.cos(e.ang), s = Math.sin(e.ang); return [e.x + u * e.rx * c - v * e.rz * s, e.z + u * e.rx * s + v * e.rz * c]; }
function dansEtang(e, x, z) { const c = Math.cos(e.ang), s = Math.sin(e.ang), dx = x - e.x, dz = z - e.z; return Math.hypot((dx * c + dz * s) / e.rx, (-dx * s + dz * c) / e.rz); }
for (let j = 0; j < HH; j++) for (let i = 0; i < HW; i++) { // on aplanit le relief sous la glace, avec une berge douce
  const x = (i / (HW - 1) - 0.5) * WX, z = (j / (HH - 1) - 0.5) * WZ;
  for (const e of ETANGS) { const d = dansEtang(e, x, z); if (d < 1.25) { const h = hRaw[j * HW + i] / 10, t = Math.min(1, Math.max(0, (1.25 - d) / 0.25)); hRaw[j * HW + i] = Math.round((h + (Math.min(h, e.niv - 0.4) - h) * t) * 10); } }
}

/* ---- nature du sol, pour les mécaniques : une case tous les 10 m ---- */
export const SOLS = ['champ', 'route', 'eau', 'glace', 'village', 'bois'];
const CS = 10, GW = Math.ceil(WX / CS), GH = Math.ceil(WZ / CS), sols = new Uint8Array(GW * GH);
export function solAt(x, z) { const i = Math.floor((x + WX / 2) / CS), j = Math.floor((z + WZ / 2) / CS); return i < 0 || j < 0 || i >= GW || j >= GH ? 'champ' : SOLS[sols[j * GW + i]]; }
function marque(x, z, r, sol) { const k = SOLS.indexOf(sol), i0 = Math.floor((x - r + WX / 2) / CS), i1 = Math.floor((x + r + WX / 2) / CS), j0 = Math.floor((z - r + WZ / 2) / CS), j1 = Math.floor((z + r + WZ / 2) / CS);
  for (let j = Math.max(0, j0); j <= Math.min(GH - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(GW - 1, i1); i++) { const cx = i * CS - WX / 2 + CS / 2, cz = j * CS - WZ / 2 + CS / 2; if (Math.hypot(cx - x, cz - z) <= r + CS * 0.5 && (sols[j * GW + i] === 0 || k === 2 || k === 3)) sols[j * GW + i] = k; } }
for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const x = i * CS - WX / 2, z = j * CS - WZ / 2; if (ETANGS.some(e => dansEtang(e, x, z) < 1)) sols[j * GW + i] = 3; }

/* ---- villages : centre, longueur de la rue principale, nombre de maisons ---- */
const VILLAGES = [
  ['Pratzen', 49.1412, 16.7637, 520, 46, true], ['Kobelnitz', 49.1375, 16.7305, 480, 40, true], ['Puntowitz', 49.1525, 16.7450, 300, 22],
  ['Sokolnitz', 49.1135, 16.7210, 620, 52, true], ['Telnitz', 49.1015, 16.7170, 520, 44, true], ['Aujezd', 49.1040, 16.7570, 480, 40, true],
  ['Satschan', 49.0930, 16.7400, 380, 30, true], ['Blasowitz', 49.1665, 16.7865, 420, 34, true], ['Girschikowitz', 49.1640, 16.7560, 340, 26],
  ['Schlapanitz', 49.1685, 16.7275, 760, 70, true], ['Bellowitz', 49.1755, 16.7400, 300, 20], ['Bosenitz', 49.1915, 16.7715, 460, 38, true],
  ['Holubitz', 49.1760, 16.8090, 420, 34, true], ['Krzenowitz', 49.1405, 16.8280, 560, 50, true], ['Austerlitz', 49.1535, 16.8740, 700, 90, true],
  ['Hostieradek', 49.1170, 16.7850, 400, 32, true], ['Zbeischow', 49.1330, 16.8020, 260, 18],
].map(([nom, lat, lon, long, n, eglise]) => ({ nom, lat, lon, long, n, eglise }));
const HAUTEURS = [['Pratzeberg', 49.1278, 16.7634], ['Santon', 49.1918, 16.7655], ['Žuráň', 49.1795, 16.7345], ['Staré Vinohrady', 49.1555, 16.7930]];

/* ---- routes : la route d'Olmütz et celle d'Austerlitz, puis des chemins de village à village ---- */
const ROUTES = [
  { larg: 9, pts: [[49.1838, 16.700], [49.1866, 16.735], [49.1885, 16.762], [49.1902, 16.785], [49.1950, 16.815], [49.2000, 16.850], [49.2035, 16.885]] }, // Brünn - Olmütz
  { larg: 8, pts: [[49.1866, 16.735], [49.1800, 16.770], [49.1735, 16.805], [49.1640, 16.840], [49.1545, 16.866], [49.1525, 16.885]] },              // vers Austerlitz et la Hongrie
];
const CHEMINS = [['Schlapanitz', 'Puntowitz'], ['Puntowitz', 'Kobelnitz'], ['Kobelnitz', 'Sokolnitz'], ['Sokolnitz', 'Telnitz'], ['Telnitz', 'Satschan'], ['Telnitz', 'Aujezd'],
  ['Pratzen', 'Puntowitz'], ['Pratzen', 'Kobelnitz'], ['Pratzen', 'Aujezd'], ['Pratzen', 'Krzenowitz'], ['Pratzen', 'Hostieradek'], ['Hostieradek', 'Aujezd'], ['Krzenowitz', 'Austerlitz'],
  ['Krzenowitz', 'Zbeischow'], ['Girschikowitz', 'Puntowitz'], ['Girschikowitz', 'Blasowitz'], ['Blasowitz', 'Holubitz'], ['Blasowitz', 'Krzenowitz'], ['Schlapanitz', 'Bellowitz'],
  ['Bellowitz', 'Girschikowitz'], ['Bosenitz', 'Blasowitz'], ['Aujezd', 'Satschan'], ['Sokolnitz', 'Aujezd']];
const FAISANDERIE = { lat: 49.1178, lon: 16.7140, lx: 420, lz: 300, ang: 0.15 }; // parc à gibier clos de murs de Sokolnitz

/* ---- outils ---- */
const rnd = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
function ruban(pts, larg, haut) { // bande drapée sur le relief, pts = [[x, z, largeur relative?], ...]
  const fin = []; for (let k = 0; k < pts.length - 1; k++) { const [x0, z0, w0 = 1] = pts[k], [x1, z1, w1 = 1] = pts[k + 1], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 8)); for (let s = 0; s < n; s++) { const t = s / n; fin.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, w0 + (w1 - w0) * t]); } }
  fin.push(pts[pts.length - 1]);
  const pos = [], idx = [];
  fin.forEach((p, k) => { const a = fin[Math.max(0, k - 1)], b = fin[Math.min(fin.length - 1, k + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, w = larg * (p[2] ?? 1) / 2, nx = -dz / l * w, nz = dx / l * w;
    for (const sg of [-1, 1]) { const x = p[0] + nx * sg, z = p[1] + nz * sg; pos.push(x, Math.max(yAt(x, z), yAt(p[0], p[1])) + haut, z); }
    if (k) idx.push(k * 2 - 2, k * 2 - 1, k * 2, k * 2 - 1, k * 2 + 1, k * 2); });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return { g, fin };
}
const matRuban = (withMist, color) => withMist(new THREE.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
function boite(w, h, d, x, y, z, color) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return teinte(g, color); }
function teinte(g, color) { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
function toit(w, h, d, y, color) { // toit à deux pans, faîte dans la longueur (z)
  const g = new THREE.BufferGeometry(), x = w / 2 + 0.4, z = d / 2 + 0.4;
  const p = [-x, y, -z, 0, y + h, -z, 0, y + h, z, -x, y, -z, 0, y + h, z, -x, y, z, x, y, -z, 0, y + h, z, 0, y + h, -z, x, y, -z, x, y, z, 0, y + h, z, -x, y, -z, x, y, -z, 0, y + h, -z, -x, y, z, 0, y + h, z, x, y, z];
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); return teinte(g, color);
}

/* ---- construction de la scène ---- */
export function construireCarte(scene, withMist) {
  const labels = [];
  function label(txt, x, z, big) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96; const c = cv.getContext('2d');
    c.font = (big ? 'bold ' : '') + '52px Georgia,serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 8; c.strokeStyle = 'rgba(20,24,30,.85)'; c.strokeText(txt, 256, 48); c.fillStyle = big ? '#f5d98a' : '#f4ecd6'; c.fillText(txt, 256, 48);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, fog: false, transparent: true }));
    s.position.set(x, yAt(x, z) + 60, z); s.renderOrder = 5; scene.add(s); labels.push(s);
  }

  /* eau : ruisseaux tirés du relief */
  const eau = [], rives = [];
  for (const r of RUISSEAUX) {
    const pts = []; for (let k = 0; k < r.length; k += 3) if (!ETANGS.some(e => dansEtang(e, r[k], r[k + 1]) < 0.95)) pts.push([r[k], r[k + 1], 0.5 + r[k + 2]]);
    if (pts.length < 2) continue;
    const { g, fin } = ruban(pts, 7, 0.5); eau.push(g); fin.forEach(p => marque(p[0], p[1], 3.5 * p[2], 'eau'));
    fin.forEach((p, k) => { if (rnd(p[0], p[1]) < 0.22 && k) { const q = fin[k - 1], dx = p[0] - q[0], dz = p[1] - q[1], l = Math.hypot(dx, dz) || 1, o = (rnd(p[1], p[0]) < 0.5 ? -1 : 1) * (6 + rnd(k, p[0]) * 9); rives.push([p[0] - dz / l * o, p[1] + dx / l * o, 0.7 + rnd(p[0], k) * 0.5]); } }); // saules et aulnes des rives
  }
  const matEau = withMist(new THREE.MeshLambertMaterial({ color: 0x6f8794, emissive: 0x18222a, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  if (eau.length) scene.add(new THREE.Mesh(mergeGeometries(eau), matEau));

  /* étangs gelés */
  for (const e of ETANGS) label(e.nom, e.x, e.z); // la glace est peinte par le sol

  /* routes et chemins */
  const pos = Object.fromEntries(VILLAGES.map(v => [v.nom, ll(v.lat, v.lon)]));
  const routes = [], chemins = [];
  for (const r of ROUTES) { const { g, fin } = ruban(r.pts.map(([la, lo]) => ll(la, lo)), r.larg, 0.35); routes.push(g); fin.forEach(p => marque(p[0], p[1], r.larg / 2, 'route')); }
  for (const [a, b] of CHEMINS) {
    const [x0, z0] = pos[a], [x1, z1] = pos[b], d = Math.hypot(x1 - x0, z1 - z0), c = (rnd(x0, z1) - 0.5) * 0.25 * d; // léger détour
    const mx = (x0 + x1) / 2 - (z1 - z0) / d * c, mz = (z0 + z1) / 2 + (x1 - x0) / d * c;
    const pts = []; for (let k = 0; k <= 12; k++) { const t = k / 12, u = 1 - t; pts.push([u * u * x0 + 2 * u * t * mx + t * t * x1, u * u * z0 + 2 * u * t * mz + t * t * z1]); }
    const { g, fin } = ruban(pts, 4.5, 0.3); chemins.push(g); fin.forEach(p => marque(p[0], p[1], 2.5, 'route'));
  }
  scene.add(new THREE.Mesh(mergeGeometries(routes), matRuban(withMist, 0x8a7b62)));
  scene.add(new THREE.Mesh(mergeGeometries(chemins), matRuban(withMist, 0x7d6f58)));

  /* villages : maisons blanchies, pignon sur rue, de part et d'autre de la rue principale qui suit la pente douce */
  const W = 0xe6e0d0, gMaison = mergeGeometries([boite(7, 4.2, 13, 0, 2.1, 0, W), toit(7, 4.6, 13, 4.2, 0xffffff)]);
  const nRoof = toit(7, 4.6, 13, 4.2, 0).attributes.position.count, nMur = gMaison.attributes.position.count - nRoof;
  const gEglise = mergeGeometries([boite(10, 8, 22, 0, 4, 0, W), toit(10, 5, 22, 8, 0x6e3b2a), boite(6, 20, 6, 0, 10, -13, W), boite(6.4, 6, 6.4, 0, 22, -13, 0x4e5a52)]);
  const maisons = [], eglises = [], arbres = [];
  for (const v of VILLAGES) {
    const [cx, cz] = ll(v.lat, v.lon); v.x = cx; v.z = cz;
    const gx = altAt(cx + 30, cz) - altAt(cx - 30, cz), gz = altAt(cx, cz + 30) - altAt(cx, cz - 30);
    let ang = Math.hypot(gx, gz) > 0.4 ? Math.atan2(gx, -gz) : rnd(cx, cz) * Math.PI; // rue le long des courbes de niveau
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const rue = []; for (let k = -6; k <= 6; k++) { const t = k / 12 * v.long, cb = Math.sin(k * 0.5 + cx) * v.long * 0.04; rue.push([cx + dx * t - dz * cb, cz + dz * t + dx * cb]); }
    const { g, fin } = ruban(rue, 6, 0.32); scene.add(new THREE.Mesh(g, matRuban(withMist, 0x7d6f58))); fin.forEach(p => marque(p[0], p[1], 3, 'route'));
    let placees = 0;
    for (let k = 0; k < v.n * 2 && placees < v.n; k++) {
      const t = (rnd(k, cx) - 0.5) * v.long, cote = k % 2 ? 1 : -1, rang = rnd(cz, k) < 0.25 && v.n > 30 ? 2 : 1; // quelques maisons en second rang
      const ox = dx * t - dz * cote * (11 + (rang - 1) * 24 + rnd(k, 3) * 3), oz = dz * t + dx * cote * (11 + (rang - 1) * 24 + rnd(k, 3) * 3);
      const x = cx + ox + Math.sin(t / v.long * 3 + cx) * v.long * 0.04 * -dz, z = cz + oz + Math.sin(t / v.long * 3 + cx) * v.long * 0.04 * dx;
      if (solAt(x, z) === 'eau' || solAt(x, z) === 'route' || maisons.some(m => Math.hypot(m.x - x, m.z - z) < 13)) continue;
      maisons.push({ x, z, a: ang + (rnd(x, z) - 0.5) * 0.12, y: Math.min(yAt(x - 4, z - 6), yAt(x + 4, z + 6), yAt(x, z)), c: rnd(z, x) });
      marque(x, z, 9, 'village'); placees++;
      if (rnd(x, k) < 0.45) arbres.push([x - dz * cote * 16 + (rnd(k, 9) - 0.5) * 10, z + dx * cote * 16 + (rnd(9, k) - 0.5) * 10, 0.8]); // vergers derrière les maisons
    }
    if (v.eglise) eglises.push({ x: cx - dz * 22, z: cz + dx * 22, a: ang, y: yAt(cx - dz * 22, cz + dx * 22) });
    label(v.nom, cx, cz);
  }
  for (const [nom, la, lo] of HAUTEURS) { const [x, z] = ll(la, lo); label(nom, x, z, true); }

  const matBati = withMist(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const mM = new THREE.Matrix4(), mQ = new THREE.Quaternion(), mV = new THREE.Vector3(), mS = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  { // toit de chaume ou de tuiles : la couleur d'instance ne teinte que le toit (les murs restent blancs)
    const g = gMaison.clone(), tc = new Float32Array(g.attributes.position.count); for (let i = nMur; i < tc.length; i++) tc[i] = 1;
    g.setAttribute('aToit', new THREE.BufferAttribute(tc, 1));
    const mat = withMist(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    const avant = mat.onBeforeCompile; mat.customProgramCacheKey = () => 'maison';
    mat.onBeforeCompile = sh => { avant(sh); sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\nvColor.rgb = mix(color.rgb, instanceColor.rgb, aToit);\n#endif').replace('#include <common>', '#include <common>\nattribute float aToit;'); };
    const im = new THREE.InstancedMesh(g, mat, maisons.length);
    maisons.forEach((m, i) => { mQ.setFromAxisAngle(Y, -m.a); im.setMatrixAt(i, mM.compose(mV.set(m.x, m.y, m.z), mQ, mS)); im.setColorAt(i, m.c < 0.55 ? col.setHex(0x9a8458).multiplyScalar(0.85 + m.c * 0.3) : col.setHex(0x8e4a34).multiplyScalar(0.8 + m.c * 0.3)); });
    scene.add(im);
  }
  { const im = new THREE.InstancedMesh(gEglise, matBati, eglises.length); eglises.forEach((m, i) => { mQ.setFromAxisAngle(Y, -m.a + Math.PI / 2); im.setMatrixAt(i, mM.compose(mV.set(m.x, m.y, m.z), mQ, mS)); }); scene.add(im); }

  /* faisanderie de Sokolnitz : bois clos d'un mur */
  { const f = FAISANDERIE, [fx, fz] = ll(f.lat, f.lon), c = Math.cos(f.ang), s = Math.sin(f.ang);
    const coin = (u, v) => [fx + u * c - v * s, fz + u * s + v * c];
    for (let k = 0; k < 900; k++) { const u = (rnd(k, 1) - 0.5) * f.lx, v = (rnd(1, k) - 0.5) * f.lz, [x, z] = coin(u, v); if (solAt(x, z) === 'champ') arbres.push([x, z, 1 + rnd(k, 5) * 0.5]); }
    for (let u = -f.lx / 2; u <= f.lx / 2; u += 10) for (let v = -f.lz / 2; v <= f.lz / 2; v += 10) { const [x, z] = coin(u, v); marque(x, z, 6, 'bois'); }
    const mur = [coin(-f.lx / 2, -f.lz / 2), coin(f.lx / 2, -f.lz / 2), coin(f.lx / 2, f.lz / 2), coin(-f.lx / 2, f.lz / 2), coin(-f.lx / 2, -f.lz / 2)], murs = [];
    for (let k = 0; k < 4; k++) { const [x0, z0] = mur[k], [x1, z1] = mur[k + 1], n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 6); for (let t = 0; t < n; t++) { const x = x0 + (x1 - x0) * (t + 0.5) / n, z = z0 + (z1 - z0) * (t + 0.5) / n; murs.push(boite(6.2, 2.4, 0.6, 0, 0, 0, 0xcfc6b2).rotateY(-Math.atan2(z1 - z0, x1 - x0)).translate(x, yAt(x, z) + 1, z)); } }
    scene.add(new THREE.Mesh(mergeGeometries(murs), matBati)); label('Faisanderie', fx, fz); }

  /* arbres d'hiver : tronc et houppier dénudé, répétés par la carte graphique */
  { const g = mergeGeometries([boite(0.6, 5, 0.6, 0, 2.5, 0, 0x4a3b2c), teinte(new THREE.IcosahedronGeometry(4.2, 0).translate(0, 7.5, 0).scale(1, 1.15, 1), 0x5d5446)]);
    for (const a of rives) if (solAt(a[0], a[1]) === 'champ') arbres.push(a);
    const im = new THREE.InstancedMesh(g, matBati, arbres.length);
    arbres.forEach(([x, z, s], i) => { mQ.setFromAxisAngle(Y, rnd(x, z) * 6.28); mS.setScalar(s * (0.8 + rnd(z, x) * 0.5)); im.setMatrixAt(i, mM.compose(mV.set(x, yAt(x, z) - 0.3, z), mQ, mS)); im.setColorAt(i, col.setScalar(0.85 + rnd(x, 2) * 0.3)); });
    mS.setScalar(1); scene.add(im); }

  /* sol, à la manière des jeux de stratégie : une texture de bruit répétée à plusieurs échelles mêle herbe d'hiver,
     chaumes, labours et givre ; les champs ne sont qu'une teinte discrète par-dessus ; le grain accroche la lumière. */
  const g = new THREE.PlaneGeometry(WX, WZ, HW - 1, HH - 1); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, mod = new Float32Array(p.count * 4);
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), z = p.getZ(k), a = altAt(x, z); p.setY(k, (a - H0) * VE);
    const pente = Math.hypot(altAt(x + 25, z) - altAt(x - 25, z), altAt(x, z + 25) - altAt(x, z - 25)) / 50;
    const creux = (altAt(x + 150, z) + altAt(x - 150, z) + altAt(x, z + 150) + altAt(x, z - 150)) / 4 - a; // > 0 : fond de vallon
    mod[k * 4] = Math.min(1, Math.max(0, (pente - 0.07) * 10));                                   // pentes en herbe
    mod[k * 4 + 1] = Math.min(1, Math.max(0, (205 - a) / 14) + Math.max(0, creux - 1.5) / 6);     // fonds humides
    mod[k * 4 + 2] = Math.max(0, Math.min(1, (a - 215) / 100));                                   // givre avec l'altitude
    mod[k * 4 + 3] = Math.max(...ETANGS.map(e => Math.min(1, Math.max(0, (1.02 - dansEtang(e, x, z)) * 12)))); // glace
  }
  g.setAttribute('aMod', new THREE.BufferAttribute(mod, 4)); g.computeVertexNormals();
  const bruit = (() => { // bruit répétable, 4 couches : R nuages, G grain fin, B mottes, A nuages (autre tirage)
    const S = 512, d = new Uint8Array(S * S * 4), h = (x, y, s) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
    const couche = (per, oct, seed, billow) => { const o = new Float32Array(S * S); let amp = 1, tot = 0;
      for (let q = 0; q < oct; q++, per *= 2, amp *= 0.5) { tot += amp; const c = S / per;
        for (let y = 0; y < S; y++) { const fy = y / c, j = Math.floor(fy), b = fy - j, sb = b * b * (3 - 2 * b);
          for (let x = 0; x < S; x++) { const fx = x / c, i = Math.floor(fx), a = fx - i, sa = a * a * (3 - 2 * a), i1 = (i + 1) % per, j1 = (j + 1) % per;
            let v = (h(i, j, seed + q) * (1 - sa) + h(i1, j, seed + q) * sa) * (1 - sb) + (h(i, j1, seed + q) * (1 - sa) + h(i1, j1, seed + q) * sa) * sb;
            if (billow) v = Math.abs(v * 2 - 1); o[y * S + x] += v * amp; } } }
      let mn = 1e9, mx = -1e9; for (let k = 0; k < o.length; k++) { o[k] /= tot; mn = Math.min(mn, o[k]); mx = Math.max(mx, o[k]); }
      for (let k = 0; k < o.length; k++) o[k] = (o[k] - mn) / (mx - mn); return o; };
    [couche(4, 6, 1), couche(32, 4, 20), couche(8, 5, 40, true), couche(4, 6, 60)].forEach((o, c) => { for (let k = 0; k < S * S; k++) d[k * 4 + c] = o[k] * 255; });
    const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true; return t;
  })();
  const mat = withMist(new THREE.MeshLambertMaterial()), avant = mat.onBeforeCompile;
  mat.customProgramCacheKey = () => 'sol';
  mat.onBeforeCompile = sh => {
    avant(sh); sh.uniforms.uBruit = { value: bruit };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aMod; varying vec4 vMod; varying vec2 vXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMod = aMod; vXZ = position.xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec4 vMod; varying vec2 vXZ; uniform sampler2D uBruit; vec3 solBosse;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec4 nz(vec2 p, float s){ return texture2D(uBruit, p / s); }
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }`)
      .replace('#include <color_fragment>', `
{ vec2 p = vXZ, pa = mat2(0.8, 0.6, -0.6, 0.8) * p, pb = mat2(0.36, -0.93, 0.93, 0.36) * p; // échelles tournées l'une par rapport à l'autre : pas de motif qui se répète
  vec4 M = nz(p, 3100.0), K = nz(pa + 371.0, 730.0), K2 = nz(pb, 1670.0), D = nz(pb + 53.0, 97.0), F = nz(pa, 17.0), G = nz(p + 7.0, 4.3);
  float loin = smoothstep(0.02, 0.5, fwidth(p.x));                      // 0 de près, 1 de loin
  /* parcellaire : quartiers irréguliers, lanières à peu près parallèles dans un quartier, bords tremblés */
  vec2 w = p + (K.ra - 0.5) * 90.0 + (M.ar - 0.5) * 420.0 + (D.ra - 0.5) * 9.0;
  vec2 bc = floor(w / 950.0), blk = bc; float bd = 1e9;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) { vec2 c = bc + vec2(i, j), o = (c + 0.15 + 0.7 * vec2(h21(c), h21(c + 5.7))) * 950.0; float dd = dot(w - o, w - o); if (dd < bd) { bd = dd; blk = c; } }
  float an = 0.45 + floor(h21(blk) * 2.0) * 1.5708 + (h21(blk + 9.0) - 0.5) * 0.5, ca = cos(an), sa = sin(an);
  vec2 q = vec2(ca * w.x + sa * w.y, -sa * w.x + ca * w.y);
  float sw = 55.0 + h21(blk + 3.1) * 90.0, sid = floor(q.x / sw), sl = 320.0 + h21(vec2(sid, blk.x)) * 520.0, qy = q.y + h21(vec2(blk.y, sid)) * sl;
  float seg = floor(qy / sl), r = h21(vec2(sid, seg) + blk * 17.0), r2 = h21(vec2(seg, sid) + blk * 5.0);
  vec2 m = (0.5 - abs(fract(vec2(q.x / sw, qy / sl)) - 0.5)) * vec2(sw, sl); float bord = 1.0 - smoothstep(0.5, 3.5 + fwidth(q.x) * 1.5, min(m.x, m.y));
  vec3 herbe = lin(vec3(0.40, 0.43, 0.27)), seche = lin(vec3(0.56, 0.52, 0.34)), chaume = lin(vec3(0.63, 0.57, 0.37)), labour = lin(vec3(0.33, 0.27, 0.20)), terre = lin(vec3(0.42, 0.35, 0.26));
  /* fond naturel : herbe d'hiver plus ou moins sèche, par grandes nappes */
  vec3 fond = mix(herbe, seche, smoothstep(0.25, 0.75, M.r * 0.4 + K2.r * 0.35 + K.a * 0.25));
  float estLabour = step(r, 0.24), estChaume = step(0.24, r) * step(r, 0.52);
  vec3 champ = estLabour > 0.5 ? mix(labour, terre, r2 * 0.6) : estChaume > 0.5 ? mix(chaume, seche, r2 * 0.7) : mix(herbe, seche, r2);
  champ *= 0.9 + 0.2 * h21(vec2(sid, seg) + 1.7);
  /* sillons et rangs de chaume, visibles de près seulement */
  float qs = (ca * p.x + sa * p.y) * (estLabour > 0.5 ? 2.6 : 5.2) + K.r * 5.0, rang = sin(qs), pres = 1.0 - smoothstep(0.15, 0.7, fwidth(p.x)); // sillons droits : coordonnée non tremblée
  champ *= 1.0 + (estLabour * 0.22 + estChaume * 0.10) * rang * pres;
  vec3 c = mix(fond, champ, 0.82 * (1.0 - 0.5 * smoothstep(0.55, 0.8, K2.b)));     // par endroits les champs s'effacent dans la friche
  c = mix(c, herbe * 0.8, bord * 0.55);                                           // lisières herbeuses entre parcelles
  /* matière : touffes, terre nue, mottes */
  float grain = D.g * 0.45 + F.g * 0.35 + G.g * 0.2;
  c = mix(c, terre, (1.0 - estLabour) * smoothstep(0.55, 0.85, F.b * 0.6 + D.b * 0.4) * 0.35);
  c = mix(c, herbe * 0.7, (1.0 - estLabour) * smoothstep(0.6, 0.9, G.g) * 0.35 * (1.0 - loin));
  c *= 0.84 + 0.4 * grain; c *= 0.9 + 0.2 * K.b;
  /* pentes en herbe rase, fonds humides sombres et roussis */
  c = mix(c, mix(herbe, seche, D.r) * (0.75 + 0.5 * grain), vMod.x * 0.85);
  vec3 humide = mix(lin(vec3(0.27, 0.31, 0.21)), lin(vec3(0.45, 0.38, 0.24)), smoothstep(0.4, 0.7, D.a)) * (0.7 + 0.6 * grain);
  c = mix(c, humide, clamp(vMod.y * (0.6 + 0.8 * K.a), 0.0, 1.0) * 0.9);
  /* givre : par plaques, plus sur les hauteurs, dans les creux des sillons et à l'ombre */
  float gv = vMod.z * 0.55 + (K2.a - 0.5) * 0.5 + (M.a - 0.5) * 0.4 + (nz(pa + 91.0, 1230.0).r - 0.5) * 0.3 + ((D.r - 0.5) * 0.3 + (F.g - 0.5) * 0.25) * (1.0 - loin) - estLabour * rang * pres * 0.12 + 0.1;
  vec3 givre = lin(vec3(0.90, 0.93, 0.94)) * (0.88 + 0.2 * G.g);
  c = mix(c, givre, smoothstep(0.42, 0.85, gv) * 0.7 + 0.05);
  vec3 glace = lin(vec3(0.72, 0.79, 0.83)) * (0.88 + 0.16 * K.r) - 0.06 * smoothstep(0.80, 0.86, D.b) + 0.10 * smoothstep(0.6, 0.9, F.g * K.a * 1.6);
  c = mix(c, glace, smoothstep(0.0, 1.0, vMod.w));
  diffuseColor.rgb = c;
  /* relief du grain sous la lumière rasante */
  float e1 = 0.5, e2 = 0.12;
  float hx = nz(pa + vec2(e1, 0.0), 17.0).g - nz(pa - vec2(e1, 0.0), 17.0).g + 0.6 * (nz(p + vec2(e2, 0.0) + 7.0, 4.3).g - nz(p - vec2(e2, 0.0) + 7.0, 4.3).g);
  float hz = nz(pa + vec2(0.0, e1), 17.0).g - nz(pa - vec2(0.0, e1), 17.0).g + 0.6 * (nz(p + vec2(0.0, e2) + 7.0, 4.3).g - nz(p - vec2(0.0, e2) + 7.0, 4.3).g);
  float cr = cos(qs) * (estLabour * 0.5 + estChaume * 0.15) * pres;
  solBosse = (vec3(-hx, 0.0, -hz) * 0.55 + vec3(-ca, 0.0, -sa) * cr) * (1.0 - vMod.w); }`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal + (viewMatrix * vec4(solBosse, 0.0)).xyz);');
  };
  const ground = new THREE.Mesh(g, mat); scene.add(ground);
  return { ground, labels };
}
