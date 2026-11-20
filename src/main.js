import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HW, HH, H64 } from './heights.js';
import FR from './modeles/fr.js';

/* ===== TERRAIN : relief réel (tuiles 12/2238/1404 et 12/2239/1404) ===== */
const TILE = 6403, WX = TILE * 2, WZ = TILE, VE = 2.5, H0 = 180;
const LON0 = 2238 / 4096 * 360 - 180, LONW = 2 / 4096 * 360;
const hRaw = (() => { const b = atob(H64), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new Uint16Array(u.buffer); })();
const alt = (i, j) => hRaw[Math.min(HH - 1, Math.max(0, j)) * HW + Math.min(HW - 1, Math.max(0, i))] / 10;
function altAt(x, z) { // altitude réelle en mètres
  const fx = (x / WX + 0.5) * (HW - 1), fz = (z / WZ + 0.5) * (HH - 1);
  const i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j;
  return (alt(i, j) * (1 - a) + alt(i + 1, j) * a) * (1 - b) + (alt(i, j + 1) * (1 - a) + alt(i + 1, j + 1) * a) * b;
}
const yAt = (x, z) => (altAt(x, z) - H0) * VE;
function ll(lat, lon) { // latitude, longitude -> position sur la carte
  const ty = (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 4096;
  return [((lon - LON0) / LONW - 0.5) * WX, (ty - 1404 - 0.5) * WZ];
}

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
function withMist(mat) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, mist);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWY;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvec4 wpM=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\nwpM=instanceMatrix*wpM;\n#endif\nwpM=modelMatrix*wpM;vWY=wpM.y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWY;uniform float uMist,uTop,uBot;uniform vec3 uMistCol;')
      .replace('#include <fog_fragment>', '#include <fog_fragment>\ngl_FragColor.rgb=mix(gl_FragColor.rgb,uMistCol,uMist*smoothstep(uTop,uBot,vWY)*clamp(vFogDepth/900.0,0.12,1.0));');
  };
  return mat;
}

/* sol : couleurs d'hiver, parcelles de champs, givre sur les hauteurs */
const rnd = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
{
  const g = new THREE.PlaneGeometry(WX, WZ, HW - 1, HH - 1); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  const pre = new THREE.Color(0x6f7d55), labour = new THREE.Color(0x7a6a52), chaume = new THREE.Color(0x9c9068), givre = new THREE.Color(0xdfe5e4), humide = new THREE.Color(0x586650);
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), z = p.getZ(k), a = altAt(x, z); p.setY(k, (a - H0) * VE);
    const ang = 0.5, u = x * Math.cos(ang) + z * Math.sin(ang), v = -x * Math.sin(ang) + z * Math.cos(ang);
    const r = rnd(Math.floor(u / 210), Math.floor(v / 140));
    c.copy(r < 0.4 ? labour : r < 0.7 ? chaume : pre);
    const pente = Math.hypot(altAt(x + 25, z) - altAt(x - 25, z), altAt(x, z + 25) - altAt(x, z - 25)) / 50;
    if (pente > 0.09) c.lerp(pre, Math.min(1, (pente - 0.09) * 9));
    if (a < 205) c.lerp(humide, Math.min(1, (205 - a) / 12));
    c.lerp(givre, Math.max(0, Math.min(0.55, (a - 235) / 110)) + 0.08);
    c.multiplyScalar(0.9 + rnd(x, z) * 0.2);
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  var ground = new THREE.Mesh(g, withMist(new THREE.MeshLambertMaterial({ vertexColors: true })));
  scene.add(ground);
}

