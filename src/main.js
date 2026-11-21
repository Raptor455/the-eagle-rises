import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WX, WZ, VE, H0, ll, altAt, yAt, solAt, construireCarte } from './carte.js';
import FR from './modeles/fr.js';
import RU from './modeles/ru.js';
import AU from './modeles/au.js';
import CANON from './modeles/canon.js';
import { animerShader, soldat, objet } from './unites.js';

/* ===== SCÈNE ===== */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const SKY = new THREE.Color(0xc9d6e2);
scene.background = SKY; scene.fog = new THREE.FogExp2(SKY, 0.00009);
const camera = new THREE.PerspectiveCamera(45, 1, 2, 40000);
scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x6b6250, 1.15));
const sun = new THREE.DirectionalLight(0xffe2b0, 2.1); sun.position.set(0.75, 0.42, 0.5); scene.add(sun); // soleil bas du matin, à l'est-sud-est

/* brume de fond de vallée : même réglage pour le sol et les soldats */
const mist = { uMist: { value: 0.85 }, uTop: { value: (232 - H0) * VE }, uBot: { value: (198 - H0) * VE }, uMistCol: { value: new THREE.Color(0xe6ecf0) } };
function withMist(mat, anim) { // anim : le soldat est animé par la carte graphique, à partir de la table des os
  mat.customProgramCacheKey = () => anim ? 'anime' : 'fixe';
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, mist, anim || {});
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWY;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvec4 wpM=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\nwpM=instanceMatrix*wpM;\n#endif\nwpM=modelMatrix*wpM;vWY=wpM.y;');
    if (anim) animerShader(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWY;uniform float uMist,uTop,uBot;uniform vec3 uMistCol;')
      .replace('#include <fog_fragment>', '#include <fog_fragment>\ngl_FragColor.rgb=mix(gl_FragColor.rgb,uMistCol,uMist*smoothstep(uTop,uBot,vWY)*clamp(vFogDepth/900.0,0.12,1.0));');
  };
  return mat;
}

/* sol, eau, routes, villages et repères : voir src/carte.js */
const rnd = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const { ground, labels } = construireCarte(scene, withMist);

/* ===== SOLDATS : une figurine provisoire dessinée une fois, répétée par la carte graphique ===== */
const SC = 1.5; // figurines un peu grossies pour rester lisibles
function part(w, h, d, x, y, z, color) {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z);
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
const gCoat = mergeGeometries([part(0.5, 0.75, 0.3, 0, 1.2, 0, 0xffffff), part(0.14, 0.6, 0.14, 0.32, 1.2, 0, 0xffffff), part(0.14, 0.6, 0.14, -0.32, 1.2, 0, 0xffffff)]);
const gRest = mergeGeometries([
  part(0.2, 0.85, 0.22, 0.13, 0.42, 0, 0xe8e4d8), part(0.2, 0.85, 0.22, -0.13, 0.42, 0, 0xe8e4d8), // culotte blanche
  part(0.24, 0.26, 0.24, 0, 1.72, 0, 0xd9a987), part(0.42, 0.22, 0.3, 0, 1.94, 0, 0x17171a),       // tête, coiffe
  part(0.05, 1.5, 0.05, 0.34, 1.55, 0.12, 0x5a4030), part(0.03, 0.45, 0.03, 0.34, 2.5, 0.12, 0xb9c0c8) // fusil, baïonnette
]);
gCoat.scale(SC, SC, SC); gRest.scale(SC, SC, SC);

const CAMPS = {
  fr: { nom: 'France', coul: 0x2c3f94 }, ru: { nom: 'Russie', coul: 0x2c5a37 }, au: { nom: 'Autriche', coul: 0xdcd8cc }
};
const regs = [];
let FIGS = 120;
function addReg(camp, nom, lat, lon, face, type) { const [x, z] = ll(lat, lon); regs.push({ camp, nom, x, z, face, type: type || 'inf', deploi: 0, tirT: 0, max: 0, tx: x, tz: z, tface: face, form: 'colonne', sel: false, moving: false, n: 0, moral: 100, etat: 'ok', recharge: 0, sousFeu: 99, acc: 0, ...ETAT0() }); }
const ETAT0 = () => ({ manoeuvre: 0, desordre: 0, fatigue: 0, charge: null, testCharge: false, melee: null, meleeT: 0, choc: 0, cible: null, issue: null }); // manœuvre, combat rapproché, fatigue
/* Ordre de bataille provisoire, à vérifier sur sources.
   France : IVe corps (Soult), divisions Saint-Hilaire et Vandamme, au pied du plateau le long du Goldbach. */
const E = Math.PI / 2; // face à l'est
[['10e léger', 2], ['14e de ligne', 2], ['36e de ligne', 2], ['43e de ligne', 2], ['55e de ligne', 2]].forEach(([n, b], i) => { for (let k = 0; k < b; k++) addReg('fr', `${n}, ${k + 1}${k ? 'e' : 'er'} bataillon (Saint-Hilaire)`, 49.1415 - i * 0.0019, 16.7395 - k * 0.0016, E); });
[['24e léger', 2], ['4e de ligne', 2], ['28e de ligne', 2], ['46e de ligne', 2], ['57e de ligne', 2]].forEach(([n, b], i) => { for (let k = 0; k < b; k++) addReg('fr', `${n}, ${k + 1}${k ? 'e' : 'er'} bataillon (Vandamme)`, 49.1515 - i * 0.0017, 16.7440 - k * 0.0016, E); });
/* Alliés : 4e colonne, surprise en marche vers le sud-ouest sur le plateau. */
const SO = -Math.PI * 0.75;
['Novgorod', 'Apchéron', 'Petite-Russie', 'Smolensk'].forEach((n, i) => { for (let k = 0; k < 3; k++) addReg('ru', `Régiment de ${n}, ${k + 1}${k ? 'e' : 'er'} bataillon`, 49.1385 + i * 0.0020 + k * 0.0011, 16.7700 + i * 0.0030 + k * 0.0017, SO); });
['IR 23 Salzbourg', 'IR 20 Kaunitz', 'IR 24 Auersperg', 'IR 1 Kaiser', 'IR 9 Czartoryski', 'IR 55 Reuss-Greitz'].forEach((n, i) => { for (let k = 0; k < 2; k++) addReg('au', `${n}, ${k + 1}${k ? 'e' : 'er'} bataillon`, 49.1440 + i * 0.0012 + k * 0.0011, 16.7850 + i * 0.0026 + k * 0.0017, SO); });

/* Artillerie, provisoire elle aussi : quatre pièces par batterie. */
addReg('fr', 'Artillerie à pied, batterie de 8 (Saint-Hilaire)', 49.1420, 16.7425, E, 'art'); addReg('fr', 'Artillerie à pied, batterie de 8 (Vandamme)', 49.1522, 16.7470, E, 'art');
addReg('ru', 'Batterie russe de 6 livres', 49.1372, 16.7722, SO, 'art'); addReg('ru', 'Batterie russe de 12 livres', 49.1432, 16.7790, SO, 'art'); addReg('au', 'Batterie autrichienne de 6 livres', 49.1452, 16.7838, SO, 'art');
const PIECES = 4, SERVANTS = 6, ECART_PIECES = 14;

