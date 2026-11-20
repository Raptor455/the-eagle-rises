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
  const eau = [];
  for (const r of RUISSEAUX) {
    const pts = []; for (let k = 0; k < r.length; k += 3) if (!ETANGS.some(e => dansEtang(e, r[k], r[k + 1]) < 0.95)) pts.push([r[k], r[k + 1], 0.5 + r[k + 2]]);
    if (pts.length < 2) continue;
    const { g, fin } = ruban(pts, 7, 0.5); eau.push(g); fin.forEach(p => marque(p[0], p[1], 3.5 * p[2], 'eau'));
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
    const im = new THREE.InstancedMesh(g, matBati, arbres.length);
    arbres.forEach(([x, z, s], i) => { mQ.setFromAxisAngle(Y, rnd(x, z) * 6.28); mS.setScalar(s * (0.8 + rnd(z, x) * 0.5)); im.setMatrixAt(i, mM.compose(mV.set(x, yAt(x, z) - 0.3, z), mQ, mS)); im.setColorAt(i, col.setScalar(0.85 + rnd(x, 2) * 0.3)); });
    mS.setScalar(1); scene.add(im); }

  /* sol : parcelles en lanières (champs moraves), labours, chaumes, prés, givre sur les hauteurs. Tout est calculé au pixel. */
  const g = new THREE.PlaneGeometry(WX, WZ, HW - 1, HH - 1); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, mod = new Float32Array(p.count * 4);
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), z = p.getZ(k), a = altAt(x, z); p.setY(k, (a - H0) * VE);
    const pente = Math.hypot(altAt(x + 25, z) - altAt(x - 25, z), altAt(x, z + 25) - altAt(x, z - 25)) / 50;
    mod[k * 4] = Math.min(1, Math.max(0, (pente - 0.09) * 9));            // pentes en prairie
    mod[k * 4 + 1] = Math.min(1, Math.max(0, (205 - a) / 12));            // fonds humides
    mod[k * 4 + 2] = Math.max(0, Math.min(0.55, (a - 235) / 110)) + 0.08; // givre
    mod[k * 4 + 3] = Math.max(...ETANGS.map(e => Math.min(1, Math.max(0, (1.02 - dansEtang(e, x, z)) * 12)))); // glace
  }
  g.setAttribute('aMod', new THREE.BufferAttribute(mod, 4)); g.computeVertexNormals();
  const mat = withMist(new THREE.MeshLambertMaterial()), avant = mat.onBeforeCompile;
  mat.customProgramCacheKey = () => 'sol';
  mat.onBeforeCompile = sh => {
    avant(sh);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aMod; varying vec4 vMod; varying vec2 vXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMod = aMod; vXZ = position.xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec4 vMod; varying vec2 vXZ;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }`)
      .replace('#include <color_fragment>', `
{ vec2 p = vXZ, w = p + 160.0 * vec2(vn(p / 1100.0), vn(p / 1100.0 + 7.3)) - 80.0;
  vec2 bc = floor(w / 750.0), blk = bc; float bd = 1e9;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) { vec2 c = bc + vec2(i, j), o = (c + 0.15 + 0.7 * vec2(h21(c), h21(c + 5.7))) * 750.0; float dd = dot(w - o, w - o); if (dd < bd) { bd = dd; blk = c; } } float an = h21(blk) * 3.1416, ca = cos(an), sa = sin(an);
  vec2 q = vec2(ca * w.x + sa * w.y, -sa * w.x + ca * w.y);
  float sw = 30.0 + h21(blk + 3.1) * 45.0, sid = floor(q.x / sw), sl = 260.0 + h21(vec2(sid, blk.x)) * 380.0;
  float seg = floor((q.y + h21(vec2(blk.y, sid)) * sl) / sl), r = h21(vec2(sid, seg) + blk * 17.0);
  vec3 labour = lin(vec3(0.47, 0.40, 0.31)), chaume = lin(vec3(0.62, 0.57, 0.42)), pre = lin(vec3(0.44, 0.49, 0.34)), friche = lin(vec3(0.53, 0.52, 0.40));
  vec3 c = r < 0.38 ? labour : r < 0.66 ? chaume : r < 0.88 ? pre : friche;
  float d = fwidth(q.x);
  if (r < 0.38) c *= 0.88 + 0.16 * smoothstep(-0.3, 0.3, sin(q.x * 2.4)) * (1.0 - smoothstep(0.4, 1.2, d)); // sillons, effacés au loin
  if (r >= 0.38 && r < 0.66) c *= 0.93 + 0.1 * smoothstep(-0.5, 0.5, sin(q.x * 4.0 + vn(p * 0.3) * 3.0)) * (1.0 - smoothstep(0.2, 0.8, d));
  vec2 m = abs(fract(vec2(q.x / sw, (q.y + h21(vec2(blk.y, sid)) * sl) / sl)) - 0.5) * vec2(sw, sl);
  float bord = 1.0 - smoothstep(0.0, 1.6 + d, min(sw * 0.5 - m.x, sl * 0.5 - m.y));
  c = mix(c, pre * 0.85, bord * 0.7);                                       // talus herbeux entre parcelles
  c *= 0.86 + 0.28 * vn(p / 9.0) * vn(p / 37.0 + 3.0) + 0.06 * vn(p / 2.3);   // mottes, taches
  vec3 humide = lin(vec3(0.35, 0.40, 0.31)), givre = lin(vec3(0.87, 0.90, 0.89));
  c = mix(c, pre, vMod.x * 0.8); c = mix(c, humide, vMod.y * 0.85);
  c = mix(c, givre, clamp(vMod.z + 0.12 * (vn(p / 14.0) - 0.5), 0.0, 1.0));
  vec3 glace = lin(vec3(0.74, 0.80, 0.83)) * (0.9 + 0.12 * vn(p / 30.0)) - 0.05 * smoothstep(0.92, 1.0, vn(p / 6.0 + vn(p / 40.0) * 4.0));
  c = mix(c, glace, smoothstep(0.0, 1.0, vMod.w));
  diffuseColor.rgb = c; }`);
  };
  const ground = new THREE.Mesh(g, mat); scene.add(ground);
  return { ground, labels };
}