/* repères */
const labels = [];
function label(txt, lat, lon, big) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96; const x = cv.getContext('2d');
  x.font = (big ? 'bold ' : '') + '52px Georgia,serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 8; x.strokeStyle = 'rgba(20,24,30,.85)'; x.strokeText(txt, 256, 48); x.fillStyle = '#f4ecd6'; x.fillText(txt, 256, 48);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, fog: false, transparent: true }));
  const [px, pz] = ll(lat, lon); s.position.set(px, yAt(px, pz) + 60, pz); s.renderOrder = 5; scene.add(s); labels.push(s);
}
label('Pratzeberg', 49.1278, 16.7634, true); label('Pratzen', 49.141, 16.766); label('Kobelnitz', 49.138, 16.732);
label('Puntowitz', 49.150, 16.742); label('Sokolnitz', 49.114, 16.722); label('Telnitz', 49.102, 16.718); label('Aujezd', 49.105, 16.757);

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
function addReg(camp, nom, lat, lon, face) { const [x, z] = ll(lat, lon); regs.push({ camp, nom, x, z, face, tx: x, tz: z, tface: face, form: 'colonne', sel: false, moving: false, n: 0, moral: 100, etat: 'ok', recharge: 0, sousFeu: 99, acc: 0 }); }
/* Ordre de bataille provisoire, à vérifier sur sources.
   France : IVe corps (Soult), divisions Saint-Hilaire et Vandamme, au pied du plateau le long du Goldbach. */
const E = Math.PI / 2; // face à l'est
[['10e léger', 2], ['14e de ligne', 2], ['36e de ligne', 2], ['43e de ligne', 2], ['55e de ligne', 2]].forEach(([n, b], i) => { for (let k = 0; k < b; k++) addReg('fr', `${n}, ${k + 1}${k ? 'e' : 'er'} bataillon (Saint-Hilaire)`, 49.1415 - i * 0.0019, 16.7395 - k * 0.0016, E); });
[['24e léger', 2], ['4e de ligne', 2], ['28e de ligne', 2], ['46e de ligne', 2], ['57e de ligne', 2]].forEach(([n, b], i) => { for (let k = 0; k < b; k++) addReg('fr', `${n}, ${k + 1}${k ? 'e' : 'er'} bataillon (Vandamme)`, 49.1515 - i * 0.0017, 16.7440 - k * 0.0016, E); });
/* Alliés : 4e colonne, surprise en marche vers le sud-ouest sur le plateau. */
const SO = -Math.PI * 0.75;
['Novgorod', 'Apchéron', 'Petite-Russie', 'Smolensk'].forEach((n, i) => { for (let k = 0; k < 3; k++) addReg('ru', `Régiment de ${n}, ${k + 1}${k ? 'e' : 'er'} bataillon`, 49.1385 + i * 0.0020 + k * 0.0011, 16.7700 + i * 0.0030 + k * 0.0017, SO); });
['IR 23 Salzbourg', 'IR 20 Kaunitz', 'IR 24 Auersperg', 'IR 1 Kaiser', 'IR 9 Czartoryski', 'IR 55 Reuss-Greitz'].forEach((n, i) => { for (let k = 0; k < 2; k++) addReg('au', `${n}, ${k + 1}${k ? 'e' : 'er'} bataillon`, 49.1440 + i * 0.0012 + k * 0.0011, 16.7850 + i * 0.0026 + k * 0.0017, SO); });

/* modèles Meshy préparés par outils/convertir_modele.py : un maillage détaillé de près, un allégé de loin */
const HAUT = 1.8 * SC, LOD_DIST = 260;
function geoModele(d) {
  const bin = (t, T) => { const b = atob(t), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new T(u.buffer); };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(bin(d.pos, Float32Array), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(bin(d.nor, Int8Array), 3, true));
  g.setAttribute('uv', new THREE.BufferAttribute(bin(d.uv, Float32Array), 2));
  g.setIndex(new THREE.BufferAttribute(bin(d.idx, Uint16Array), 1));
  g.scale(HAUT, HAUT, HAUT); g.rotateY(MODELE_DEMI_TOUR ? Math.PI : 0); return g;
}
const MODELE_DEMI_TOUR = true; // les modèles regardent vers +z, le jeu fait avancer vers -z
function matModele(d) { const t = new THREE.TextureLoader().load(d.tex); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return withMist(new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide })); }
const MODELES = { fr: { pres: geoModele(FR.pres), loin: geoModele(FR.loin), mat: matModele(FR) } }; // les autres camps gardent la figurine provisoire