/* modèles Meshy préparés par outils/convertir_modele.py : un maillage détaillé de près, un allégé de loin */
const HAUT = 1.8 * SC, LOD_DIST = 260;
const MODELES = { fr: soldat(FR, HAUT, withMist), ru: soldat(RU, HAUT, withMist), au: soldat(AU, HAUT, withMist) }; // Russes et Autrichiens : squelette et animations du Français

let sold, pools = [], provisoire; // sold : x, z, décalage de pas par figurine
const matCoat = withMist(new THREE.MeshLambertMaterial({ vertexColors: true })), matRest = withMist(new THREE.MeshLambertMaterial({ vertexColors: true }));
const POSTES = [[-1.3, 1.6], [1.3, 1.6], [-1.6, 3.2], [1.6, 3.2], [0, 4.8], [0.6, 7]]; // servants autour de leur pièce
function slot(r, k, out) { // place de la figurine k dans la formation, repère du bataillon (x : front, z : profondeur)
  out[2] = 0; if (r.type === 'art') { const p = POSTES[Math.floor(k / PIECES) % SERVANTS]; out[0] = ((k % PIECES) - (PIECES - 1) / 2) * ECART_PIECES + p[0]; out[1] = p[1]; return; }
  if (r.form === 'carre') { // carré creux, trois rangs par face, chaque face regarde vers l'extérieur
    const n = Math.ceil(FIGS / 4), c = Math.ceil(n / 3), s = Math.min(3, Math.floor(k / n)), j = k - s * n;
    const le = ((j % c) - (c - 1) / 2) * 1.4, d = c * 0.7 + 2.5 - Math.floor(j / c) * 1.2;
    out[0] = [le, d, -le, -d][s]; out[1] = [-d, le, d, -le][s]; out[2] = s * Math.PI / 2; return;
  }
  if (r.form === 'tirailleurs') { // ordre dispersé sur deux rangs, chacun à sa place approximative
    const cols = Math.ceil(FIGS / 2); out[0] = ((k % cols) - (cols - 1) / 2) * 4 + (rnd(k, 21) - 0.5) * 2.5; out[1] = (Math.floor(k / cols) - 0.5) * 8 + (rnd(k, 23) - 0.5) * 3; return;
  }
  const cols = r.form === 'ligne' ? Math.ceil(FIGS / 3) : 12, rows = Math.ceil(FIGS / cols);
  const sx = r.form === 'ligne' ? 1.6 : 1.5, sz = r.form === 'ligne' ? 1.9 : 2.4;
  out[0] = ((k % cols) - (cols - 1) / 2) * sx; out[1] = (Math.floor(k / cols) - (rows - 1) / 2) * sz;
}
function front(r) { // largeur du front en mètres
  if (r.type === 'art') return (PIECES - 1) * ECART_PIECES + 10;
  return r.form === 'ligne' ? FIGS / 3 * 1.6 : r.form === 'tirailleurs' ? FIGS / 2 * 4 : r.form === 'carre' ? Math.ceil(Math.ceil(FIGS / 4) / 3) * 1.4 + 5 : 18;
}
function pool(meshes, lignes) { // lignes : par figurine, les deux images d'animation à mélanger (la partie décimale donne le dosage), partagées entre corps et fusil
  meshes.forEach(m => { m.frustumCulled = false; m.instanceMatrix = meshes[0].instanceMatrix; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); if (lignes) m.geometry.setAttribute('aRow', lignes); scene.add(m); });
  const p = { meshes, M: meshes[0].instanceMatrix.array, R: lignes, n: 0 }; pools.push(p); return p;
}
const ligneAnim = n => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2); a.setUsage(THREE.DynamicDrawUsage); return a; };
function build() {
  pools.forEach(p => p.meshes.forEach(m => { scene.remove(m); m.dispose(); })); pools = [];
  const N = regs.length * FIGS; sold = new Float32Array(N * 3);
  for (const camp in MODELES) { const m = MODELES[camp], n = regs.filter(r => r.camp === camp).length * FIGS;
    m.pPres = pool(m.pres.map((g, i) => new THREE.InstancedMesh(g, m.mats[i], n)), ligneAnim(n)); m.pLoin = pool(m.loin.map((g, i) => new THREE.InstancedMesh(g, m.mats[i], n)), ligneAnim(n)); }
  const nP = regs.filter(r => !MODELES[r.camp]).length * FIGS, coat = new THREE.InstancedMesh(gCoat, matCoat, nP), c = new THREE.Color(); let q = 0;
  provisoire = pool([coat, new THREE.InstancedMesh(gRest, matRest, nP)]);
  regs.forEach((r, ri) => { for (let k = 0; k < FIGS; k++) { const i = ri * FIGS + k;
    sold[i * 3] = r.x; sold[i * 3 + 1] = r.z; sold[i * 3 + 2] = rnd(i, 7); // position, et où en est le pas
    if (!MODELES[r.camp]) { c.setHex(CAMPS[r.camp].coul).multiplyScalar(0.85 + rnd(i, 3) * 0.3); coat.setColorAt(q++, c); } } r.snap = true;
    r.max = r.type === 'art' ? Math.min(FIGS, PIECES * SERVANTS) : FIGS;
    Object.assign(r, { n: r.max, deploi: 0, tirT: 0, moral: 100, etat: 'ok', recharge: rnd(ri, 1) * 20, sousFeu: 99, acc: 0, moving: false, tx: r.x, tz: r.z }, ETAT0()); r.flag.children[1].material.color.setHex(CAMPS[r.camp].coul); r.flag.visible = true; });
  mortsInit();
  canonsInit(); fin = false; const fe = document.getElementById('fin'); if (fe) fe.style.display = 'none';
  document.getElementById('nb').textContent = regs.reduce((a, r) => a + r.max, 0).toLocaleString('fr-FR');
}
/* repère du bataillon -> carte : l'avant regarde (sin f, -cos f), la droite est (cos f, sin f) */
function toWorld(r, lx, lz, out) { const cs = Math.cos(r.face), sn = Math.sin(r.face); out[0] = r.x + lx * cs - lz * sn; out[1] = r.z + lx * sn + lz * cs; }

/* canons : pièce Gribeauval de Meshy (modeles/canon-gribeauval.glb), affût jaune ocre pour les Autrichiens */
const mSC = new THREE.Vector3(SC, SC, SC); let canons = []; // grossis comme les soldats
function canonsInit() { canons.forEach(c => { scene.remove(c); c.dispose(); }); canons = [];
  for (const camp in CAMPS) { const B = regs.filter(r => r.type === 'art' && r.camp === camp); if (!B.length) continue;
    const o = objet(CANON, withMist, camp), mesh = new THREE.InstancedMesh(o.pres, o.mat, B.length * PIECES); mesh.frustumCulled = false; scene.add(mesh); canons.push(mesh); B.forEach((r, i) => { r.canons = mesh; r.canon0 = i * PIECES; }); } }

