/* ===== CARTE : relief réel, eau, routes, villages, bois =====
   Le relief et les ruisseaux viennent de outils/relief.py (src/heights.js).
   Positions de villages, routes et faisanderie : placées à la main, à vérifier sur sources. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HW, HH, H64, CADRE, RUISSEAUX } from './heights.js';
import MAISON from './modeles/maison.js';
import { objet } from './unites.js';
import { VILLAGES, RUES } from './villages.js';

export const TILE = CADRE.tuile, WX = (CADRE.x1 - CADRE.x0) * TILE, WZ = (CADRE.y1 - CADRE.y0) * TILE, VE = 1, H0 = 180; // VE : grossissement du relief à l'affichage (1 = taille réelle)
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
  { nom: 'Étang de Satschan', lat: 49.0965, lon: 16.7385, rx: 1250, rz: 420, ang: 0.1 },
  { nom: 'Étang de Menitz', lat: 49.0800, lon: 16.7120, rx: 600, rz: 300, ang: -0.2 },
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

const distSeg = (x, z, s) => { const dx = s[2] - s[0], dz = s[3] - s[1], t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - s[0] - dx * t, z - s[1] - dz * t); };
const HAUTEURS = [['Pratzeberg', 49.1278, 16.7634], ['Santon', 49.1918, 16.7655], ['Žuráň', 49.1795, 16.7345], ['Staré Vinohrady', 49.1555, 16.7930]];

/* ---- routes : la route d'Olmütz et celle d'Austerlitz, puis des chemins de village à village ---- */
const ROUTES = [
  { larg: 9, pts: [[49.1838, 16.700], [49.1866, 16.735], [49.1885, 16.762], [49.1902, 16.785], [49.1950, 16.815], [49.2000, 16.850], [49.2035, 16.885]] }, // Brünn - Olmütz
  { larg: 8, pts: [[49.1866, 16.735], [49.1800, 16.770], [49.1735, 16.805], [49.1640, 16.840], [49.1545, 16.866], [49.1525, 16.885]] },              // vers Austerlitz et la Hongrie
];
const CHEMINS = [['Schlapanitz', 'Puntowitz'], ['Puntowitz', 'Kobelnitz'], ['Kobelnitz', 'Sokolnitz'], ['Sokolnitz', 'Telnitz'], ['Telnitz', 'Aujezd'],
  ['Pratzen', 'Puntowitz'], ['Pratzen', 'Kobelnitz'], ['Pratzen', 'Aujezd'], ['Pratzen', 'Krzenowitz'], ['Pratzen', 'Hostieradek'], ['Hostieradek', 'Aujezd'], ['Krzenowitz', 'Austerlitz'],
  ['Krzenowitz', 'Zbeischow'], ['Girschikowitz', 'Puntowitz'], ['Girschikowitz', 'Blasowitz'], ['Blasowitz', 'Holubitz'], ['Blasowitz', 'Krzenowitz'], ['Schlapanitz', 'Bellowitz'],
  ['Bellowitz', 'Girschikowitz'], ['Bosenitz', 'Blasowitz'], ['Sokolnitz', 'Aujezd'], ['Kritschen', 'Bellowitz'], ['Kritschen', 'Welatitz'], ['Welatitz', 'Bosenitz'],
  ['Bosenitz', 'Siwitz'], ['Siwitz', 'Kowalowitz'], ['Kowalowitz', 'Holubitz'], ['Holubitz', 'Welleschowitz'], ['Welleschowitz', 'Austerlitz'], ['Krzenowitz', 'Birnbaum'], ['Birnbaum', 'Wazan'],
  ['Wazan', 'Austerlitz'], ['Zbeischow', 'Birnbaum'], ['Zbeischow', 'Scharatitz'], ['Scharatitz', 'Hostieradek'], ['Scharatitz', 'Ottnitz'], ['Ottnitz', 'Milleschowitz']];
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

/* ---- bâtiments et îlots : ce que les mécaniques de village (src/villages-combat.js) lisent et abîment ----
   Un bâtiment : boîte au sol (demi-largeur hw sur son axe x, demi-longueur hd sur z, tournée de rot), hauteur de la sablière (hToit) et du faîte (haut),
   porte (px, pz). Son état est envoyé à la carte graphique par majBati : trous dans le toit (0 à 1, puis les murs s'écrêtent jusqu'à 1,5),
   braise (rougeoiement) et suie (noircissement). */