let sold, pools = [], provisoire; // sold : x, z, décalage de pas par figurine
const matCoat = withMist(new THREE.MeshLambertMaterial({ vertexColors: true })), matRest = withMist(new THREE.MeshLambertMaterial({ vertexColors: true }));
function slot(r, k, out) { // place de la figurine k dans la formation, repère du bataillon (x : front, z : profondeur)
  const cols = r.form === 'ligne' ? Math.ceil(FIGS / 3) : 12, rows = Math.ceil(FIGS / cols);
  const sx = r.form === 'ligne' ? 1.6 : 1.5, sz = r.form === 'ligne' ? 1.9 : 2.4;
  out[0] = ((k % cols) - (cols - 1) / 2) * sx; out[1] = (Math.floor(k / cols) - (rows - 1) / 2) * sz;
}
function pool(meshes) { meshes.forEach(m => { m.frustumCulled = false; m.instanceMatrix = meshes[0].instanceMatrix; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }); const p = { meshes, M: meshes[0].instanceMatrix.array, n: 0 }; pools.push(p); return p; }
function build() {
  pools.forEach(p => p.meshes.forEach(m => { scene.remove(m); m.dispose(); })); pools = [];
  const N = regs.length * FIGS; sold = new Float32Array(N * 3);
  for (const camp in MODELES) { const m = MODELES[camp], n = regs.filter(r => r.camp === camp).length * FIGS;
    m.pPres = pool([new THREE.InstancedMesh(m.pres, m.mat, n)]); m.pLoin = pool([new THREE.InstancedMesh(m.loin, m.mat, n)]); }
  const nP = regs.filter(r => !MODELES[r.camp]).length * FIGS, coat = new THREE.InstancedMesh(gCoat, matCoat, nP), c = new THREE.Color(); let q = 0;
  provisoire = pool([coat, new THREE.InstancedMesh(gRest, matRest, nP)]);
  regs.forEach((r, ri) => { for (let k = 0; k < FIGS; k++) { const i = ri * FIGS + k;
    sold[i * 3] = r.x; sold[i * 3 + 1] = r.z; sold[i * 3 + 2] = rnd(i, 7) * 6.28;
    if (!MODELES[r.camp]) { c.setHex(CAMPS[r.camp].coul).multiplyScalar(0.85 + rnd(i, 3) * 0.3); coat.setColorAt(q++, c); } } r.snap = true;
    Object.assign(r, { n: FIGS, moral: 100, etat: 'ok', recharge: rnd(ri, 1) * 20, sousFeu: 99, acc: 0, moving: false, tx: r.x, tz: r.z }); r.flag.children[1].material.color.setHex(CAMPS[r.camp].coul); r.flag.visible = true; });
  mortsInit();
  document.getElementById('nb').textContent = N.toLocaleString('fr-FR');
}
/* repère du bataillon -> carte : l'avant regarde (sin f, -cos f), la droite est (cos f, sin f) */
function toWorld(r, lx, lz, out) { const cs = Math.cos(r.face), sn = Math.sin(r.face); out[0] = r.x + lx * cs - lz * sn; out[1] = r.z + lx * sn + lz * cs; }

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
addEventListener('keydown', e => { keys[e.code] = true; if (e.code === 'Digit1') setForm('ligne'); if (e.code === 'Digit2') setForm('colonne'); if (e.code === 'Space') { e.preventDefault(); setSpeed(speed ? 0 : 1); } });
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
  else if (e.button === 2) { const p = groundAt(e.clientX, e.clientY); if (p) order(p); }
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
function order(p) { // marche vers le point : le groupe garde un front perpendiculaire à sa route
  const S = regs.filter(r => r.sel && commandable(r)); if (!S.length) return;
  const cx = S.reduce((a, r) => a + r.x, 0) / S.length, cz = S.reduce((a, r) => a + r.z, 0) / S.length;
  const f = Math.atan2(p.x - cx, -(p.z - cz)), rx = Math.cos(f), rz = Math.sin(f), fwx = Math.sin(f), fwz = -Math.cos(f);
  S.sort((a, b) => ((a.x - cx) * rx + (a.z - cz) * rz) - ((b.x - cx) * rx + (b.z - cz) * rz));
  const perRow = Math.min(S.length, 6);
  S.forEach((r, i) => { const w = r.form === 'ligne' ? FIGS / 3 * 1.6 + 25 : 45, row = Math.floor(i / perRow), k = i % perRow, n = Math.min(perRow, S.length - row * perRow);
    const off = (k - (n - 1) / 2) * w; r.tx = p.x + rx * off - fwx * row * 70; r.tz = p.z + rz * off - fwz * row * 70; r.tface = f; r.moving = true;
    r.tx = Math.max(-WX / 2 + 50, Math.min(WX / 2 - 50, r.tx)); r.tz = Math.max(-WZ / 2 + 50, Math.min(WZ / 2 - 50, r.tz)); });
}
function setForm(f) { regs.forEach(r => { if (r.sel && commandable(r)) r.form = f; }); hud(); }
let speed = 1; function setSpeed(s) { speed = s; document.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('on', +b.dataset.v === s)); }