/* drapeaux et anneaux de sélection */
const flagG = new THREE.PlaneGeometry(9, 6); flagG.translate(4.5, 13, 0);
const poleG = new THREE.CylinderGeometry(0.15, 0.15, 16); poleG.translate(0, 8, 0);
const ringG = new THREE.RingGeometry(0.92, 1, 48); ringG.rotateX(-Math.PI / 2);
regs.forEach(r => {
  r.flag = new THREE.Group();
  r.flag.add(new THREE.Mesh(poleG, new THREE.MeshBasicMaterial({ color: 0x3a2c1c })), new THREE.Mesh(flagG, new THREE.MeshBasicMaterial({ color: CAMPS[r.camp].coul, side: THREE.DoubleSide })));
  r.ring = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, depthTest: false })); r.ring.visible = false; r.ring.renderOrder = 4;
  scene.add(r.flag, r.ring);
});

/* ===== CAMÉRA façon Total War ===== */
const [fx0, fz0] = ll(49.139, 16.752);
const cam = { x: fx0, z: fz0, yaw: 0.0, pitch: 0.62, dist: 1900 };
const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'Digit1') setForm('ligne'); if (e.code === 'Digit2') setForm('colonne'); if (e.code === 'Digit3') setForm('carre'); if (e.code === 'Digit4') setForm('tirailleurs'); if (e.code === 'KeyC') charger(); if (e.code === 'Space') { e.preventDefault(); setSpeed(speed ? 0 : 1); } });
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const el = renderer.domElement;
el.addEventListener('wheel', e => { e.preventDefault(); cam.dist = Math.min(9000, Math.max(40, cam.dist * Math.exp(e.deltaY * 0.0011))); }, { passive: false });
el.addEventListener('contextmenu', e => e.preventDefault());
function camUpdate(dt) {
  const v = cam.dist * 0.9 * dt * (keys.ShiftLeft ? 2.5 : 1), fwx = Math.sin(cam.yaw), fwz = -Math.cos(cam.yaw);
  let mf = 0, mr = 0;
  if (keys.KeyW || keys.ArrowUp) mf++; if (keys.KeyS || keys.ArrowDown) mf--; if (keys.KeyD || keys.ArrowRight) mr++; if (keys.KeyA || keys.ArrowLeft) mr--;
  cam.x += (fwx * mf - fwz * mr) * v; cam.z += (fwz * mf + fwx * mr) * v;
  if (keys.KeyQ) cam.yaw -= 1.3 * dt; if (keys.KeyE) cam.yaw += 1.3 * dt;
  cam.x = Math.max(-WX / 2, Math.min(WX / 2, cam.x)); cam.z = Math.max(-WZ / 2, Math.min(WZ / 2, cam.z));
  const gy = yAt(cam.x, cam.z), h = Math.cos(cam.pitch) * cam.dist;
  let px = cam.x - fwx * h, pz = cam.z - fwz * h, py = gy + Math.sin(cam.pitch) * cam.dist;
  py = Math.max(py, yAt(px, pz) + 6);
  camera.position.set(px, py, pz); camera.lookAt(cam.x, gy + 2, cam.z);
}

/* ===== SOURIS : sélection et ordres ===== */
const ray = new THREE.Raycaster(), m2 = new THREE.Vector2(), boxEl = document.getElementById('box');
function groundAt(cx, cy) { m2.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(m2, camera); const h = ray.intersectObject(ground)[0]; return h ? h.point : null; }
let drag = null;
el.addEventListener('pointerdown', e => {
  el.setPointerCapture(e.pointerId);
  if (e.button === 1 || (e.button === 0 && e.altKey)) drag = { t: 'rot', x: e.clientX, y: e.clientY };
  else if (e.button === 0) drag = { t: 'sel', x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, add: e.shiftKey };
  else if (e.button === 2) { const p = groundAt(e.clientX, e.clientY); if (!p) return; const cible = unitePres(p, o => o.n > 0 && o.etat === 'ok' && regs.some(r => r.sel && ennemis(r, o)));
    if (cible) attaquer(cible, e.ctrlKey || e.metaKey); else order(p); }
});
el.addEventListener('pointermove', e => {
  if (!drag) return;
  if (drag.t === 'rot') { cam.yaw += (e.clientX - drag.x) * 0.005; cam.pitch = Math.max(0.12, Math.min(1.45, cam.pitch + (e.clientY - drag.y) * 0.004)); drag.x = e.clientX; drag.y = e.clientY; }
  else { drag.x = e.clientX; drag.y = e.clientY; const w = Math.abs(drag.x - drag.x0), h = Math.abs(drag.y - drag.y0);
    if (w + h > 8) { boxEl.style.display = 'block'; boxEl.style.left = Math.min(drag.x, drag.x0) + 'px'; boxEl.style.top = Math.min(drag.y, drag.y0) + 'px'; boxEl.style.width = w + 'px'; boxEl.style.height = h + 'px'; } }
});
el.addEventListener('pointerup', e => {
  if (drag && drag.t === 'sel') {
    const big = Math.abs(drag.x - drag.x0) + Math.abs(drag.y - drag.y0) > 8; boxEl.style.display = 'none';
    if (!drag.add) regs.forEach(r => r.sel = false);
    if (big) { const v = new THREE.Vector3(), x1 = Math.min(drag.x, drag.x0), x2 = Math.max(drag.x, drag.x0), y1 = Math.min(drag.y, drag.y0), y2 = Math.max(drag.y, drag.y0);
      regs.forEach(r => { v.set(r.x, yAt(r.x, r.z), r.z).project(camera); const sx = (v.x + 1) / 2 * innerWidth, sy = (1 - v.y) / 2 * innerHeight; if (commandable(r) && v.z < 1 && sx >= x1 && sx <= x2 && sy >= y1 && sy <= y2) r.sel = true; }); }
    else { const p = groundAt(e.clientX, e.clientY); if (p) { let best = null, bd = 70 + cam.dist * 0.03; regs.forEach(r => { const d = Math.hypot(r.x - p.x, r.z - p.z); if (r.n > 0 && d < bd) { bd = d; best = r; } }); if (best) best.sel = !(drag.add && best.sel); } }
    hud();
  }
  drag = null;
});
function unitePres(p, test) { let best = null, bd = 50 + cam.dist * 0.025; regs.forEach(r => { const d = Math.hypot(r.x - p.x, r.z - p.z); if (test(r) && d < bd) { bd = d; best = r; } }); return best; }
const libre = r => commandable(r) && !r.melee; // une unité en mêlée ne peut pas rompre le combat sur ordre
function order(p) { // marche vers le point : le groupe garde un front perpendiculaire à sa route
  const S = regs.filter(r => r.sel && libre(r)); if (!S.length) return; S.forEach(r => { r.charge = null; r.testCharge = false; r.cible = null; });
  const cx = S.reduce((a, r) => a + r.x, 0) / S.length, cz = S.reduce((a, r) => a + r.z, 0) / S.length;
  const f = Math.atan2(p.x - cx, -(p.z - cz)), rx = Math.cos(f), rz = Math.sin(f), fwx = Math.sin(f), fwz = -Math.cos(f);
  S.sort((a, b) => ((a.x - cx) * rx + (a.z - cz) * rz) - ((b.x - cx) * rx + (b.z - cz) * rz));
  const perRow = Math.min(S.length, 6);
  S.forEach((r, i) => { const w = Math.max(45, front(r) + 25), row = Math.floor(i / perRow), k = i % perRow, n = Math.min(perRow, S.length - row * perRow);
    const off = (k - (n - 1) / 2) * w; r.tx = p.x + rx * off - fwx * row * 70; r.tz = p.z + rz * off - fwz * row * 70; r.tface = f; r.moving = true;
    r.tx = Math.max(-WX / 2 + 50, Math.min(WX / 2 - 50, r.tx)); r.tz = Math.max(-WZ / 2 + 50, Math.min(WZ / 2 - 50, r.tz)); });
}
/* attaquer : marcher à portée de tir et faire feu ; avec Ctrl (ou la touche C), charger à la baïonnette */
function attaquer(e, charge) { regs.filter(r => r.sel && libre(r) && ennemis(r, e)).forEach(r => { if (charge && peutCharger(r)) lancerCharge(r, e); else { r.charge = null; r.cible = e; } }); hud(); }
function charger() { // chaque unité choisie charge l'ennemi le plus proche devant elle, ou celui qu'elle attaquait
  let n = 0; regs.filter(r => r.sel && libre(r)).forEach(r => { if (!peutCharger(r)) return;
    let e = r.cible && r.cible.n > 0 && r.cible.etat === 'ok' && Math.hypot(r.cible.x - r.x, r.cible.z - r.z) < PORTEE_CHARGE ? r.cible : null;
    if (!e) { let d = PORTEE_CHARGE; for (const o of regs) if (o.n > 0 && o.etat === 'ok' && ennemis(r, o)) { const q = Math.hypot(o.x - r.x, o.z - r.z); if (q < d && Math.abs(ecart(cap(r, o), r.face)) < 1.1) { d = q; e = o; } } }
    if (e) { lancerCharge(r, e); n++; } });
  avis(n ? '' : 'Aucun ennemi à portée de charge devant les unités choisies (300 m), ou unités trop fatiguées, en carré ou en manœuvre.'); hud();
}
function setForm(f) { regs.forEach(r => { if (r.sel && libre(r) && r.type !== 'art') changerForm(r, f); }); hud(); }
function changerForm(r, f) { // changer de formation prend du temps ; pendant ce temps, ni marche ni feu
  if (r.form === f || r.charge) return; const d = DUREE_FORM[f] + (r.form === 'tirailleurs' ? 10 : 0) + (r.form === 'ligne' && f === 'carre' ? 10 : 0);
  r.form = f; r.manoeuvre = d * (r.desordre > 0 ? 1.5 : 1); r.cible = null;
}
let avisT = 0; function avis(t) { const e = document.getElementById('avis'); e.textContent = t; e.style.display = t ? 'block' : 'none'; avisT = 5; }
let speed = 1; function setSpeed(s) { speed = s; document.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('on', +b.dataset.v === s)); }