function bati(type, m, rot, hw, hd, hToit, haut, porte) { return { type, x: m.x, z: m.z, y: m.y, rot, cs: Math.cos(rot), sn: Math.sin(rot), hw, hd, hToit, haut, px: porte[0], pz: porte[1], trous: 0, braise: 0, suie: 0, feu: 0, t: 0, refs: [] }; }
function ilot(nom, village, type, bats) { return cerne({ nom, village, type, bats, occ: null, x: 0, z: 0, r: 0 }); }
function cerne(il) { const n = il.bats.length; il.x = il.bats.reduce((a, b) => a + b.x, 0) / n; il.z = il.bats.reduce((a, b) => a + b.z, 0) / n; il.r = Math.max(...il.bats.map(b => Math.hypot(b.x - il.x, b.z - il.z) + Math.max(b.hw, b.hd))) + 3; return il; }
export const horlogeBati = { value: 0 }; // secondes, pour le vacillement des braises
export function majBati(b) { for (const [att, i] of b.refs) { att.setXYZW(i, b.trous, b.braise, b.suie, b.hToit); att.needsUpdate = true; } }
const etatBati = (liste, n) => { const att = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); att.setUsage(THREE.DynamicDrawUsage); liste.forEach((b, i) => { if (b) { b.refs.push([att, i]); att.setXYZW(i, 0, 0, 0, b.hToit); } }); return att; };
function avecDegats(mat) { // toit qui se troue par plaques, bords des trous qui rougeoient, murs noircis puis écrêtés
  const avant = mat.onBeforeCompile; mat.side = THREE.DoubleSide; mat.customProgramCacheKey = () => 'bati';
  mat.onBeforeCompile = sh => { avant(sh); sh.uniforms.uTemps = horlogeBati;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aEtat; varying vec4 vEtat; varying vec3 vLoc;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEtat = aEtat; vLoc = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec4 vEtat; varying vec3 vLoc; uniform float uTemps; float braiseB;
float hB(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float nB(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hB(i), hB(i + vec3(1,0,0)), f.x), mix(hB(i + vec3(0,1,0)), hB(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hB(i + vec3(0,0,1)), hB(i + vec3(1,0,1)), f.x), mix(hB(i + vec3(0,1,1)), hB(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
braiseB = 0.0;
if (vEtat.x + vEtat.y + vEtat.z > 0.0) {
  float n = nB(vLoc * 0.42 + 3.7) * 0.65 + nB(vLoc * 1.7) * 0.35, toitB = vEtat.w - max(0.0, vEtat.x - 1.0) * 5.0 * nB(vLoc * vec3(0.9, 0.0, 0.9) + 9.1); // au-delà de 1, les murs s'écrêtent
  float bordB = vEtat.x * 1.25 - 0.12 - n;                                    // > 0 : la plaque de toit est partie
  if (vLoc.y > toitB && bordB > 0.0) discard;
  float flam = 0.55 + 0.45 * sin(uTemps * 7.0 + n * 40.0) * sin(uTemps * 3.1 + vLoc.x * 2.0 + vLoc.z);
  braiseB = vEtat.y * (vLoc.y > toitB ? smoothstep(-0.1, 0.0, bordB) : smoothstep(0.62, 0.85, nB(vLoc * 2.3 + 1.0)) * 0.3) * flam;
  diffuseColor.rgb *= mix(1.0, 0.1 + 0.25 * n, clamp(vEtat.z * (0.6 + 0.8 * nB(vLoc * 0.8)) + smoothstep(-0.5, 0.0, bordB) * step(0.01, vEtat.x) * 0.7 * step(toitB, vLoc.y), 0.0, 1.0));
}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.33, 0.04) * braiseB * 1.6;');
  };
  return mat;
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
  const horsCarte = (x, z) => Math.abs(x) > WX / 2 - 30 || Math.abs(z) > WZ / 2 - 30;
  const parNom = {};
  for (const v of VILLAGES) { // vraies rues : mètres depuis le centre (x est, y nord) -> carte, coupées au bord
    [v.x, v.z] = ll(v.lat, v.lon); parNom[v.nom] = v; v.rues = [];
    for (const r of (RUES[v.actuel] || '').split(';')) { let cour = [];
      for (const p of r.trim().split(/\s+/)) { const [x, y] = p.split(',').map(Number), q = [v.x + x, v.z - y]; if (horsCarte(q[0], q[1])) { if (cour.length > 1) v.rues.push(cour); cour = []; } else cour.push(q); }
      if (cour.length > 1) v.rues.push(cour); }
  }
  const grilleRoutes = new Map(), cle = (x, z) => Math.floor(x / 20) + ',' + Math.floor(z / 20); // où passent routes et chemins, pour ne pas bâtir dessus
  const noteRoute = p => { const k = cle(p[0], p[1]); if (!grilleRoutes.has(k)) grilleRoutes.set(k, []); grilleRoutes.get(k).push(p); };
  const presRoute = (x, z, d) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const p of grilleRoutes.get(cle(x + i * 20, z + j * 20)) || []) if (Math.hypot(p[0] - x, p[1] - z) < d) return true; return false; };
  const sortie = (a, b) => { let m = [a.x, a.z], dm = 1e9; for (const r of a.rues) for (const p of r) { const d = Math.hypot(p[0] - b.x, p[1] - b.z); if (d < dm) { dm = d; m = p; } } return m; }; // le bout de rue qui regarde le village voisin
  const routes = [], chemins = [];
  for (const r of ROUTES) { const { g, fin } = ruban(r.pts.map(([la, lo]) => ll(la, lo)), r.larg, 0.35); routes.push(g); fin.forEach(p => { marque(p[0], p[1], r.larg / 2, 'route'); noteRoute(p); }); }
  for (const [a, b] of CHEMINS) {
    const [x0, z0] = sortie(parNom[a], parNom[b]), [x1, z1] = sortie(parNom[b], parNom[a]), d = Math.hypot(x1 - x0, z1 - z0) || 1, c = (rnd(x0, z1) - 0.5) * 0.2 * d; // léger détour
    const mx = (x0 + x1) / 2 - (z1 - z0) / d * c, mz = (z0 + z1) / 2 + (x1 - x0) / d * c;
    const pts = []; for (let k = 0; k <= 12; k++) { const t = k / 12, u = 1 - t; pts.push([u * u * x0 + 2 * u * t * mx + t * t * x1, u * u * z0 + 2 * u * t * mz + t * t * z1]); }
    const { g, fin } = ruban(pts, 4.5, 0.3); chemins.push(g); fin.forEach(p => { marque(p[0], p[1], 2.5, 'route'); noteRoute(p); });
  }
  scene.add(new THREE.Mesh(mergeGeometries(routes), matRuban(withMist, 0x8a7b62)));
  scene.add(new THREE.Mesh(mergeGeometries(chemins), matRuban(withMist, 0x7d6f58)));

  /* villages à l'échelle 1/1, sur leur vrai plan : les maisons s'alignent le long des vraies rues (src/villages.js), le mur long sur la rue comme en Moravie,
     en partant du centre jusqu'au nombre de maisons de 1805. Grange au fond de la cour, verger derrière ; église et château à leur vraie place. */
  const W = 0xe6e0d0;
  const gEglise = mergeGeometries([boite(10, 8, 22, 0, 4, 0, W), toit(10, 5, 22, 8, 0x6e3b2a), boite(6, 20, 6, 0, 10, -13, W), boite(6.4, 6, 6.4, 0, 22, -13, 0x4e5a52)]);
  const gGrange = mergeGeometries([boite(7.5, 3.6, 12, 0, 1.8, 0, 0x7a6248), toit(7.5, 4.4, 12, 3.6, 0x8d7a52)]);
  const gChateau = mergeGeometries([boite(46, 11, 14, 0, 5.5, 0, 0xe9e2cf), toit(14, 6, 46, 11, 0x7a3f2c).rotateY(Math.PI / 2), boite(12, 14, 16, -19, 7, 0, 0xe9e2cf), boite(12, 14, 16, 19, 7, 0, 0xe9e2cf)]);
  const maisons = [], granges = [], eglises = [], chateaux = [], arbres = [], lots = [], gRues = [], ilots = [];
  VILLAGES.forEach(v => {
    const cx = v.x, cz = v.z, segs = [], cands = [], ms = [], gs = [], clos = [];
    for (const r of v.rues) {
      const { g, fin } = ruban(r, 7, 0.32); gRues.push(g); fin.forEach(p => marque(p[0], p[1], 3.5, 'route'));
      for (let k = 0; k < r.length - 1; k++) segs.push([r[k][0], r[k][1], r[k + 1][0], r[k + 1][1]]);
    }
    const rue = (x, z) => { let d = 1e9; for (const s of segs) d = Math.min(d, distSeg(x, z, s)); return d; };
    if (v.eglise) { const [x, z] = ll(...v.eglise); if (!horsCarte(x, z)) { eglises.push({ x, z, a: 0, y: yAt(x, z), v }); clos.push([x, z, 24]); marque(x, z, 14, 'village'); } } // chœur à l'est, clocher à l'ouest
    if (v.chateau) { const [x, z] = ll(...v.chateau); chateaux.push({ x, z, a: 0, y: Math.min(yAt(x, z), yAt(x + 20, z), yAt(x - 20, z)), v }); clos.push([x, z, 48]); marque(x, z, 26, 'village'); label('Château', x, z); }
    v.rues.forEach((r, ri) => { // une place de maison tous les 15 m, des deux côtés de chaque rue
      let fait = 0, suiv = 7.5;
      for (let k = 0; k < r.length - 1; k++) {
        const dx = r[k + 1][0] - r[k][0], dz = r[k + 1][1] - r[k][1], l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
        for (; suiv <= fait + l; suiv += 14.6 + rnd(suiv, ri + cx) * 1.6) for (const cote of [-1, 1]) {
          const t = suiv - fait, px = r[k][0] + ux * t, pz = r[k][1] + uz * t, pignon = rnd(px * cote, pz) < 0.14, rec = pignon ? 11.5 + rnd(pz, px * cote) * 1.5 : 8.6 + rnd(pz, px * cote) * 2;
          const x = px - uz * cote * rec, z = pz + ux * cote * rec;
          if (rue(x, z) > rec - 0.5) cands.push({ x, z, nx: -uz * cote, nz: ux * cote, ux, uz, pg: pignon, a: Math.atan2(uz, ux) + (pignon ? 0 : -Math.PI / 2) + (rnd(x, z) - 0.5) * 0.06, d: Math.hypot(x - cx, z - cz) });
        }
        fait += l;
      }
    });
    cands.sort((p, q) => p.d - q.d);
    for (const m of cands) { if (ms.length >= v.n) break;
      const { x, z } = m, sol = solAt(x, z);
      if (sol === 'eau' || sol === 'glace' || horsCarte(x, z) || presRoute(x, z, 9) || clos.some(c => Math.hypot(c[0] - x, c[1] - z) < c[2]) || ms.some(o => Math.hypot(o.x - x, o.z - z) < 13.8)) continue;
      m.y = Math.min(yAt(x - 4, z - 6), yAt(x + 4, z + 6), yAt(x, z)); m.c = rnd(z, x); ms.push(m);
    }
    for (const m of ms) marque(m.x, m.z, 9, 'village');
    ms.forEach((m, i) => { // granges en travers au fond des cours, vergers derrière
      if (rnd(m.x, i) < 0.6) { const k = 21 + rnd(i, 7) * 5, o = (rnd(7, i) - 0.5) * 5, x = m.x + m.nx * k + m.ux * o, z = m.z + m.nz * k + m.uz * o;
        if (solAt(x, z) === 'champ' && rue(x, z) > 11 && !presRoute(x, z, 9) && !clos.some(c => Math.hypot(c[0] - x, c[1] - z) < c[2]) && !ms.some(q => Math.hypot(q.x - x, q.z - z) < 12) && !gs.some(q => Math.hypot(q.x - x, q.z - z) < 13)) gs.push({ x, z, m, a: Math.atan2(m.uz, m.ux) - Math.PI / 2 + (rnd(x, z) - 0.5) * 0.15, y: Math.min(yAt(x - 5, z - 5), yAt(x + 5, z + 5), yAt(x, z)) }); }
      for (let q = 0; q < 2; q++) if (rnd(m.x + q, i + 3) < 0.45) { const k = 36 + rnd(i, 9 + q) * 22, o = (rnd(9 + q, i) - 0.5) * 12, x = m.x + m.nx * k + m.ux * o, z = m.z + m.nz * k + m.uz * o; if (solAt(x, z) === 'champ' && rue(x, z) > 8) arbres.push([x, z, 0.8]); }
    });
    for (const g of gs) { marque(g.x, g.z, 8, 'village'); granges.push(g); }
    { /* îlots : une poignée de maisons voisines (et leurs granges) qu'une unité peut occuper, attaquer ou incendier */
      const libres = new Set(ms); let no = 0;
      for (const g0 of ms) { if (!libres.has(g0)) continue;
        const pres = [...libres].map(m => [Math.hypot(m.x - g0.x, m.z - g0.z), m]).filter(q => q[0] < 40).sort((p, q) => p[0] - q[0]).slice(0, 8).map(q => q[1]);
        const bats = pres.map(m => { libres.delete(m); return (m.b = bati('maison', m, -m.a, 3.47, 6.5, 3.5, 8.3, [m.x - m.nx * (m.pg ? 6.9 : 3.9), m.z - m.nz * (m.pg ? 6.9 : 3.9)])); });
        ilots.push(ilot(`${v.nom}, îlot ${++no}`, v.nom, 'maisons', bats)); pres.forEach(m => m.il = ilots[ilots.length - 1]); }
      for (const g of gs) { const il = g.m.il; g.b = bati('grange', g, -g.a, 3.75, 6, 3.6, 8, [g.x + Math.cos(g.a) * 4.2, g.z + Math.sin(g.a) * 4.2]); il.bats.push(g.b); }
      for (const il of ilots) if (il.village === v.nom) cerne(il);
    }
    ms.sort((p, q) => (Math.floor(p.x / 160) - Math.floor(q.x / 160)) || (p.z - q.z)); // paquets de maisons voisines, pour le détail de près
    for (let i = 0; i < ms.length; i += 40) lots.push({ ms: ms.slice(i, i + 40) });
    maisons.push(...ms); v.maisons = ms.length;
    label(v.nom, cx, cz);
  });
  if (gRues.length) scene.add(new THREE.Mesh(mergeGeometries(gRues), matRuban(withMist, 0x7d6f58)));
  for (const [nom, la, lo] of HAUTEURS) { const [x, z] = ll(la, lo); label(nom, x, z, true); }

  for (const e of eglises) { e.b = bati('eglise', e, Math.PI / 2, 5, 11, 8, 13, [e.x - 17.5, e.z]); ilots.push(ilot(`Église de ${e.v.nom}`, e.v.nom, 'eglise', [e.b])); }
  for (const c of chateaux) { c.b = bati('chateau', c, 0, 23, 8, 11, 17, [c.x, c.z + 9]); ilots.push(ilot(`Château de ${c.v.nom}`, c.v.nom, 'chateau', [c.b])); }
  const matBati = withMist(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const matBatiD = avecDegats(withMist(new THREE.MeshLambertMaterial({ vertexColors: true })));
  const partage = g => { const c = new THREE.BufferGeometry(); for (const k in g.attributes) c.setAttribute(k, g.attributes[k]); c.setIndex(g.index); return c; }; // même maillage, état propre à chaque paquet
  const mM = new THREE.Matrix4(), mQ = new THREE.Quaternion(), mV = new THREE.Vector3(), mS = new THREE.Vector3(1, 1, 1), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  const prochesMaj = []; // maisons : le modèle détaillé près de la caméra, la version à 18 triangles au loin, par paquets de 40 maisons voisines
  { const M = objet(MAISON, withMist); avecDegats(M.mat);
    for (const { ms } of lots) { const etat = etatBati(ms.map(m => m.b), ms.length);
      const paire = [M.loin, M.pres].map(g => { g = partage(g); g.setAttribute('aEtat', etat); const im = new THREE.InstancedMesh(g, M.mat, ms.length);
        ms.forEach((m, i) => { mQ.setFromAxisAngle(Y, -m.a); im.setMatrixAt(i, mM.compose(mV.set(m.x, m.y, m.z), mQ, mS)); im.setColorAt(i, col.setScalar(0.82 + m.c * 0.3)); });
        im.computeBoundingSphere(); scene.add(im); return im; });
      const s = paire[0].boundingSphere; paire[1].visible = false; prochesMaj.push({ x: s.center.x, z: s.center.z, y: s.center.y, r: 220 + s.radius, loin: paire[0], pres: paire[1] });
    }
  }
  for (const [g, liste, tour] of [[gEglise, eglises, Math.PI / 2], [gGrange, granges, 0], [gChateau, chateaux, 0]]) { if (!liste.length) continue;
    g.setAttribute('aEtat', etatBati(liste.map(m => m.b), liste.length));
    const im = new THREE.InstancedMesh(g, matBatiD, liste.length); liste.forEach((m, i) => { mQ.setFromAxisAngle(Y, -m.a + tour); im.setMatrixAt(i, mM.compose(mV.set(m.x, m.y, m.z), mQ, mS)); im.setColorAt(i, col.setScalar(0.85 + rnd(m.x, m.z) * 0.25)); }); scene.add(im); }

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
  ground.onBeforeRender = (_r, _s, cam) => { for (const v of prochesMaj) { const p = Math.hypot(cam.position.x - v.x, cam.position.y - v.y, cam.position.z - v.z) < v.r; v.pres.visible = p; v.loin.visible = !p; } };
  return { ground, labels, ilots };
}