/* ===== SIMULATION : on déplace le bataillon, les figurines rejoignent leur place ===== */
/* ===== COMBAT : feu de salve, pertes, moral, déroute =====
   Une figurine vaut HOMMES soldats. Réglages regroupés ici pour l'équilibrage. */
const HOMMES = 5, PORTEE = 160, RECHARGE = 20, ARC = 0.7, CONTACT = 28;
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
  for (const camp in MODELES) mk(MODELES[camp].loin, MODELES[camp].mat, regs.filter(r => r.camp === camp).length * FIGS, r => r.camp === camp);
  mk(gCoat, matCoat, regs.filter(r => !MODELES[r.camp]).length * FIGS, r => !MODELES[r.camp]);
}
const mM = new THREE.Matrix4(), mQ = new THREE.Quaternion(), mE = new THREE.Euler(), mV = new THREE.Vector3(), mS = new THREE.Vector3(1, 1, 1), mC = new THREE.Color();
function tombe(r, x, z) { const p = morts.find(m => m.test(r)); if (!p || p.mesh.count >= p.max) return;
  mE.set(-Math.PI / 2, Math.random() * 6.28, 0, 'YXZ'); mQ.setFromEuler(mE); mV.set(x, yAt(x, z) + 0.3, z); mM.compose(mV, mQ, mS);
  const i = p.mesh.count++; p.mesh.setMatrixAt(i, mM); if (!MODELES[r.camp]) { p.mesh.setColorAt(i, mC.setHex(CAMPS[r.camp].coul)); p.mesh.instanceColor.needsUpdate = true; } p.mesh.instanceMatrix.needsUpdate = true; }

function salve(r, e, d) {
  const tireurs = r.form === 'ligne' ? r.n * 0.85 : Math.min(r.n, 24); // en colonne, seuls les premiers rangs tirent
  let p = 0.05 - (0.05 - 0.008) * Math.min(1, Math.max(0, (d - 30) / (PORTEE - 30)));
  if (e.form === 'colonne') p *= 1.4;                                   // cible dense
  if (mist.uMist.value && altAt(e.x, e.z) < 215) p *= 0.5;              // cible dans la brume
  if (altAt(r.x, r.z) - altAt(e.x, e.z) > 4) p *= 1.15;                 // tir depuis la hauteur
  e.acc += tireurs * p * (0.6 + Math.random() * 0.8); const tues = Math.min(e.n, Math.floor(e.acc)); e.acc -= tues;
  for (let k = 0; k < tues; k++) { const i = regs.indexOf(e) * FIGS + (--e.n); tombe(e, sold[i * 3], sold[i * 3 + 1]); }
  const flanc = Math.abs(ecart(cap(e, r), e.face)) > 1.05;              // pris de flanc ou à revers : le moral souffre double
  e.moral -= (tues / FIGS * 100 * 1.6 + 1.2) * (flanc ? 2 : 1); e.sousFeu = 0;
  const cs = Math.cos(r.face), sn = Math.sin(r.face), w = r.form === 'ligne' ? FIGS / 3 * 1.6 : 18;
  for (let k = 0; k < 14; k++) { const lx = (Math.random() - 0.5) * w, x = r.x + lx * cs + sn * 6, z = r.z + lx * sn - cs * 6; bouffee(x, yAt(x, z) + 2.5 + Math.random() * 2, z); }
  r.recharge = RECHARGE * (0.9 + Math.random() * 0.3);
}
function combat(r, dt) {
  let e = null, d = 1e9; for (const o of regs) if (o.n > 0 && ennemis(r, o)) { const q = Math.hypot(o.x - r.x, o.z - r.z); if (q < d && (o.etat === 'ok' || q < PORTEE)) { d = q; e = o; } }
  r.ennemi = e; r.dEnn = d; r.recharge -= dt; r.sousFeu += dt;
  if (r.etat === 'deroute') { // fuite, puis ralliement loin de l'ennemi
    if (!r.moving || d < 250) { const a = e ? cap(e, r) : 0; r.tx = Math.max(-WX / 2 + 60, Math.min(WX / 2 - 60, r.x + Math.sin(a) * 500)); r.tz = Math.max(-WZ / 2 + 60, Math.min(WZ / 2 - 60, r.z - Math.cos(a) * 500)); r.moving = true; }
    if (r.sousFeu > 20) r.moral += dt * 0.9;
    if (r.moral > 45 && d > 350) { r.etat = 'ok'; r.moving = false; r.flag.children[1].material.color.setHex(CAMPS[r.camp].coul); }
    return;
  }
  if (r.sousFeu > 15) r.moral = Math.min(100 * Math.min(1, r.n / FIGS + 0.25), r.moral + dt * 0.35);
  if (r.n < FIGS * 0.15) { r.n = 0; r.sel = false; r.flag.visible = false; r.ring.visible = false; return; } // bataillon détruit
  if (r.moral < 20) { r.etat = 'deroute'; r.sel = false; r.form = 'colonne'; r.moving = false; r.flag.children[1].material.color.setHex(0xf2f2f2); return; }
  if (iaAllies && r.camp !== 'fr' && e && d < 450) { // IA minimale : se mettre en ligne face à la menace
    r.form = 'ligne'; if (Math.abs(ecart(cap(r, e), r.face)) > 0.25 && !r.moving) { r.tx = r.x; r.tz = r.z; r.tface = cap(r, e); r.moving = true; } }
  if (e && d < PORTEE && !r.moving && r.recharge <= 0 && Math.abs(ecart(cap(r, e), r.face)) < ARC) salve(r, e, d);
}