/* ===== SIMULATION : on déplace le bataillon, les figurines rejoignent leur place ===== */
/* ===== COMBAT : feu de salve, pertes, moral, déroute =====
   Réglages regroupés ici pour l'équilibrage. */
const PORTEE = 160, RECHARGE = 20, ARC = 0.7, CONTACT = 28;
const PORTEE_TIR = 220, RECHARGE_TIR = 6, ARC_TIR = 1.4;                 // tirailleurs : feu à volonté, plus loin, moins meurtrier
const DUREE_FORM = { ligne: 35, colonne: 20, carre: 25, tirailleurs: 15 }; // secondes pour adopter la formation
const FORMES = { // vitesse de marche (m/s), exposition au feu, vigueur en mêlée, tenue face à une charge
  ligne: { v: 1.15, cible: 1, melee: 1, tenue: 1, nom: 'ligne' }, colonne: { v: 1.5, cible: 1.4, melee: 1.25, tenue: 1, nom: 'colonne' },
  carre: { v: 0.35, cible: 1.3, melee: 0.9, tenue: 1.15, nom: 'carré' }, tirailleurs: { v: 1.8, cible: 0.35, melee: 0.4, tenue: 0.5, nom: 'tirailleurs' } };
const PORTEE_CHARGE = 300, ELAN = 80, MELEE_D = 14, TAUX_MELEE = 0.009;  // la charge s'élance à 80 m, mêlée à 14 m entre les centres
const CASSE = 0.6;                                                        // une armée se brise quand 60 % de ses unités sont détruites ou en déroute
const PORTEE_ART = 900, MITRAILLE = 250, RECHARGE_ART = 30, ARC_ART = 0.45, MISE_EN_BATTERIE = 40, PIVOT = 12;
const hommes = r => Math.round(r.n / (r.max || 1) * (r.type === 'art' ? 100 : 600)); // un bataillon : 600 hommes, une batterie : 100
let iaAllies = true;
const ennemis = (a, b) => (a.camp === 'fr') !== (b.camp === 'fr');
const commandable = r => r.n > 0 && r.etat === 'ok' && !(iaAllies && r.camp !== 'fr');
const ecart = (a, b) => ((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
const cap = (r, e) => Math.atan2(e.x - r.x, -(e.z - r.z)); // direction de r vers e

/* fumée : nuage de points qui montent et s'effacent */
const NF = 4000, fPos = new Float32Array(NF * 3), fCol = new Float32Array(NF * 4), fVie = new Float32Array(NF); let fK = 0;
const fGeo = new THREE.BufferGeometry(); fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3)); fGeo.setAttribute('color', new THREE.BufferAttribute(fCol, 4));
{ const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  var fumee = new THREE.Points(fGeo, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(cv), size: 16, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, fog: false }));
  fumee.frustumCulled = false; fumee.renderOrder = 3; scene.add(fumee); }
function bouffee(x, y, z) { const k = fK = (fK + 1) % NF; fPos[k * 3] = x; fPos[k * 3 + 1] = y; fPos[k * 3 + 2] = z; fVie[k] = 1; }
function fumeeMaj(dt) { for (let k = 0; k < NF; k++) { if (fVie[k] <= 0) { fCol[k * 4 + 3] = 0; continue; } fVie[k] -= dt / 26; fPos[k * 3 + 1] += dt * 0.55; fPos[k * 3] += dt * 0.5;
    const g = 0.93; fCol[k * 4] = g; fCol[k * 4 + 1] = g; fCol[k * 4 + 2] = g; fCol[k * 4 + 3] = Math.max(0, fVie[k]) * 0.5; }
  fGeo.attributes.position.needsUpdate = fGeo.attributes.color.needsUpdate = true; }

/* morts laissés sur le terrain */
let morts = [];
function mortsInit() {
  morts.forEach(m => { scene.remove(m.mesh); m.mesh.dispose(); }); morts = [];
  const mk = (geo, mat, n, test) => { const mesh = new THREE.InstancedMesh(geo, mat, n); mesh.count = 0; mesh.frustumCulled = false; scene.add(mesh); morts.push({ mesh, test, max: n }); };
  for (const camp in MODELES) { const m = MODELES[camp], n = regs.filter(r => r.camp === camp).length * FIGS, g = m.loin[0].clone(), l = ligneAnim(n); l.array.fill(m.clips.attente[0]); g.setAttribute('aRow', l); mk(g, m.mats[0], n, r => r.camp === camp); }
  mk(gCoat, matCoat, regs.filter(r => !MODELES[r.camp]).length * FIGS, r => !MODELES[r.camp]);
}
const mM = new THREE.Matrix4(), mQ = new THREE.Quaternion(), mE = new THREE.Euler(), mV = new THREE.Vector3(), mS = new THREE.Vector3(1, 1, 1), mC = new THREE.Color();
function tombe(r, x, z) { const p = morts.find(m => m.test(r)); if (!p || p.mesh.count >= p.max) return;
  mE.set(-Math.PI / 2, Math.random() * 6.28, 0, 'YXZ'); mQ.setFromEuler(mE); mV.set(x, yAt(x, z) + 0.3, z); mM.compose(mV, mQ, mS);
  const i = p.mesh.count++; p.mesh.setMatrixAt(i, mM); if (!MODELES[r.camp]) { p.mesh.setColorAt(i, mC.setHex(CAMPS[r.camp].coul)); p.mesh.instanceColor.needsUpdate = true; } p.mesh.instanceMatrix.needsUpdate = true; }

function pertes(e, attendu, tireur, coefMoral) { // retire des figurines, laisse les morts, entame le moral
  e.acc += attendu * (0.6 + Math.random() * 0.8); const tues = Math.min(e.n, Math.floor(e.acc)); e.acc -= tues;
  for (let k = 0; k < tues; k++) { const i = regs.indexOf(e) * FIGS + (--e.n); tombe(e, sold[i * 3], sold[i * 3 + 1]); }
  const flanc = Math.abs(ecart(cap(e, tireur), e.face)) > 1.05;         // pris de flanc ou à revers : le moral souffre double
  e.moral -= (tues / e.max * 100 * 1.6 + 1.2) * (flanc && e.form !== 'carre' ? 2 : 1) * (e.manoeuvre > 0 ? 1.3 : 1) * coefMoral; e.sousFeu = 0; return flanc; // le carré n'a pas de flanc ; une unité en manœuvre est fragile
}
function salve(r, e, d, bout) { // bout : feu à bout portant sur une charge
  const tir = r.form === 'tirailleurs', tireurs = r.form === 'ligne' ? r.n * 0.85 : r.form === 'carre' ? r.n / 4 * 0.85 : tir ? r.n * 0.9 : Math.min(r.n, 24); // en colonne, seuls les premiers rangs tirent ; en carré, une seule face
  let p = tir ? 0.016 - (0.016 - 0.004) * Math.min(1, Math.max(0, (d - 30) / (PORTEE_TIR - 30))) : 0.05 - (0.05 - 0.008) * Math.min(1, Math.max(0, (d - 30) / (PORTEE - 30)));
  if (e.type !== 'art') p *= FORMES[e.form].cible;                      // colonne et carré denses, tirailleurs dispersés
  if (e.type === 'art') p *= 0.25;                                      // servants dispersés autour des pièces
  if (tir && r.moving) p *= 0.5;                                        // les tirailleurs tirent en marchant, moins bien
  if (bout) p *= 1.3;
  const coef = tir ? 0.6 : 1;
  if (mist.uMist.value && altAt(e.x, e.z) < 215) p *= 0.5;              // cible dans la brume
  if (altAt(r.x, r.z) - altAt(e.x, e.z) > 4) p *= 1.15;                 // tir depuis la hauteur
  pertes(e, tireurs * p, r, coef);
  const cs = Math.cos(r.face), sn = Math.sin(r.face), w = r.form === 'carre' ? 10 : front(r);
  for (let k = 0; k < (tir ? 5 : 14); k++) { const lx = (Math.random() - 0.5) * w, x = r.x + lx * cs + sn * 6, z = r.z + lx * sn - cs * 6; bouffee(x, yAt(x, z) + 2.5 + Math.random() * 2, z); }
  r.recharge = (tir ? RECHARGE_TIR : RECHARGE) * (0.9 + Math.random() * 0.3); r.tirT = 3;
}
/* artillerie : boulet de loin, mitraille de près ; il faut voir la cible, donc les crêtes et les contre-pentes comptent */
function enVue(r, e) { const a0 = altAt(r.x, r.z) + 2, a1 = altAt(e.x, e.z) + 2; for (let k = 1; k < 16; k++) { const t = k / 16; if (altAt(r.x + (e.x - r.x) * t, r.z + (e.z - r.z) * t) > a0 + (a1 - a0) * t) return false; } return true; }
function canonnade(r, e, d) {
  const pieces = Math.ceil(r.n / SERVANTS), mitraille = d < MITRAILLE; // une pièce sans servants se tait
  let parPiece = mitraille ? 0.7 + 1.1 * (1 - d / MITRAILLE) : 0.45 * (1 - 0.65 * (d - MITRAILLE) / (PORTEE_ART - MITRAILLE));
  if (e.type === 'art') parPiece *= 0.3; else { parPiece *= e.max / 120; if (!mitraille && e.form === 'colonne') parPiece *= 2.2; if (e.form === 'carre') parPiece *= 3.5; if (e.form === 'tirailleurs') parPiece *= 0.3; } // le boulet traverse une colonne dans sa profondeur, et un carré plus encore
  if (mist.uMist.value && altAt(e.x, e.z) < 215) parPiece *= 0.5;
  const flanc = pertes(e, pieces * parPiece, r, 1.5);
  if (flanc && !mitraille && e.type !== 'art' && e.form === 'ligne') pertes(e, pieces * parPiece, r, 0); // enfilade : le boulet prend la ligne dans sa longueur
  const cs = Math.cos(r.face), sn = Math.sin(r.face);
  for (let g = 0; g < pieces; g++) for (let k = 0; k < 9; k++) { const lx = (g - (PIECES - 1) / 2) * ECART_PIECES + (Math.random() - 0.5) * 4, av = 4 + Math.random() * 9, x = r.x + lx * cs + sn * av, z = r.z + lx * sn - cs * av; bouffee(x, yAt(x, z) + 2 + Math.random() * 4, z); }
  r.recharge = RECHARGE_ART * (0.9 + Math.random() * 0.25); r.mitraille = mitraille;
}
/* charge à la baïonnette : marche, élan à 80 m, puis épreuve des nerfs avant le contact. Le plus souvent, un camp cède avant le choc. */
const peutCharger = r => r.type !== 'art' && r.form !== 'carre' && r.manoeuvre <= 0 && r.fatigue < 75 && !r.melee && r.etat === 'ok';
function lancerCharge(r, e) { r.charge = e; r.cible = null; r.testCharge = false; r.moving = true; }
function finCharge(r, desordre) { r.charge = null; r.testCharge = false; r.moving = false; r.tx = r.x; r.tz = r.z; r.desordre = Math.max(r.desordre, desordre); }
function epreuve(r, e) { // le choc a-t-il lieu ? on compare l'élan de l'assaillant à la tenue du défenseur
  const nombre = Math.sqrt(Math.max(1, hommes(r)) / Math.max(1, hommes(e)));
  const att = r.moral * 1.1 * (r.form === 'colonne' ? 1.15 : r.form === 'tirailleurs' ? 0.6 : 1) * (1 - r.fatigue / 250) * Math.min(1.6, nombre);
  const flanc = e.form !== 'carre' && e.type !== 'art' && Math.abs(ecart(cap(e, r), e.face)) > 1.05;
  const def = e.moral * (e.type === 'art' ? 0.8 : FORMES[e.form].tenue) * (flanc ? 0.5 : 1) * (e.manoeuvre > 0 ? 0.6 : 1) * (e.desordre > 0 ? 0.8 : 1) * (1 - e.fatigue / 250) * (altAt(e.x, e.z) - altAt(r.x, r.z) > 4 ? 1.15 : 1);
  const x = def * (0.75 + Math.random() * 0.5) / att;
  if (x < 0.85) { e.moral = Math.min(e.moral, 15); e.sousFeu = 0; r.moral = Math.min(100, r.moral + 8); finCharge(r, 10); return 'cède'; } // le défenseur lâche pied avant le choc
  if (x > 1.25 || r.moral < 40) { r.moral -= 15; finCharge(r, 15); return 'échoue'; }                                                    // l'assaillant hésite et s'arrête
  r.charge = null; r.testCharge = false; r.melee = e; r.choc = 10; e.moral -= 8; if (!e.melee) e.melee = r; e.charge = null; e.cible = null; e.moving = false; return 'mêlée'; // le choc : l'assaillant frappe plus fort les premières secondes
}
function melee(r, e, d, dt) {
  if (d > MELEE_D) { r.tx = e.x - (e.x - r.x) / d * MELEE_D * 0.9; r.tz = e.z - (e.z - r.z) / d * MELEE_D * 0.9; r.tface = cap(r, e); r.moving = true; } else { r.moving = false; r.tface = cap(r, e); }
  r.fatigue = Math.min(100, r.fatigue + dt * 1.5); r.meleeT += dt;
  if (r.meleeT < 1) return; r.meleeT -= 1; // on règle la mêlée seconde par seconde
  const flanc = e.type !== 'art' && e.form !== 'carre' && Math.abs(ecart(cap(e, r), e.face)) > 1.05;
  r.choc = Math.max(0, (r.choc || 0) - 1); const vigueur = (r.type === 'art' ? 0.3 : FORMES[r.form].melee) * (flanc ? 1.5 : 1) * (r.choc > 0 ? 1.6 : 1) * (1 - r.fatigue / 250);
  pertes(e, r.n * TAUX_MELEE * vigueur, r, 1.2);
  if (hommes(r) < hommes(e) * 0.8) r.moral -= 1; // le plus faible en nombre perd pied
}
function combat(r, dt) {
  const art = r.type === 'art', tir = r.form === 'tirailleurs', portee = art ? PORTEE_ART : tir ? PORTEE_TIR : PORTEE;
  let e = null, d = 1e9; for (const o of regs) if (o.n > 0 && ennemis(r, o)) { const q = Math.hypot(o.x - r.x, o.z - r.z); if (q < d && (o.etat === 'ok' || q < portee)) { d = q; e = o; } }
  r.ennemi = e; r.dEnn = d; r.recharge -= dt; r.sousFeu += dt; r.tirT -= dt; r.manoeuvre = Math.max(0, r.manoeuvre - dt); r.desordre = Math.max(0, r.desordre - dt);
  if (!r.charge && !r.melee) r.fatigue = Math.max(0, r.fatigue - dt * (r.moving ? 0.1 : 0.5));
  if (r.etat === 'deroute') { // fuite, puis ralliement loin de l'ennemi
    if (!r.moving || d < 250) { const a = e ? cap(e, r) : 0; r.tx = Math.max(-WX / 2 + 60, Math.min(WX / 2 - 60, r.x + Math.sin(a) * 500)); r.tz = Math.max(-WZ / 2 + 60, Math.min(WZ / 2 - 60, r.z - Math.cos(a) * 500)); r.moving = true; }
    if (r.sousFeu > 20) r.moral += dt * 0.9;
    if (r.moral > 45 && d > 350) { r.etat = 'ok'; r.moving = false; r.desordre = 30; r.flag.children[1].material.color.setHex(CAMPS[r.camp].coul); }
    return;
  }
  if (r.sousFeu > 15) r.moral = Math.min(100 * Math.min(1, r.n / r.max + 0.25), r.moral + dt * 0.35);
  if (r.n < r.max * 0.15 || (art && r.moral < 20)) { r.n = 0; r.sel = false; r.flag.visible = false; r.ring.visible = false; return; } // bataillon détruit, ou servants qui abandonnent leurs pièces
  if (r.moral < 20) {
    if (r.melee && r.melee.n > 0) pertes(r, r.n * 0.06, r.melee, 0); // la poursuite fait des victimes dans le dos des fuyards
    Object.assign(r, ETAT0(), { fatigue: r.fatigue }); r.etat = 'deroute'; r.sel = false; r.form = 'colonne'; r.moving = false; r.flag.children[1].material.color.setHex(0xf2f2f2); return;
  }
  if (r.melee) { // mêlée : on se bat jusqu'à ce qu'un camp cède ; le vainqueur doit se reformer
    let m = r.melee; if (m.n <= 0 || m.etat !== 'ok') { m = r.melee = regs.find(o => o.melee === r && o.n > 0 && o.etat === 'ok') || null; if (!m) { r.moving = false; r.tx = r.x; r.tz = r.z; r.desordre = 12; r.moral = Math.min(100, r.moral + 6); return; } }
    melee(r, m, Math.hypot(m.x - r.x, m.z - r.z), dt); return;
  }
  if (r.charge) { const c = r.charge, dc = Math.hypot(c.x - r.x, c.z - r.z);
    if (c.n <= 0 || c.etat !== 'ok' || dc > PORTEE_CHARGE + 80 || r.fatigue >= 100) { finCharge(r, 8); return; } // cible enfuie ou hors d'atteinte : on s'arrête
    r.fatigue = Math.min(100, r.fatigue + dt * (dc < ELAN ? 1 : 0.3)); r.tx = c.x; r.tz = c.z; r.tface = cap(r, c); r.moving = true;
    if (dc < 45 && !r.testCharge) { r.testCharge = true; r.issue = epreuve(r, c); }
    return;
  }
  // feu à bout portant : une unité chargée garde sa salve pour l'assaillant, s'il est devant elle
  if (!art && r.manoeuvre <= 0 && r.desordre <= 0 && r.recharge < 4) for (const o of regs) if (o.charge === r && o.n > 0) { const q = Math.hypot(o.x - r.x, o.z - r.z);
    if (q < 60 && (r.form === 'carre' || Math.abs(ecart(cap(r, o), r.face)) < 1.2)) { salve(r, o, q, true); break; } }
  if (r.cible) { const c = r.cible, dc = Math.hypot(c.x - r.x, c.z - r.z), reste = art ? 600 : tir ? 160 : 100; // attaquer : se placer à portée, face à la cible
    if (c.n <= 0 || c.etat !== 'ok') r.cible = null;
    else if (r.manoeuvre <= 0) { if (dc > reste + 25) { r.tx = c.x - (c.x - r.x) / dc * reste; r.tz = c.z - (c.z - r.z) / dc * reste; r.tface = cap(r, c); r.moving = true; }
      else if (Math.abs(ecart(cap(r, c), r.face)) > 0.3 && !r.moving) { r.tx = r.x; r.tz = r.z; r.tface = cap(r, c); r.moving = true; } }
  }
  if (iaAllies && r.camp !== 'fr' && e && d < (art ? PORTEE_ART : 450)) { // IA : faire face à la menace, charger un ennemi ébranlé
    if (!art && e.etat === 'ok' && e.type !== 'art' && d < 160 && peutCharger(r) && r.desordre <= 0 && r.moral > 55 && r.fatigue < 50 && (e.moral < 45 || e.manoeuvre > 0 || e.form === 'tirailleurs')) { lancerCharge(r, e); return; }
    if (!art && r.form !== 'ligne' && d > 140 && r.manoeuvre <= 0) changerForm(r, 'ligne');
    if (r.manoeuvre <= 0 && Math.abs(ecart(cap(r, e), r.face)) > (art ? 0.3 : 0.25) && !r.moving) { r.tx = r.x; r.tz = r.z; r.tface = cap(r, e); r.moving = true; } }
  if (art) { if (!r.moving) r.deploi -= dt; r.voit = !!e && d < PORTEE_ART && enVue(r, e);
    if (r.voit && !r.moving && r.deploi <= 0 && r.recharge <= 0 && Math.abs(ecart(cap(r, e), r.face)) < ARC_ART) canonnade(r, e, d); return; }
  if (e && r.manoeuvre <= 0 && r.desordre <= 0 && r.recharge <= 0 && (!r.moving || tir) && (d < portee) && (r.form === 'carre' || Math.abs(ecart(cap(r, e), r.face)) < (tir ? ARC_TIR : ARC))) salve(r, e, d);
}