/* ===== SIMULATION : on déplace le bataillon, les figurines rejoignent leur place ===== */
const tmp = [0, 0];
function sim(dt) {
  const t = performance.now() / 1000; pools.forEach(p => p.n = 0);
  regs.forEach((r, ri) => {
    if (r.n <= 0) return;
    if (dt > 0) combat(r, dt);
    if (r.n <= 0) return;
    const fuite = r.etat === 'deroute';
    if (r.moving && dt > 0) {
      const dx = r.tx - r.x, dz = r.tz - r.z, d = Math.hypot(dx, dz);
      const pente = Math.max(0, (altAt(r.x + dx / (d || 1) * 20, r.z + dz / (d || 1) * 20) - altAt(r.x, r.z)) / 20);
      const v = fuite ? 2.8 : (r.form === 'ligne' ? 1.15 : 1.5) * (1 - Math.min(0.5, pente * 4)); // la ligne marche moins vite, la montée ralentit
      const want = d > 15 ? Math.atan2(dx, -dz) : r.tface, da = ecart(want, r.face);
      r.face += Math.sign(da) * Math.min(Math.abs(da), (fuite ? 1.2 : 0.35) * dt);
      const bloque = !fuite && r.ennemi && r.dEnn < CONTACT && Math.abs(ecart(cap(r, r.ennemi), Math.atan2(dx, -dz))) < 1.2; // pas de mêlée pour l'instant : on s'arrête au contact
      if (bloque) r.moving = false;
      else if (d > 0.5) { const st = Math.min(d, v * dt * (Math.abs(da) > 0.6 ? 0.3 : 1)); r.x += dx / d * st; r.z += dz / d * st; }
      else if (fuite || Math.abs(da) < 0.01) r.moving = false;
    }
    const cs = Math.cos(r.face), sn = Math.sin(r.face), vmax = (fuite ? 4 : 2.6) * dt, md = MODELES[r.camp];
    const P = !md ? provisoire : Math.hypot(camera.position.x - r.x, camera.position.z - r.z, camera.position.y - yAt(r.x, r.z)) < LOD_DIST ? md.pPres : md.pLoin, M = P.M;
    for (let k = 0; k < r.n; k++) {
      const i = ri * FIGS + k; slot(r, k, tmp); if (fuite) { tmp[0] += (rnd(i, 11) - 0.5) * 9; tmp[1] += (rnd(i, 13) - 0.5) * 9; } toWorld(r, tmp[0], tmp[1], tmp);
      let x = sold[i * 3], z = sold[i * 3 + 1]; const ex = tmp[0] - x, ez = tmp[1] - z, e = Math.hypot(ex, ez); let bob = 0;
      if (r.snap) { x = tmp[0]; z = tmp[1]; }
      else if (e > 0.05 && dt > 0) { const st = Math.min(e, vmax * (0.8 + rnd(i, 5) * 0.4)); x += ex / e * st; z += ez / e * st; bob = Math.abs(Math.sin(t * 6 * Math.min(speed, 3) + sold[i * 3 + 2])) * 0.12 * SC; }
      sold[i * 3] = x; sold[i * 3 + 1] = z;
      const o = P.n++ * 16; // rotation autour de la verticale puis position
      M[o] = cs; M[o + 1] = 0; M[o + 2] = sn; M[o + 3] = 0; M[o + 4] = 0; M[o + 5] = 1; M[o + 6] = 0; M[o + 7] = 0;
      M[o + 8] = -sn; M[o + 9] = 0; M[o + 10] = cs; M[o + 11] = 0; M[o + 12] = x; M[o + 13] = yAt(x, z) + bob; M[o + 14] = z; M[o + 15] = 1;
    }
    r.snap = false;
    const gy = yAt(r.x, r.z); r.flag.position.set(r.x, gy, r.z); r.flag.rotation.y = -r.face;
    const rad = r.form === 'ligne' ? FIGS / 3 * 0.8 + 8 : 22; r.ring.visible = r.sel; r.ring.position.set(r.x, gy + 1.5, r.z); r.ring.scale.set(rad, 1, rad);
  });
  pools.forEach(p => { p.meshes.forEach(m => m.count = p.n); p.meshes[0].instanceMatrix.needsUpdate = true; });
  fumeeMaj(dt);
}

/* ===== INTERFACE ===== */
const ETATS = { ok: 'en bon ordre', deroute: 'en déroute' };
function hud() {
  const S = regs.filter(r => r.sel && r.n > 0), e = document.getElementById('sel');
  if (!S.length) e.innerHTML = '<i>Aucun bataillon sélectionné</i>';
  else if (S.length === 1) { const r = S[0]; e.innerHTML = `<b>${r.nom}</b><br>${r.n * HOMMES} hommes · moral ${Math.max(0, Math.round(r.moral))} · en ${r.form} · ${ETATS[r.etat]}${r.dEnn < PORTEE ? ' · ennemi à ' + Math.round(r.dEnn) + ' m' : ''}`; }
  else e.innerHTML = `<b>${S.length} bataillons</b> · ${S.reduce((a, r) => a + r.n, 0) * HOMMES} hommes · moral moyen ${Math.round(S.reduce((a, r) => a + Math.max(0, r.moral), 0) / S.length)}<br>` + [...new Set(S.map(r => r.nom.split(',')[0]))].slice(0, 6).join(' · ');
  const tot = f => { const R = regs.filter(f); return `${R.reduce((a, r) => a + r.n, 0) * HOMMES} h. <small>(${R.filter(r => r.n > 0 && r.etat === 'ok').length}/${R.length} bat.)</small>`; };
  document.getElementById('forces').innerHTML = `France ${tot(r => r.camp === 'fr')}<br>Alliés ${tot(r => r.camp !== 'fr')}`;
}
document.getElementById('ligne').onclick = () => setForm('ligne'); document.getElementById('colonne').onclick = () => setForm('colonne');
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
  camUpdate(real); sim(real * speed);
  for (const s of labels) { const d = camera.position.distanceTo(s.position) * 0.11; s.scale.set(d, d * 96 / 512, 1); }
  renderer.render(scene, camera);
  fN++; fT += real; if (fT > 0.5) { document.getElementById('fps').textContent = Math.round(fN / fT); fN = 0; fT = 0; hud(); }
  requestAnimationFrame(loop);
}
window.__jeu = { regs, cam, order, ll, yAt, setForm };
requestAnimationFrame(loop);