/* ===== SIMULATION : on déplace le bataillon, les figurines rejoignent leur place ===== */
const tmp = [0, 0, 0]; let tAnim = 0;
function sim(dt) {
  const t = performance.now() / 1000; pools.forEach(p => p.n = 0);
  if (speed > 0) tAnim += dt / speed * Math.min(speed, 2.5); // les jambes ne s'emballent pas en accéléré
  regs.forEach((r, ri) => {
    if (r.n <= 0) return;
    if (dt > 0) combat(r, dt);
    if (r.n <= 0) return;
    const fuite = r.etat === 'deroute'; let avance = r.moving && Math.hypot(r.tx - r.x, r.tz - r.z) > 0.5; // le bataillon est en route : ses hommes marchent, même en pause
    if (r.manoeuvre > 0 && !fuite) avance = false; // en pleine manœuvre, on ne marche pas : l'ordre attend
    else if (r.moving && dt > 0) {
      const dx = r.tx - r.x, dz = r.tz - r.z, d = Math.hypot(dx, dz);
      const pente = Math.max(0, (altAt(r.x + dx / (d || 1) * 20, r.z + dz / (d || 1) * 20) - altAt(r.x, r.z)) / 20);
      if (r.type === 'art') r.deploi = d > 1 ? MISE_EN_BATTERIE : Math.max(r.deploi, PIVOT); // bouger oblige à remettre en batterie, pivoter coûte moins
      const v = fuite ? 2.8 : r.type === 'art' ? 1.2 * (1 - Math.min(0.65, pente * 6)) : (r.charge ? (d < ELAN ? 3.5 : 2) * (1 - Math.min(0.35, pente * 3)) : FORMES[r.form].v * (1 - Math.min(0.5, pente * 4))) * (1 - r.fatigue / 300); // la ligne marche moins vite, la montée ralentit, la fatigue aussi
      const want = d > 15 ? Math.atan2(dx, -dz) : r.tface, da = ecart(want, r.face);
      r.face += Math.sign(da) * Math.min(Math.abs(da), (fuite ? 1.2 : r.charge || r.melee ? 0.7 : r.form === 'carre' ? 0.6 : 0.35) * dt);
      const bloque = !fuite && !r.charge && !r.melee && r.ennemi && r.dEnn < CONTACT && Math.abs(ecart(cap(r, r.ennemi), Math.atan2(dx, -dz))) < 1.2; // sans ordre de charge, on s'arrête au contact
      if (bloque) r.moving = false;
      else if (d > 0.5) { const st = Math.min(d, v * dt * (Math.abs(da) > 0.6 && !r.charge ? 0.3 : 1)); r.x += dx / d * st; r.z += dz / d * st; avance = true; }
      else if (fuite || Math.abs(da) < 0.01) r.moving = false;
    }
    const cs = Math.cos(r.face), sn = Math.sin(r.face), vmax = (fuite || r.charge ? 4.2 : 2.6) * dt, md = MODELES[r.camp], course = fuite || (r.charge && r.dEnn < ELAN);
    const P = !md ? provisoire : Math.hypot(camera.position.x - r.x, camera.position.z - r.z, camera.position.y - yAt(r.x, r.z)) < LOD_DIST ? md.pPres : md.pLoin, M = P.M;
    for (let k = 0; k < r.n; k++) {
      const i = ri * FIGS + k; slot(r, k, tmp); const tourne = tmp[2]; if (fuite) { tmp[0] += (rnd(i, 11) - 0.5) * 9; tmp[1] += (rnd(i, 13) - 0.5) * 9; }
      if (r.melee) { tmp[0] += Math.sin(t * 0.9 + rnd(i, 17) * 6.3) * 1.6; tmp[1] += Math.sin(t * 1.3 + rnd(i, 19) * 6.3) * 1.6 - 3; } // mêlée : les rangs se brisent et se poussent
      toWorld(r, tmp[0], tmp[1], tmp);
      let x = sold[i * 3], z = sold[i * 3 + 1]; const ex = tmp[0] - x, ez = tmp[1] - z, e = Math.hypot(ex, ez); let bob = 0, fait = 0;
      if (r.snap) { x = tmp[0]; z = tmp[1]; }
      else if (e > 1e-4 && dt > 0) { const st = Math.min(e, vmax * (0.8 + rnd(i, 5) * 0.4)); x += ex / e * st; z += ez / e * st; fait = st; if (!md) bob = Math.abs(Math.sin(t * 6 * Math.min(speed, 3) + sold[i * 3 + 2])) * 0.12 * SC; }
      if (md) { // en marche, l'animation avance avec le chemin réellement parcouru : les pieds ne glissent pas
        const c = e > 0.25 || avance ? (course ? md.clips.course : md.clips.marche) : md.clips.attente; let pos;
        if (c === md.clips.attente) pos = (tAnim * c[2] + rnd(i, 7) * 40) % c[1];
        else { sold[i * 3 + 2] = (sold[i * 3 + 2] + fait / (c[3] * HAUT)) % 1; pos = sold[i * 3 + 2] * c[1]; }
        const ia = Math.floor(pos) % c[1]; P.R.array[P.n * 2] = c[0] + ia + Math.min(0.999, pos - Math.floor(pos)); P.R.array[P.n * 2 + 1] = c[0] + (ia + 1) % c[1]; }
      sold[i * 3] = x; sold[i * 3 + 1] = z;
      const o = P.n++ * 16, fc = tourne ? Math.cos(r.face + tourne) : cs, fs = tourne ? Math.sin(r.face + tourne) : sn; // rotation autour de la verticale puis position ; en carré, chaque face regarde dehors
      M[o] = fc; M[o + 1] = 0; M[o + 2] = fs; M[o + 3] = 0; M[o + 4] = 0; M[o + 5] = 1; M[o + 6] = 0; M[o + 7] = 0;
      M[o + 8] = -fs; M[o + 9] = 0; M[o + 10] = fc; M[o + 11] = 0; M[o + 12] = x; M[o + 13] = yAt(x, z) + bob; M[o + 14] = z; M[o + 15] = 1;
    }
    r.snap = false;
    const gy = yAt(r.x, r.z); r.flag.position.set(r.x, gy, r.z); r.flag.rotation.y = -r.face;
    if (r.type === 'art') for (let g = 0; g < PIECES; g++) { toWorld(r, (g - (PIECES - 1) / 2) * ECART_PIECES, 0, tmp); mE.set(0, -r.face, 0); mQ.setFromEuler(mE); mV.set(tmp[0], yAt(tmp[0], tmp[1]), tmp[1]); r.canons.setMatrixAt(r.canon0 + g, mM.compose(mV, mQ, mSC)); }
    const rad = r.type === 'art' ? 36 : r.form === 'colonne' ? 22 : r.form === 'carre' ? front(r) * 0.75 + 6 : front(r) / 2 + 8; r.ring.visible = r.sel; r.ring.position.set(r.x, gy + 1.5, r.z); r.ring.scale.set(rad, 1, rad);
  });
  pools.forEach(p => { p.meshes.forEach(m => m.count = p.n); p.meshes[0].instanceMatrix.needsUpdate = true; if (p.R) p.R.needsUpdate = true; });
  canons.forEach(c => c.instanceMatrix.needsUpdate = true);
  fumeeMaj(dt);
}

/* ===== INTERFACE ===== */
const ETATS = { ok: 'en bon ordre', deroute: 'en déroute' };
function etatArt(r) { return r.moving ? (Math.hypot(r.tx - r.x, r.tz - r.z) > 1 ? 'attelée, en marche' : 'pivote') : r.deploi > 0 ? `mise en batterie (${Math.ceil(r.deploi)} s)` : !r.ennemi || r.dEnn > PORTEE_ART ? 'en batterie, pas de cible' : !r.voit ? 'en batterie, cible masquée par le relief' : Math.abs(ecart(cap(r, r.ennemi), r.face)) > ARC_ART ? 'en batterie, cible hors de l\'axe' : `tire à ${r.dEnn < MITRAILLE ? 'mitraille' : 'boulet'} à ${Math.round(r.dEnn)} m`; }
const court = r => r.nom.split(',')[0];
function etatInf(r) {
  if (r.etat !== 'ok') return ETATS[r.etat];
  if (r.melee) return `<b>en mêlée</b> contre ${court(r.melee)}`;
  if (r.charge) return `<b>charge à la baïonnette</b> sur ${court(r.charge)}`;
  if (r.manoeuvre > 0) return `prend la formation (${Math.ceil(r.manoeuvre)} s)`;
  if (r.desordre > 0) return `${r.issue === 'échoue' ? 'charge repoussée, ' : ''}se reforme (${Math.ceil(r.desordre)} s)`;
  if (r.cible) return `attaque ${court(r.cible)}`;
  return ETATS[r.etat];
}
let fin = false;
function bilan() { // une armée dont la plupart des unités sont détruites ou en fuite est battue
  if (fin) return; const casse = f => { const R = regs.filter(f); return R.filter(r => r.n <= 0 || r.etat !== 'ok').length / R.length; };
  const fr = casse(r => r.camp === 'fr'), al = casse(r => r.camp !== 'fr'); if (fr < CASSE && al < CASSE) return;
  fin = true; const e = document.getElementById('fin'); e.innerHTML = al >= CASSE ? '<b>Victoire française</b><br>Les Alliés sont rejetés du plateau.' : '<b>Défaite</b><br>Le IVe corps est brisé.'; e.style.display = 'block';
}
function hud() {
  const S = regs.filter(r => r.sel && r.n > 0), e = document.getElementById('sel');
  if (!S.length) e.innerHTML = '<i>Aucune unité sélectionnée</i>';
  else if (S.length === 1) { const r = S[0]; e.innerHTML = r.type === 'art' ? `<b>${r.nom}</b><br>${Math.ceil(r.n / SERVANTS)} pièces · ${hommes(r)} hommes · moral ${Math.max(0, Math.round(r.moral))} · ${etatArt(r)}`
    : `<b>${r.nom}</b><br>${hommes(r)} hommes · moral ${Math.max(0, Math.round(r.moral))} · en ${FORMES[r.form].nom} · ${etatInf(r)}${r.fatigue >= 15 ? ' · fatigue ' + Math.round(r.fatigue) : ''}${r.dEnn < PORTEE_TIR ? ' · ennemi à ' + Math.round(r.dEnn) + ' m' : ''}`; }
  else e.innerHTML = `<b>${S.length} unités</b> · ${S.reduce((a, r) => a + hommes(r), 0)} hommes · moral moyen ${Math.round(S.reduce((a, r) => a + Math.max(0, r.moral), 0) / S.length)}<br>` + [...new Set(S.map(r => r.nom.split(',')[0]))].slice(0, 6).join(' · ');
  const tot = f => { const R = regs.filter(f); return `${R.reduce((a, r) => a + hommes(r), 0)} h. <small>(${R.filter(r => r.n > 0 && r.etat === 'ok').length}/${R.length} unités)</small>`; };
  document.getElementById('forces').innerHTML = `France ${tot(r => r.camp === 'fr')}<br>Alliés ${tot(r => r.camp !== 'fr')}`; bilan();
}
['ligne', 'colonne', 'carre', 'tirailleurs'].forEach(f => document.getElementById(f).onclick = () => setForm(f)); document.getElementById('charger').onclick = charger;
document.getElementById('fin').onclick = e => e.currentTarget.style.display = 'none';
document.querySelectorAll('[data-v]').forEach(b => b.onclick = () => setSpeed(+b.dataset.v));
document.getElementById('brume').onclick = e => { mist.uMist.value = mist.uMist.value ? 0 : 0.85; e.target.classList.toggle('on', !!mist.uMist.value); };
document.getElementById('ia').onclick = e => { iaAllies = !iaAllies; e.target.classList.toggle('on', iaAllies); regs.forEach(r => r.sel = false); hud(); };
document.getElementById('figs').onchange = e => { FIGS = +e.target.value; build(); };
document.getElementById('aide').onclick = () => document.getElementById('touches').classList.toggle('cache');
function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize(); build(); hud(); setSpeed(1);

let last = performance.now(), fN = 0, fT = 0;
function loop(now) {
  const real = Math.min(0.1, (now - last) / 1000); last = now;
  camUpdate(real); sim(real * speed); if (avisT > 0 && (avisT -= real) <= 0) avis(''), avisT = 0;
  for (const s of labels) { const d = camera.position.distanceTo(s.position) * 0.11; s.scale.set(d, d * 96 / 512, 1); }
  renderer.render(scene, camera);
  fN++; fT += real; if (fT > 0.5) { document.getElementById('fps').textContent = Math.round(fN / fT); fN = 0; fT = 0; hud(); }
  requestAnimationFrame(loop);
}
window.__jeu = { regs, cam, order, ll, yAt, solAt, setForm, sim, changerForm, lancerCharge, attaquer, charger, setSpeed, hommes, build, toggleIA: v => { iaAllies = v; } };
requestAnimationFrame(loop);
