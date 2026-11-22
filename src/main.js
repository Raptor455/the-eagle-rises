import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WX, WZ, VE, H0, ll, altAt, yAt, solAt, construireCarte } from './carte.js';
import FR from './modeles/fr.js';
import RU from './modeles/ru.js';
import AU from './modeles/au.js';
import CANON from './modeles/canon.js';
import CAV_FR from './modeles/cav-fr.js';
import CAV_RU from './modeles/cav-ru.js';
import CAV_AU from './modeles/cav-au.js';
import COSAQUE from './modeles/cosaque.js';
import CHEVAL from './modeles/cheval-selle.js';
import { animerShader, soldat, objet, HAUT_CHEVAL, ROBE_LOURD } from './unites.js';
import { UNITES } from './ordre-de-bataille.js';
import { creerFumee } from './fumee.js';
import { creerVillages } from './villages-combat.js';

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
const { ground, labels, ilots } = construireCarte(scene, withMist);
const V = creerVillages(scene, renderer, camera, ilots, yAt); // villages au combat : garnisons, assauts, incendies (src/villages-combat.js)

/* ===== SOLDATS : une figurine provisoire dessinée une fois, répétée par la carte graphique ===== */
const SC = 1; // taille des figurines (1 = taille réelle : un fantassin fait 1,80 m)
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
/* cavalier provisoire dessiné en code, en attendant le modèle : l'avant est vers -z */
/* très loin (au-delà de LOIN_DIST) : un soldat n'occupe qu'un ou deux pixels, une silhouette de 12 triangles suffit */
const LOIN_DIST = 650, gLoin = part(0.55, 1.8, 0.4, 0, 0.9, 0, 0xffffff), gLoinCav = part(0.7, 2.6, 2.4, 0, 1.3, 0, 0xffffff); gLoin.scale(SC, SC, SC); gLoinCav.scale(SC, SC, SC);
const gCavCoat = mergeGeometries([part(0.46, 0.62, 0.32, 0, 2.25, 0.1, 0xffffff), part(0.13, 0.5, 0.13, 0.3, 2.25, 0.05, 0xffffff), part(0.13, 0.5, 0.13, -0.3, 2.25, 0.05, 0xffffff)]);
const gCavRest = mergeGeometries([
  part(0.56, 0.72, 2.0, 0, 1.38, 0, 0x5b3a22), part(0.32, 0.75, 0.4, 0, 1.9, -0.95, 0x5b3a22), part(0.24, 0.28, 0.62, 0, 2.2, -1.25, 0x4a2e1a), // corps, encolure, tête du cheval
  ...[[-0.18, -0.72], [0.18, -0.72], [-0.18, 0.72], [0.18, 0.72]].map(([x, z]) => part(0.14, 1.05, 0.14, x, 0.52, z, 0x3d2616)), part(0.08, 0.7, 0.1, 0, 1.2, 1.05, 0x2a1a10), // jambes, queue
  part(0.16, 0.62, 0.16, 0.3, 1.62, 0.1, 0xe8e4d8), part(0.16, 0.62, 0.16, -0.3, 1.62, 0.1, 0xe8e4d8),                                    // culotte, bottes le long des flancs
  part(0.22, 0.24, 0.22, 0, 2.7, 0.1, 0xd9a987), part(0.3, 0.34, 0.3, 0, 2.96, 0.1, 0x17171a), part(0.04, 0.04, 1.0, 0.36, 2.4, -0.3, 0xb9c0c8) // tête, coiffe, sabre
]);
gCavCoat.scale(SC, SC, SC); gCavRest.scale(SC, SC, SC);

const CAMPS = {
  fr: { nom: 'France', coul: 0x2c3f94 }, ru: { nom: 'Russie', coul: 0x2c5a37 }, au: { nom: 'Autriche', coul: 0xdcd8cc }
};
const regs = [];
let ECHELLE = 5; // hommes par figurine
let horloge = 0; // secondes de bataille écoulées, pour l'arrivée des renforts
/* type : 'inf', 'cav' ou 'art' ; hommes : effectif réel ; sorte : ligne, leger, grenadiers, garde, cuirassiers, dragons, hussards... ; opts.pieces pour une batterie */
function addReg(camp, nom, lat, lon, face, type, h, sorte, opts) { const [x, z] = ll(lat, lon); type = type || 'inf'; opts = opts || {};
  const pieces = type === 'art' ? opts.pieces || 4 : 0;
  regs.push({ camp, nom, x, z, face, type, sorte: sorte || (type === 'cav' ? 'dragons' : type === 'art' ? 'pied' : 'ligne'), h0: h || (type === 'art' ? pieces * 25 : type === 'cav' ? 150 : 600), pieces, opts, f0: 0, deploi: 0, tirT: 0, max: 0, tx: x, tz: z, tface: face, form: 'colonne', sel: false, moving: false, n: 0, moral: 100, etat: 'ok', recharge: 0, sousFeu: 99, acc: 0, garnison: null, ...ETAT0() }); }
const figsDe = r => r.type === 'art' ? r.pieces * SERVANTS : Math.max(6, Math.round(r.h0 / ECHELLE));
const ESP = () => Math.max(0.45, Math.sqrt(ECHELLE / 5)); // espacement des figurines : serré à 1/1, desserré quand une figurine vaut plusieurs hommes
const ETAT0 = () => ({ tFeu: 99, tFeuVu: 99, aFumer: 0, manoeuvre: 0, desordre: 0, fatigue: 0, charge: null, testCharge: false, melee: null, meleeT: 0, choc: 0, cible: null, assaut: false, issue: null, versIlot: null, portes: null, cibleBat: null, meleeIlot: null, dedans: 0, tIlot: 0 }); // manœuvre, combat rapproché, fatigue
/* Deux batailles : la démo de Pratzen (par défaut), ou Austerlitz entière avec ?bataille=austerlitz dans l'adresse */
const BATAILLE = new URLSearchParams(location.search).get('bataille') === 'austerlitz' ? 'austerlitz' : 'pratzen';
const RABAT = { tirailleurs: 'leger', grenzer: 'leger', pionniers: 'ligne' }; // sortes rabattues sur la plus proche
if (BATAILLE === 'austerlitz') UNITES.forEach(([camp, nom, lat, lon, face, type, h, sorte, opts]) => addReg(camp, nom, lat, lon, face, type, h, RABAT[sorte] || sorte, opts));
/* Ordre de bataille provisoire de la démo, à vérifier sur sources.
   France : IVe corps (Soult), divisions Saint-Hilaire et Vandamme, au pied du plateau le long du Goldbach. */
const E = Math.PI / 2; // face à l'est
if (BATAILLE === 'pratzen') {
[['10e léger', 2], ['14e de ligne', 2], ['36e de ligne', 2], ['43e de ligne', 2], ['55e de ligne', 2]].forEach(([n, b], i) => { for (let k = 0; k < b; k++) addReg('fr', `${n}, ${k + 1}${k ? 'e' : 'er'} bataillon (Saint-Hilaire)`, 49.1415 - i * 0.0019, 16.7395 - k * 0.0016, E); });
[['24e léger', 2], ['4e de ligne', 2], ['28e de ligne', 2], ['46e de ligne', 2], ['57e de ligne', 2]].forEach(([n, b], i) => { for (let k = 0; k < b; k++) addReg('fr', `${n}, ${k + 1}${k ? 'e' : 'er'} bataillon (Vandamme)`, 49.1515 - i * 0.0017, 16.7440 - k * 0.0016, E); });
/* Alliés : 4e colonne, surprise en marche vers le sud-ouest sur le plateau. */
const SO = -Math.PI * 0.75;
['Novgorod', 'Apchéron', 'Petite-Russie', 'Smolensk'].forEach((n, i) => { for (let k = 0; k < 3; k++) addReg('ru', `Régiment de ${n}, ${k + 1}${k ? 'e' : 'er'} bataillon`, 49.1385 + i * 0.0020 + k * 0.0011, 16.7700 + i * 0.0030 + k * 0.0017, SO); });
['IR 23 Salzbourg', 'IR 20 Kaunitz', 'IR 24 Auersperg', 'IR 1 Kaiser', 'IR 9 Czartoryski', 'IR 55 Reuss-Greitz'].forEach((n, i) => { for (let k = 0; k < 2; k++) addReg('au', `${n}, ${k + 1}${k ? 'e' : 'er'} bataillon`, 49.1440 + i * 0.0012 + k * 0.0011, 16.7850 + i * 0.0026 + k * 0.0017, SO); });

/* Artillerie, provisoire elle aussi : quatre pièces par batterie. */
addReg('fr', 'Artillerie à pied, batterie de 8 (Saint-Hilaire)', 49.1420, 16.7425, E, 'art'); addReg('fr', 'Artillerie à pied, batterie de 8 (Vandamme)', 49.1522, 16.7470, E, 'art');
addReg('ru', 'Batterie russe de 6 livres', 49.1372, 16.7722, SO, 'art'); addReg('ru', 'Batterie russe de 12 livres', 49.1432, 16.7790, SO, 'art'); addReg('au', 'Batterie autrichienne de 6 livres', 49.1452, 16.7838, SO, 'art');
/* Cavalerie, provisoire : brigade légère Margaron du IVe corps, et quelques escadrons alliés pour essayer les charges. À remplacer par l'ordre de bataille complet. */
addReg('fr', '8e hussards (Margaron)', 49.1460, 16.7330, E, 'cav', 360, 'hussards'); addReg('fr', '26e chasseurs à cheval (Margaron)', 49.1380, 16.7320, E, 'cav', 340, 'chasseurs');
addReg('ru', 'Cosaques', 49.1350, 16.7830, SO, 'cav', 300, 'cosaques'); addReg('au', 'Chevau-légers', 49.1470, 16.7920, SO, 'cav', 400, 'chevau-legers');
}
const SERVANTS = 6, ECART_PIECES = 14;

/* modèles Meshy préparés par outils/convertir_modele.py : un maillage détaillé de près, un allégé de loin */
const HAUT = 1.8 * SC, LOD_DIST = 260;
/* qualité automatique : si la carte graphique peine, les distances de détail raccourcissent (jusqu'à 35 %), et s'allongent quand elle respire */
let detail = 1, tSim = 0;
const MODELES = { fr: soldat(FR, HAUT, withMist), ru: soldat(RU, HAUT, withMist), au: soldat(AU, HAUT, withMist) };
/* cavalerie : un cavalier par camp (cosaque à part) assis sur un cheval de selle ; la grosse cavalerie a un cheval à robe sombre */
const CAVALIERS = { fr: soldat(CAV_FR, HAUT, withMist), ru: soldat(CAV_RU, HAUT, withMist), au: soldat(CAV_AU, HAUT, withMist), cosaque: soldat(COSAQUE, HAUT, withMist) };
const CHEVAUX = { selle: soldat(CHEVAL, HAUT_CHEVAL * SC, withMist), lourd: soldat(CHEVAL, HAUT_CHEVAL * SC, withMist) };
CHEVAUX.lourd.mats.forEach(m => m.color.setHex(ROBE_LOURD)); Object.values(CHEVAUX).forEach(m => m.haut = HAUT_CHEVAL * SC);
const LOURDS = new Set(['cuirassiers', 'carabiniers', 'garde']);
const cleCavalier = r => r.sorte === 'cosaques' || !CAVALIERS[r.camp] ? 'cosaque' : r.camp, cleCheval = r => LOURDS.has(r.sorte) ? 'lourd' : 'selle';

let gClip, gLigne, gDe, gFondu; const FONDU = 0.3; // par figurine : geste en cours, dernière image montrée, pose de départ du fondu et son avancement (s)
let sold, pools = [], provisoire, lointains; // sold : x, z, décalage de pas par figurine
const matCoat = withMist(new THREE.MeshLambertMaterial({ vertexColors: true })), matRest = withMist(new THREE.MeshLambertMaterial({ vertexColors: true }));
const POSTES = [[-1.3, 1.6], [1.3, 1.6], [-1.6, 3.2], [1.6, 3.2], [0, 4.8], [0.6, 7]]; // servants autour de leur pièce
function slot(r, k, out) { // place de la figurine k dans la formation, repère du bataillon (x : front, z : profondeur)
  out[2] = 0; const F = r.max, es = ESP(); if (r.type === 'art') { const P = r.pieces, p = POSTES[Math.floor(k / P) % SERVANTS]; out[0] = ((k % P) - (P - 1) / 2) * ECART_PIECES + p[0]; out[1] = p[1]; return; }
  if (r.type === 'cav') { // cavalerie : deux rangs en ligne, colonne par pelotons ; un cheval prend plus de place
    const cols = r.form === 'ligne' ? Math.ceil(F / 2) : Math.min(F, 8), rows = Math.ceil(F / cols);
    out[0] = ((k % cols) - (cols - 1) / 2) * 1.7 * es; out[1] = (Math.floor(k / cols) - (rows - 1) / 2) * (r.form === 'ligne' ? 4 : 3.6) * Math.max(0.8, es); return;
  }
  if (r.form === 'carre') { // carré creux, trois rangs par face, chaque face regarde vers l'extérieur
    const n = Math.ceil(F / 4), c = Math.ceil(n / 3), s = Math.min(3, Math.floor(k / n)), j = k - s * n;
    const le = ((j % c) - (c - 1) / 2) * 1.4 * es, d = c * 0.7 * es + 2.5 - Math.floor(j / c) * 1.2;
    out[0] = [le, d, -le, -d][s]; out[1] = [-d, le, d, -le][s]; out[2] = s * Math.PI / 2; return;
  }
  if (r.form === 'tirailleurs') { // ordre dispersé sur deux rangs, chacun à sa place approximative
    const cols = Math.ceil(F / 2); out[0] = ((k % cols) - (cols - 1) / 2) * 4 * es + (rnd(k, 21) - 0.5) * 2.5; out[1] = (Math.floor(k / cols) - 0.5) * 8 + (rnd(k, 23) - 0.5) * 3; return;
  }
  const cols = r.form === 'ligne' ? Math.ceil(F / 3) : Math.max(6, Math.ceil(F / 10)), rows = Math.ceil(F / cols); // colonne : une dizaine de rangs de profondeur
  const sx = (r.form === 'ligne' ? 1.6 : 1.5) * es, sz = (r.form === 'ligne' ? 1.9 : 2.4) * Math.max(0.6, es);
  out[0] = ((k % cols) - (cols - 1) / 2) * sx; out[1] = (Math.floor(k / cols) - (rows - 1) / 2) * sz;
}
function front(r) { // largeur du front en mètres
  const F = r.max || figsDe(r), es = ESP(); if (r.type === 'art') return (r.pieces - 1) * ECART_PIECES + 10;
  if (r.type === 'cav') return (r.form === 'ligne' ? Math.ceil(F / 2) : Math.min(F, 8)) * 1.7 * es;
  return r.form === 'ligne' ? F / 3 * 1.6 * es : r.form === 'tirailleurs' ? F / 2 * 4 * es : r.form === 'carre' ? Math.ceil(Math.ceil(F / 4) / 3) * 1.4 * es + 5 : Math.max(6, Math.ceil(F / 10)) * 1.5 * es;
}
function pool(meshes, lignes) { // lignes : par figurine, les deux images d'animation à mélanger (la partie décimale donne le dosage), partagées entre corps et fusil
  meshes.forEach(m => { m.frustumCulled = false; m.instanceMatrix = meshes[0].instanceMatrix; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); if (lignes) m.geometry.setAttribute('aRow', lignes); scene.add(m); });
  const p = { meshes, M: meshes[0].instanceMatrix.array, R: lignes, n: 0 }; pools.push(p); return p;
}
const ligneAnim = n => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); a.setUsage(THREE.DynamicDrawUsage); return a; };
const aPied = r => r.type !== 'cav';
function build() {
  pools.forEach(p => p.meshes.forEach(m => { scene.remove(m); m.dispose(); })); pools = [];
  V.reset(); let f0 = 0; regs.forEach(r => { r.max = figsDe(r); r.f0 = f0; f0 += r.max; r.garnison = null; });
  sold = new Float32Array(f0 * 3); gClip = new Int32Array(f0).fill(-1); gLigne = new Float32Array(f0); gDe = new Float32Array(f0); gFondu = new Float32Array(f0); const somme = f => regs.filter(f).reduce((a, r) => a + r.max, 0);
  const pools2 = (m, n) => { n = Math.max(1, n); m.pPres = pool(m.pres.map((g, i) => new THREE.InstancedMesh(g, m.mats[i], n)), ligneAnim(n)); m.pLoin = pool(m.loin.map((g, i) => new THREE.InstancedMesh(g, m.mats[i], n)), ligneAnim(n)); };
  for (const camp in MODELES) pools2(MODELES[camp], somme(r => r.camp === camp && aPied(r)));
  for (const k in CAVALIERS) pools2(CAVALIERS[k], somme(r => !aPied(r) && cleCavalier(r) === k));
  for (const k in CHEVAUX) pools2(CHEVAUX[k], somme(r => !aPied(r) && cleCheval(r) === k));
  const nP = Math.max(1, somme(r => !MODELES[r.camp] && aPied(r))), nC = Math.max(1, somme(r => !aPied(r)));
  provisoire = pool([new THREE.InstancedMesh(gCoat, matCoat, nP), new THREE.InstancedMesh(gRest, matRest, nP)]); provisoire.coul = true;
  lointains = pool([new THREE.InstancedMesh(gLoin, matCoat, Math.max(1, somme(r => aPied(r))))]); lointains.coul = true;
  lointains.cav = pool([new THREE.InstancedMesh(gLoinCav, matCoat, nC)]); lointains.cav.coul = true;
  [provisoire, lointains, lointains.cav].forEach(p => { p.meshes[0].setColorAt(0, new THREE.Color()); p.C = p.meshes[0].instanceColor.array; });
  regs.forEach((r, ri) => { for (let k = 0; k < r.max; k++) { const i = r.f0 + k;
    sold[i * 3] = r.x; sold[i * 3 + 1] = r.z; sold[i * 3 + 2] = rnd(i, 7); } r.snap = true; // position, et où en est le pas
    r.arrivee = (r.opts.arrivee || 0) * 60; r.reserve = r.arrivee > 0; // renfort : absent jusqu'à son heure
    Object.assign(r, { n: r.reserve ? 0 : r.max, deploi: 0, tirT: 0, moral: 100, etat: 'ok', recharge: rnd(ri, 1) * 20, sousFeu: 99, acc: 0, moving: false, tx: r.x, tz: r.z }, ETAT0()); r.flag.children[1].material.color.setHex(CAMPS[r.camp].coul); r.flag.visible = !r.reserve; });
  horloge = 0; mortsInit();
  canonsInit(); fin = false; const fe = document.getElementById('fin'); if (fe) fe.style.display = 'none';
  document.getElementById('nb').textContent = f0.toLocaleString('fr-FR');
}
/* repère du bataillon -> carte : l'avant regarde (sin f, -cos f), la droite est (cos f, sin f) */
function toWorld(r, lx, lz, out) { const cs = Math.cos(r.face), sn = Math.sin(r.face); out[0] = r.x + lx * cs - lz * sn; out[1] = r.z + lx * sn + lz * cs; }

/* canons : pièce Gribeauval de Meshy (modeles/canon-gribeauval.glb), affût jaune ocre pour les Autrichiens */
const mSC = new THREE.Vector3(SC, SC, SC); let canons = []; // grossis comme les soldats
function canonsInit() { canons.forEach(c => { scene.remove(c); c.dispose(); }); canons = [];
  for (const camp in CAMPS) { const B = regs.filter(r => r.type === 'art' && r.camp === camp); if (!B.length) continue;
    const o = objet(CANON, withMist, camp), mesh = new THREE.InstancedMesh(o.pres, o.mat, Math.max(1, B.reduce((a, r) => a + r.pieces, 0))); mesh.frustumCulled = false; scene.add(mesh); canons.push(mesh);
    let c0 = 0; B.forEach(r => { r.canons = mesh; r.canon0 = c0; c0 += r.pieces; }); } }

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
el.addEventListener('wheel', e => { e.preventDefault(); cam.dist = Math.min(9000, Math.max(3, cam.dist * Math.exp(e.deltaY * 0.0011))); }, { passive: false });
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
  py = Math.max(py, yAt(px, pz) + Math.min(6, 1 + cam.dist * 0.1)); // de près, la caméra descend à hauteur d'homme
  const pr = Math.max(0.15, Math.min(2, cam.dist * 0.04)); if (pr !== camera.near) { camera.near = pr; camera.updateProjectionMatrix(); } // plan proche rapproché avec le zoom
  camera.position.set(px, py, pz); camera.lookAt(cam.x, gy + 1.4, cam.z);
}

/* ===== SOURIS : sélection et ordres ===== */
const ray = new THREE.Raycaster(), m2 = new THREE.Vector2(), boxEl = document.getElementById('box');
function groundAt(cx, cy) { m2.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(m2, camera); const h = ray.intersectObject(ground)[0]; return h ? h.point : null; }
let drag = null;
el.addEventListener('pointerdown', e => {
  el.setPointerCapture(e.pointerId);
  if (e.button === 1 || (e.button === 0 && e.altKey)) drag = { t: 'rot', x: e.clientX, y: e.clientY };
  else if (e.button === 0) drag = { t: 'sel', x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, add: e.shiftKey };
  else if (e.button === 2) { const p = groundAt(e.clientX, e.clientY); if (!p) return; const cible = unitePres(p, o => o.n > 0 && regs.some(r => r.sel && chargeable(r, o)));
    if (cible) attaquer(cible, e.ctrlKey || e.metaKey); else { const il = V.ilotA(p.x, p.z); if (!il || !occuper(il)) order(p); } } // sur un bâtiment : l'occuper, ou le bombarder
});
el.addEventListener('pointermove', e => {
  if (!drag) return;
  if (drag.t === 'rot') { cam.yaw += (e.clientX - drag.x) * 0.005; cam.pitch = Math.max(0.03, Math.min(1.45, cam.pitch + (e.clientY - drag.y) * 0.004)); drag.x = e.clientX; drag.y = e.clientY; }
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
  const S = regs.filter(r => r.sel && libre(r)); if (!S.length) return; S.forEach(r => { sortir(r); r.charge = null; r.testCharge = false; r.cible = null; r.assaut = false; r.versIlot = null; r.portes = null; r.cibleBat = null; });
  const cx = S.reduce((a, r) => a + r.x, 0) / S.length, cz = S.reduce((a, r) => a + r.z, 0) / S.length;
  const f = Math.atan2(p.x - cx, -(p.z - cz)), rx = Math.cos(f), rz = Math.sin(f), fwx = Math.sin(f), fwz = -Math.cos(f);
  S.sort((a, b) => ((a.x - cx) * rx + (a.z - cz) * rz) - ((b.x - cx) * rx + (b.z - cz) * rz));
  const perRow = Math.min(S.length, 6);
  S.forEach((r, i) => { const w = Math.max(45, front(r) + 25), row = Math.floor(i / perRow), k = i % perRow, n = Math.min(perRow, S.length - row * perRow);
    const off = (k - (n - 1) / 2) * w; r.tx = p.x + rx * off - fwx * row * 70; r.tz = p.z + rz * off - fwz * row * 70; r.tface = f; r.moving = true;
    r.tx = Math.max(-WX / 2 + 50, Math.min(WX / 2 - 50, r.tx)); r.tz = Math.max(-WZ / 2 + 50, Math.min(WZ / 2 - 50, r.tz)); });
}
/* attaquer : marcher à portée de tir et faire feu ; avec Ctrl (ou la touche C), charger à la baïonnette */
function attaquer(e, charge) { regs.filter(r => r.sel && libre(r) && chargeable(r, e)).forEach(r => { const assaut = charge || r.type === 'cav'; sortir(r); r.versIlot = null; r.portes = null; r.cibleBat = null; // la cavalerie n'a qu'une manière d'attaquer
  if (assaut && peutCharger(r) && Math.hypot(e.x - r.x, e.z - r.z) < porteeCharge(r)) lancerCharge(r, e); else { r.charge = null; r.cible = e; r.assaut = assaut; } }); hud(); } // trop loin : on s'approche, puis on charge
function charger() { // chaque unité choisie charge l'ennemi le plus proche devant elle, ou celui qu'elle attaquait
  let n = 0; regs.filter(r => r.sel && libre(r)).forEach(r => { if (!peutCharger(r)) return;
    let e = r.cible && chargeable(r, r.cible) && Math.hypot(r.cible.x - r.x, r.cible.z - r.z) < porteeCharge(r) ? r.cible : null;
    if (!e) { let d = porteeCharge(r); for (const o of regs) if (chargeable(r, o)) { const q = Math.hypot(o.x - r.x, o.z - r.z); if (q < d && Math.abs(ecart(cap(r, o), r.face)) < 1.1) { d = q; e = o; } } }
    if (e) { lancerCharge(r, e); n++; } });
  avis(n ? '' : 'Aucun ennemi à portée de charge devant les unités choisies (300 m, 700 m pour la cavalerie), ou unités trop fatiguées, en carré ou en manœuvre.'); hud();
}
function setForm(f) { regs.forEach(r => { if (r.sel && libre(r) && r.type !== 'art' && (r.type === 'inf' || f === 'ligne' || f === 'colonne')) changerForm(r, f); }); hud(); }
function changerForm(r, f) { // changer de formation prend du temps ; pendant ce temps, ni marche ni feu
  if (r.form === f || r.charge || r.garnison || r.portes) return; const d = DUREE_FORM[f] + (r.form === 'tirailleurs' ? 10 : 0) + (r.form === 'ligne' && f === 'carre' ? 10 : 0);
  r.form = f; r.manoeuvre = d * (r.desordre > 0 ? 1.5 : 1) * (r.type === 'cav' ? 0.4 : 1); r.cible = null; // la cavalerie manœuvre vite
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
const CASSE = 0.6;                                                        // une armée se brise quand 60 % de ses hommes sont dans des unités détruites ou en déroute
/* cavalerie : pas, trot, galop de charge sur les 150 derniers mètres ; poids de choc selon l'arme */
const PORTEE_CHARGE_CAV = 700, ELAN_CAV = 150;
const POIDS = { cuirassiers: 1.4, carabiniers: 1.4, garde: 1.3, grenadiers: 1.25, dragons: 1.15, uhlans: 1.1, 'chevau-legers': 1, hussards: 1, chasseurs: 1, cosaques: 0.8 };
const poids = r => POIDS[r.sorte] || 1;
const QUALITE = { garde: 1.3, grenadiers: 1.15, carabiniers: 1.1, cuirassiers: 1.1, leger: 1.05, cosaques: 0.9 }; // élan et tenue des troupes d'élite
const qualite = r => QUALITE[r.sorte] || 1;
const TENUE_CONTRE_CAV = { carre: 3, ligne: 0.6, colonne: 0.8, tirailleurs: 0.25 }; // seul le carré arrête la cavalerie
/* villages : garnison à l'abri (voir couvert dans src/villages-combat.js) qui tire moins, portes à enfoncer avant la mêlée, incendie qui chasse la garnison */
const TIREURS_GARNISON = 0.45, RECHARGE_GARNISON = 9, PORTES = 7, DEFENSE_MURS = 1.2, ASSAUT_MURS = 0.85, FEU_EVACUE = 0.34;
const PORTEE_ART = 900, MITRAILLE = 250, RECHARGE_ART = 30, ARC_ART = 0.45, MISE_EN_BATTERIE = 40, PIVOT = 12;
const hommes = r => Math.round(r.n / (r.max || 1) * r.h0);
const conv = (r, e) => (r.h0 / r.max) / (e.h0 / e.max); // figurines de r -> figurines de e, quand l'échelle diffère d'une unité à l'autre
let iaAllies = true;
const ennemis = (a, b) => (a.camp === 'fr') !== (b.camp === 'fr');
const commandable = r => r.n > 0 && r.etat === 'ok' && !(iaAllies && r.camp !== 'fr');
const ecart = (a, b) => ((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
const cap = (r, e) => Math.atan2(e.x - r.x, -(e.z - r.z)); // direction de r vers e

/* fumée des tirs : voir fumee.js (réutilisable : FUM.fusil, FUM.canon, FUM.salve, FUM.panache) */
const FUM = creerFumee(scene, renderer, camera);
const BOUCHE = [1.42, 0.15, 1.44]; // bouche du fusil en joue : devant le soldat, à sa droite, hauteur (m)

/* morts laissés sur le terrain */
let morts = [];
function mortsInit() {
  morts.forEach(m => { scene.remove(m.mesh); m.mesh.dispose(); }); morts = [];
  const mk = (geo, mat, n, test) => { const mesh = new THREE.InstancedMesh(geo, mat, n); mesh.count = 0; mesh.frustumCulled = false; scene.add(mesh); morts.push({ mesh, test, max: n }); };
  const somme = f => Math.max(1, regs.filter(f).reduce((a, r) => a + r.max, 0));
  for (const camp in MODELES) { const m = MODELES[camp], test = r => r.camp === camp && aPied(r), n = somme(test), g = m.loin[0].clone(), l = ligneAnim(n); l.array.fill(m.clips.attente[0]); g.setAttribute('aRow', l); mk(g, m.mats[0], n, test); }
  mk(gCoat, matCoat, somme(r => !MODELES[r.camp] && aPied(r)), r => !MODELES[r.camp] && aPied(r));
  mk(gCavRest, matRest, somme(r => !aPied(r)), r => !aPied(r)); morts[morts.length - 1].flanc = true; // cheval couché sur le flanc
}
const mM = new THREE.Matrix4(), mQ = new THREE.Quaternion(), mE = new THREE.Euler(), mV = new THREE.Vector3(), mS = new THREE.Vector3(1, 1, 1), mC = new THREE.Color();
function tombe(r, x, z) { const p = morts.find(m => m.test(r)); if (!p || p.mesh.count >= p.max) return;
  if (p.flanc) mE.set(0, Math.random() * 6.28, Math.PI / 2, 'YXZ'); else mE.set(-Math.PI / 2, Math.random() * 6.28, 0, 'YXZ'); mQ.setFromEuler(mE); mV.set(x, yAt(x, z) + (p.flanc ? 0.9 : 0.3), z); mM.compose(mV, mQ, mS);
  const i = p.mesh.count++; p.mesh.setMatrixAt(i, mM); if (!MODELES[r.camp] && !p.flanc) { p.mesh.setColorAt(i, mC.setHex(CAMPS[r.camp].coul)); p.mesh.instanceColor.needsUpdate = true; } p.mesh.instanceMatrix.needsUpdate = true; }

function pertes(e, attendu, tireur, coefMoral) { // retire des figurines, laisse les morts, entame le moral
  e.acc += attendu * (0.6 + Math.random() * 0.8); const tues = Math.min(e.n, Math.floor(e.acc)); e.acc -= tues;
  for (let k = 0; k < tues; k++) { const i = e.f0 + (--e.n); tombe(e, sold[i * 3], sold[i * 3 + 1]); }
  const flanc = Math.abs(ecart(cap(e, tireur), e.face)) > 1.05;         // pris de flanc ou à revers : le moral souffre double
  e.moral -= (tues / e.max * 100 * 1.6 + 1.2) * (flanc && e.form !== 'carre' && !e.garnison ? 2 : 1) * (e.manoeuvre > 0 ? 1.3 : 1) * coefMoral; e.sousFeu = 0; return flanc; // le carré n'a pas de flanc ; une unité en manœuvre est fragile
}
function salve(r, e, d, bout) { // bout : feu à bout portant sur une charge
  const gar = r.garnison, tir = r.form === 'tirailleurs' || !!gar, tireurs = gar ? r.n * TIREURS_GARNISON : r.form === 'ligne' ? r.n * 0.85 : r.form === 'carre' ? r.n / 4 * 0.85 : tir ? r.n * 0.9 : Math.min(r.n, 120 * r.max / r.h0); // en colonne, seuls les premiers rangs tirent ; en carré, une seule face
  let p = tir ? 0.016 - (0.016 - 0.004) * Math.min(1, Math.max(0, (d - 30) / (PORTEE_TIR - 30))) : 0.05 - (0.05 - 0.008) * Math.min(1, Math.max(0, (d - 30) / (PORTEE - 30)));
  if (e.type !== 'art') p *= e.garnison ? V.couvert(e.garnison, hommes(e)) : FORMES[e.form].cible; // derrière les murs,                    // colonne et carré denses, tirailleurs dispersés
  if (e.type === 'art') p *= 0.25;                                      // servants dispersés autour des pièces
  if (tir && r.moving) p *= 0.5;                                        // les tirailleurs tirent en marchant, moins bien
  if (bout) p *= 1.3;
  const coef = tir ? 0.6 : 1;
  if (mist.uMist.value && altAt(e.x, e.z) < 215) p *= 0.5;              // cible dans la brume
  if (altAt(r.x, r.z) - altAt(e.x, e.z) > 4) p *= 1.15;                 // tir depuis la hauteur
  pertes(e, tireurs * p * conv(r, e), r, coef);
  if (gar) V.tir(gar, e.x, e.z, 14); else r.aFumer = tir ? 5 : Math.max(8, Math.min(60, Math.round(tireurs / 6))); // la fumée part à l'affichage : de chaque fusil si les hommes sont dessinés, sinon en nappe le long du front
  r.recharge = (gar ? RECHARGE_GARNISON : tir ? RECHARGE_TIR : RECHARGE) * (0.9 + Math.random() * 0.3); r.tirT = 3; r.tFeu = 0;
}
/* artillerie : boulet de loin, mitraille de près ; il faut voir la cible, donc les crêtes et les contre-pentes comptent */
function enVue(r, e) { const a0 = altAt(r.x, r.z) + 2, a1 = altAt(e.x, e.z) + 2; for (let k = 1; k < 16; k++) { const t = k / 16; if (altAt(r.x + (e.x - r.x) * t, r.z + (e.z - r.z) * t) > a0 + (a1 - a0) * t) return false; } return true; }
function canonnade(r, e, d) {
  const pieces = Math.ceil(r.n / SERVANTS), mitraille = d < MITRAILLE; // une pièce sans servants se tait
  let parPiece = mitraille ? 0.7 + 1.1 * (1 - d / MITRAILLE) : 0.45 * (1 - 0.65 * (d - MITRAILLE) / (PORTEE_ART - MITRAILLE));
  if (e.type === 'art') parPiece *= 0.3; else if (e.garnison) { parPiece *= e.max / 120 * 0.35; const ob = mitraille ? 0 : obusiers(r, pieces); V.bombarde(e.garnison, r.x, r.z, d, mitraille ? 0 : pieces - ob, ob); } else { parPiece *= e.max / 120; if (!mitraille && e.form === 'colonne') parPiece *= 2.2; if (e.form === 'carre') parPiece *= 3.5; if (e.form === 'tirailleurs') parPiece *= 0.3; } // le boulet traverse une colonne dans sa profondeur, et un carré plus encore
  if (mist.uMist.value && altAt(e.x, e.z) < 215) parPiece *= 0.5;
  const flanc = pertes(e, pieces * parPiece, r, 1.5);
  if (flanc && !mitraille && e.type !== 'art' && e.form === 'ligne') pertes(e, pieces * parPiece, r, 0); // enfilade : le boulet prend la ligne dans sa longueur
  fumeeCanons(r, pieces); r.recharge = RECHARGE_ART * (0.9 + Math.random() * 0.25); r.mitraille = mitraille;
}
function fumeeCanons(r, pieces) { const cs = Math.cos(r.face), sn = Math.sin(r.face); // de la bouche de chaque pièce
  for (let g = 0; g < pieces; g++) { const lx = (g - (r.pieces - 1) / 2) * ECART_PIECES, x = r.x + lx * cs + sn * 2.3, z = r.z + lx * sn - cs * 2.3; FUM.canon(x, yAt(x, z) + 1.2 * SC, z, sn, -cs); } }
/* ===== VILLAGES : occuper un îlot, l'enlever à la baïonnette, le bombarder (effets et incendie : src/villages-combat.js) ===== */
const obusiers = (r, pieces) => r.opts.calibre === 'obusier' ? pieces : Math.max(1, Math.round(pieces / 4)); // une batterie compte un obusier pour quatre pièces
function bombarder(r, il, d) { // tir sur les bâtiments : les boulets trouent les toits, les obus mettent le feu ; la garnison souffre peu
  const pieces = Math.ceil(r.n / SERVANTS), ob = obusiers(r, pieces); V.bombarde(il, r.x, r.z, d, pieces - ob, ob);
  if (il.occ && il.occ.n > 0 && ennemis(r, il.occ)) pertes(il.occ, pieces * 0.3 * 0.35 * il.occ.max / 120, r, 1.5);
  fumeeCanons(r, pieces); r.recharge = RECHARGE_ART * (0.9 + Math.random() * 0.25); r.mitraille = false;
}
function entrer(r, il) { il.occ = r; r.garnison = il; r.versIlot = null; r.cible = null; r.assaut = false; r.moving = false; r.x = il.x; r.z = il.z; r.tx = r.x; r.tz = r.z; r.manoeuvre = 0; r.tFeu = 99; }
function sortir(r) { const il = r.garnison; if (!il) return; if (il.occ === r) il.occ = null; r.garnison = null; r.form = 'colonne'; r.desordre = Math.max(r.desordre, 10); } // on ressort par les portes, en désordre
function evacuer(r, e) { const il = r.garnison, a = e ? cap(e, r) : 0; pertes(r, r.n * 0.04, r, 0); r.moral -= 15; sortir(r); r.desordre = 20; // le feu chasse la garnison, du côté opposé à l'ennemi
  r.tx = Math.max(-WX / 2 + 60, Math.min(WX / 2 - 60, il.x + Math.sin(a) * (il.r + 60))); r.tz = Math.max(-WZ / 2 + 60, Math.min(WZ / 2 - 60, il.z - Math.cos(a) * (il.r + 60))); r.tface = a + Math.PI; r.moving = true;
  avis(`${court(r)} évacue ${il.nom} en flammes.`); }
function occuper(il) { // clic droit sur un bâtiment : l'infanterie va l'occuper (ou l'enlever s'il est tenu), l'artillerie le bombarde
  const S = regs.filter(r => r.sel && libre(r)), inf = S.filter(r => r.type === 'inf' && r.sorte !== 'etat-major'), arts = S.filter(r => r.type === 'art'); if (!inf.length && !arts.length) return false;
  const ami = il.occ && !ennemis(S[0], il.occ); let msg = '';
  arts.forEach(r => { if (ami) msg = `${il.nom} est tenu par nos troupes.`; else if (il.ruines >= 1) msg = `${il.nom} n'est plus que ruines.`; else if (Math.hypot(il.x - r.x, il.z - r.z) > PORTEE_ART) msg = `${il.nom} est hors de portée (${PORTEE_ART} m).`; else { r.cibleBat = il; r.cible = null; msg = `${court(r)} bombarde ${il.nom}.`; } });
  const pris = new Set(), bon = (c, r) => !pris.has(c) && c.occ !== r && (c.occ ? ennemis(r, c.occ) : V.libre(c));
  inf.sort((a, b) => Math.hypot(a.x - il.x, a.z - il.z) - Math.hypot(b.x - il.x, b.z - il.z)).forEach(r => { let c = bon(il, r) ? il : null;
    if (!c) { let bd = 240; for (const o of ilots) { const q = Math.hypot(o.x - il.x, o.z - il.z); if (q < bd && o.village === il.village && bon(o, r)) { bd = q; c = o; } } } // les suivants prennent les îlots voisins
    if (!c) { if (r.garnison !== il) msg = il.brule ? `${il.nom} est en flammes.` : il.ruines >= 0.6 ? `${il.nom} n'est plus que ruines.` : msg; return; }
    pris.add(c); sortir(r); r.charge = null; r.testCharge = false; r.portes = null; r.cible = null; r.assaut = false; r.versIlot = c; r.tx = c.x; r.tz = c.z; r.tface = cap(r, c); r.moving = true;
    msg = c.occ ? `${court(r)} va enlever ${c.nom} à la baïonnette.` : `${court(r)} va occuper ${c.nom}.`; });
  avis(msg); hud(); return true;
}
/* charge à la baïonnette : marche, élan à 80 m, puis épreuve des nerfs avant le contact. Le plus souvent, un camp cède avant le choc. */
const peutCharger = r => r.type !== 'art' && r.sorte !== 'etat-major' && r.form !== 'carre' && r.manoeuvre <= 0 && r.fatigue < (r.type === 'cav' ? 60 : 75) && !r.melee && r.etat === 'ok';
const porteeCharge = r => r.type === 'cav' ? PORTEE_CHARGE_CAV : PORTEE_CHARGE;
const chargeable = (r, o) => o.n > 0 && ennemis(r, o) && (o.etat === 'ok' || (r.type === 'cav' && o.etat === 'deroute')) && !(r.type === 'cav' && o.garnison); // la cavalerie n'entre pas dans les maisons ; // la cavalerie sabre aussi les fuyards
function lancerCharge(r, e) { sortir(r); r.versIlot = null; r.portes = null; r.charge = e; r.cible = null; r.testCharge = false; r.moving = true; }
function finCharge(r, desordre) { r.charge = null; r.testCharge = false; r.moving = false; r.tx = r.x; r.tz = r.z; r.desordre = Math.max(r.desordre, desordre); }
function epreuve(r, e) { // le choc a-t-il lieu ? on compare l'élan de l'assaillant à la tenue du défenseur
  const nombre = Math.sqrt(Math.max(1, hommes(r)) / Math.max(1, hommes(e)));
  const rc = r.type === 'cav', ec = e.type === 'cav';
  const att = r.moral * 1.1 * qualite(r) * (rc ? poids(r) : r.form === 'colonne' ? 1.15 : r.form === 'tirailleurs' ? 0.6 : 1) * (1 - r.fatigue / 250) * Math.min(1.6, rc ? Math.max(0.85, nombre) : nombre); // un escadron pèse plus que son nombre
  const flanc = e.form !== 'carre' && e.type !== 'art' && Math.abs(ecart(cap(e, r), e.face)) > 1.05;
  const tenue = e.type === 'art' ? (rc ? 0.6 : 0.8) : ec ? (rc ? poids(e) * (e.charge ? 1 : 0.7) : 1.2) : rc ? TENUE_CONTRE_CAV[e.form] : FORMES[e.form].tenue; // une cavalerie arrêtée reçoit mal une charge
  const def = e.moral * tenue * qualite(e) * (flanc ? 0.5 : 1) * (e.manoeuvre > 0 ? 0.6 : 1) * (e.desordre > 0 ? 0.8 : 1) * (1 - e.fatigue / 250) * (altAt(e.x, e.z) - altAt(r.x, r.z) > 4 ? 1.15 : 1);
  const x = def * (0.75 + Math.random() * 0.5) / att;
  if (x < 0.85) { e.moral = Math.min(e.moral, 15); e.sousFeu = 0; r.moral = Math.min(100, r.moral + 8); finCharge(r, rc ? 20 : 10); return 'cède'; } // le défenseur lâche pied avant le choc
  if (x > 1.25 || r.moral < 40) { r.moral -= 15; finCharge(r, rc ? 30 : 15); if (rc) { const a = cap(e, r); r.tx = r.x + Math.sin(a) * 200; r.tz = r.z - Math.cos(a) * 200; r.tface = r.face; r.moving = true; } return 'échoue'; } // la cavalerie repoussée tourne bride                                                    // l'assaillant hésite et s'arrête
  r.charge = null; r.testCharge = false; r.melee = e; r.choc = 10; e.moral -= 8; if (!e.melee) e.melee = r; e.charge = null; e.cible = null; e.moving = false; return 'mêlée'; // le choc : l'assaillant frappe plus fort les premières secondes
}
function melee(r, e, d, dt) {
  const murs = r.garnison || e.garnison; // combat dans les maisons : l'assaillant reste aux portes, le défenseur tient ses murs
  if (murs) { r.moving = false; if (e.garnison) { r.dedans = Math.min(0.7, r.dedans + dt * 0.07); if ((r.tIlot -= dt) <= 0) { r.tIlot = 0.2; V.bagarre(murs); } } }
  else if (d > MELEE_D) { r.tx = e.x - (e.x - r.x) / d * MELEE_D * 0.9; r.tz = e.z - (e.z - r.z) / d * MELEE_D * 0.9; r.tface = cap(r, e); r.moving = true; } else { r.moving = false; r.tface = cap(r, e); }
  r.fatigue = Math.min(100, r.fatigue + dt * 1.5); r.meleeT += dt;
  if (r.meleeT < 1) return; r.meleeT -= 1; // on règle la mêlée seconde par seconde
  const flanc = e.type !== 'art' && e.form !== 'carre' && !murs && Math.abs(ecart(cap(e, r), e.face)) > 1.05;
  r.choc = Math.max(0, (r.choc || 0) - 1);
  const base = r.type === 'art' ? 0.3 : r.type === 'cav' ? poids(r) * (e.type === 'cav' ? 1 : e.type === 'art' ? 2.5 : e.form === 'carre' ? 0.4 : 3) // le cavalier sabre l'infanterie surprise hors du carré, pas le carré
    : e.type === 'cav' ? (r.form === 'carre' ? 1.6 : 0.5) : r.garnison ? 1 : FORMES[r.form].melee;
  const vigueur = base * (r.garnison ? DEFENSE_MURS : e.garnison ? ASSAUT_MURS : 1) * (flanc ? 1.5 : 1) * (r.choc > 0 ? 1.6 : 1) * (1 - r.fatigue / (r.type === 'cav' ? 400 : 250));
  pertes(e, r.n * conv(r, e) * TAUX_MELEE * vigueur, r, 1.2);
  if (hommes(r) < hommes(e) * 0.8 && r.type !== 'cav') r.moral -= 1; // le plus faible en nombre perd pied (le cavalier compte sur son cheval)
}
function iaCav(r) { // cavalerie alliée : charger ce qui est vulnérable, sinon attendre face à l'ennemi
  let best = null, bs = 0;
  for (const o of regs) { if (!chargeable(r, o)) continue; const q = Math.hypot(o.x - r.x, o.z - r.z); if (q > PORTEE_CHARGE_CAV) continue;
    const flanc = Math.abs(ecart(cap(o, r), o.face)) > 1.05;
    const s = o.etat === 'deroute' ? 3 : o.type === 'cav' ? (q < 450 ? 2 : 0) : o.type === 'art' ? (flanc || o.moving ? 2.5 : 0.3) : o.form === 'carre' ? 0 : (o.form === 'tirailleurs' || o.manoeuvre > 0 || flanc ? 2.5 : o.moral < 60 ? 1.5 : 0.4);
    const v = s * (1 - q / (PORTEE_CHARGE_CAV * 1.3)); if (v > bs) { bs = v; best = o; } }
  if (best && bs > 0.9 && peutCharger(r) && r.desordre <= 0 && r.fatigue < 40 && r.moral > 50) { lancerCharge(r, best); return; }
  const e = r.ennemi; if (e && r.dEnn < 1500 && !r.moving && Math.abs(ecart(cap(r, e), r.face)) > 0.3) { r.tx = r.x; r.tz = r.z; r.tface = cap(r, e); r.moving = true; }
}
function combat(r, dt) {
  const art = r.type === 'art', gar = r.garnison, tir = r.form === 'tirailleurs' || !!gar, portee = art ? PORTEE_ART : tir ? PORTEE_TIR : PORTEE; // la garnison tire à volonté par les fenêtres
  let e = null, d = 1e9; for (const o of regs) if (o.n > 0 && ennemis(r, o)) { const q = Math.hypot(o.x - r.x, o.z - r.z); if (q < d && (o.etat === 'ok' || q < portee)) { d = q; e = o; } }
  r.ennemi = e; r.dEnn = d; r.recharge -= dt; r.sousFeu += dt; r.tirT -= dt; r.tFeu += dt; r.manoeuvre = Math.max(0, r.manoeuvre - dt); r.desordre = Math.max(0, r.desordre - dt);
  if (!r.charge && !r.melee) r.fatigue = Math.max(0, r.fatigue - dt * (r.moving ? 0.1 : 0.5));
  if (r.etat === 'deroute') { // fuite, puis ralliement loin de l'ennemi
    if (!r.moving || d < 250) { const a = e ? cap(e, r) : 0; r.tx = Math.max(-WX / 2 + 60, Math.min(WX / 2 - 60, r.x + Math.sin(a) * 500)); r.tz = Math.max(-WZ / 2 + 60, Math.min(WZ / 2 - 60, r.z - Math.cos(a) * 500)); r.moving = true; }
    if (r.sousFeu > 20) r.moral += dt * 0.9;
    if (r.moral > 45 && d > 350) { r.etat = 'ok'; r.moving = false; r.desordre = 30; r.flag.children[1].material.color.setHex(CAMPS[r.camp].coul); }
    return;
  }
  if (r.sousFeu > 15) r.moral = Math.min(100 * Math.min(1, r.n / r.max + 0.25), r.moral + dt * 0.35);
  if (r.n < r.max * 0.15 || (art && r.moral < 20)) { sortir(r); r.n = 0; r.sel = false; r.flag.visible = false; r.ring.visible = false; return; } // bataillon détruit, ou servants qui abandonnent leurs pièces
  if (r.moral < 20) {
    if (r.melee && r.melee.n > 0) pertes(r, r.n * 0.06, r.melee, 0); // la poursuite fait des victimes dans le dos des fuyards
    sortir(r); // la garnison qui cède ressort par l'arrière
    Object.assign(r, ETAT0(), { fatigue: r.fatigue, issue: r.issue }); r.etat = 'deroute'; r.sel = false; r.form = 'colonne'; r.moving = false; r.flag.children[1].material.color.setHex(0xf2f2f2); return;
  }
  if (gar && (gar.brule > FEU_EVACUE || gar.ruines >= 0.6 || !V.postes(gar).length)) { evacuer(r, e); return; } // l'incendie force la garnison à sortir
  if (r.melee) { // mêlée : on se bat jusqu'à ce qu'un camp cède ; le vainqueur doit se reformer
    let m = r.melee; if (m.n <= 0 || m.etat !== 'ok') { m = r.melee = regs.find(o => o.melee === r && o.n > 0 && o.etat === 'ok') || null; if (!m) { r.moving = false; r.tx = r.x; r.tz = r.z; r.desordre = 12; r.moral = Math.min(100, r.moral + 6); r.dedans = 0;
        const il = r.meleeIlot; r.meleeIlot = null; if (il && !gar && V.libre(il)) entrer(r, il); return; } } // l'assaillant vainqueur s'installe dans l'îlot conquis
    melee(r, m, Math.hypot(m.x - r.x, m.z - r.z), dt); return;
  }
  if (r.charge) { const c = r.charge, dc = Math.hypot(c.x - r.x, c.z - r.z);
    if (!chargeable(r, c) || dc > porteeCharge(r) + 120 || r.fatigue >= 100) { finCharge(r, 8); return; } // cible enfuie ou hors d'atteinte : on s'arrête
    r.fatigue = Math.min(100, r.fatigue + dt * (r.type === 'cav' ? (dc < ELAN_CAV ? 1.5 : 0.2) : dc < ELAN ? 1 : 0.3)); r.tx = c.x; r.tz = c.z; r.tface = cap(r, c); r.moving = true;
    if (c.etat === 'deroute') { if (dc < 25) { pertes(c, Math.min(c.n, r.n * conv(r, c) * 0.35), r, 0); c.moral -= 10; r.issue = 'sabre'; finCharge(r, 25); } return; } // les fuyards sont sabrés
    if (c.garnison) { // pas d'épreuve des nerfs contre des murs : on court aux portes
      if (dc < c.garnison.r + 10) { if (r.moral < 35) { r.moral -= 10; r.issue = 'échoue'; finCharge(r, 15); } else { r.charge = null; r.testCharge = false; r.moving = false; r.tx = r.x; r.tz = r.z; r.issue = null; r.portes = { e: c, il: c.garnison, t: PORTES, c: 0 }; } }
      return; }
    if (dc < 45 && !r.testCharge) { r.testCharge = true; r.issue = epreuve(r, c); }
    return;
  }
  if (r.portes) { const c = r.portes.e, il = r.portes.il; // on enfonce les portes à coups de crosse, sous le feu des fenêtres
    if (c.garnison !== il || c.n <= 0 || c.etat !== 'ok') { r.portes = null; r.desordre = 6; if (V.libre(il)) r.versIlot = il; return; } // la garnison a filé : la place est à prendre
    r.portes.t -= dt; r.fatigue = Math.min(100, r.fatigue + dt); r.moving = false;
    if ((r.portes.c -= dt) <= 0) { r.portes.c = 0.3; V.coups(il, r.x, r.z); }
    if (r.moral < 30) { const a = cap(c, r); r.portes = null; r.issue = 'échoue'; r.desordre = 15; r.tx = r.x + Math.sin(a) * 90; r.tz = r.z - Math.cos(a) * 90; r.tface = r.face; r.moving = true; return; } // l'assaut reflue
    if (r.portes.t <= 0) { V.enfonce(il, r.x, r.z); r.portes = null; r.melee = c; r.meleeIlot = il; r.meleeT = 0; r.choc = 6; r.dedans = 0; r.tIlot = 0; c.moral -= 6; if (!c.melee) c.melee = r; c.cible = null; }
    return;
  }
  // feu à bout portant : une unité chargée garde sa salve pour l'assaillant, s'il est devant elle
  const cav = r.type === 'cav';
  if (!art && !cav && r.manoeuvre <= 0 && r.desordre <= 0 && r.recharge < 4) for (const o of regs) if ((o.charge === r || (o.portes && o.portes.e === r)) && o.n > 0) { const q = Math.hypot(o.x - r.x, o.z - r.z);
    if (q < (gar ? gar.r + 60 : 60) && (gar || r.form === 'carre' || Math.abs(ecart(cap(r, o), r.face)) < 1.2)) { salve(r, o, q, true); break; } }
  if (r.cible) { const c = r.cible, dc = Math.hypot(c.x - r.x, c.z - r.z), reste = art ? 600 : tir ? 160 : r.assaut ? 0 : 100; // attaquer : se placer à portée, face à la cible
    if (!chargeable(r, c)) r.cible = null;
    else if (r.assaut && peutCharger(r) && r.desordre <= 0 && dc < (cav ? porteeCharge(r) * 0.9 : 150)) { lancerCharge(r, c); return; }
    else if (c.etat !== 'ok') r.cible = null;
    else if (r.manoeuvre <= 0) { if (dc > reste + 25) { r.tx = c.x - (c.x - r.x) / dc * reste; r.tz = c.z - (c.z - r.z) / dc * reste; r.tface = cap(r, c); r.moving = true; }
      else if (Math.abs(ecart(cap(r, c), r.face)) > 0.3 && !r.moving) { r.tx = r.x; r.tz = r.z; r.tface = cap(r, c); r.moving = true; } }
  }
  if (r.versIlot) { const il = r.versIlot, di = Math.hypot(il.x - r.x, il.z - r.z); // en route vers un îlot à occuper
    if (il.occ && il.occ !== r) { r.versIlot = null; if (ennemis(r, il.occ)) { r.cible = il.occ; r.assaut = true; } else { r.moving = false; r.tx = r.x; r.tz = r.z; } } // tenu par l'ennemi : on l'enlève à la baïonnette
    else if (!V.libre(il)) { r.versIlot = null; r.moving = false; r.tx = r.x; r.tz = r.z; }
    else if (di < il.r + 12) entrer(r, il);
    else if (!r.moving && r.manoeuvre <= 0) { r.tx = il.x; r.tz = il.z; r.tface = cap(r, il); r.moving = true; }
    return; }
  if (iaAllies && r.camp !== 'fr' && r.type === 'inf' && r.sorte !== 'etat-major' && !gar && !r.cible && e && d < 800 && d > 220 && (r.tIlot -= dt) <= 0) { // IA : se retrancher dans le village voisin quand l'ennemi approche
    r.tIlot = 3 + Math.random() * 2; let best = null, bd = 260;
    for (const il of ilots) { const q = Math.hypot(il.x - r.x, il.z - r.z); if (q < bd && V.libre(il) && V.places(il) >= hommes(r) * 0.4 && !regs.some(o => o.versIlot === il)) { bd = q; best = il; } }
    if (best) { r.versIlot = best; r.tx = best.x; r.tz = best.z; r.tface = cap(r, best); r.moving = true; return; } }
  if (iaAllies && r.camp !== 'fr' && cav) { iaCav(r); return; }
  if (iaAllies && r.camp !== 'fr' && !art && !gar && r.manoeuvre <= 0 && !r.melee) { // l'infanterie forme le carré quand la cavalerie menace, et le rompt ensuite
    let dc = 1e9; for (const o of regs) if (o.type === 'cav' && o.n > 0 && o.etat === 'ok' && ennemis(r, o)) dc = Math.min(dc, Math.hypot(o.x - r.x, o.z - r.z) - (o.charge === r ? 200 : 0));
    if (dc < 350 && r.form !== 'carre') { changerForm(r, 'carre'); return; } if (r.form === 'carre' && dc > 700) changerForm(r, 'ligne'); }
  if (iaAllies && r.camp !== 'fr' && !gar && r.form !== 'carre' && e && d < (art ? PORTEE_ART : 450)) { // IA : faire face à la menace, charger un ennemi ébranlé
    if (!art && e.etat === 'ok' && e.type !== 'art' && d < 160 && peutCharger(r) && r.desordre <= 0 && r.moral > 55 && r.fatigue < 50 && (e.moral < 45 || e.manoeuvre > 0 || e.form === 'tirailleurs')) { lancerCharge(r, e); return; }
    if (!art && r.form !== 'ligne' && d > 140 && r.manoeuvre <= 0) changerForm(r, 'ligne');
    if (r.manoeuvre <= 0 && Math.abs(ecart(cap(r, e), r.face)) > (art ? 0.3 : 0.25) && !r.moving) { r.tx = r.x; r.tz = r.z; r.tface = cap(r, e); r.moving = true; } }
  if (art && r.cibleBat) { const il = r.cibleBat, di = Math.hypot(il.x - r.x, il.z - r.z), da = ecart(cap(r, il), r.face); if (!r.moving) r.deploi -= dt; // ordre de bombarder un îlot
    if (il.ruines >= 1 || di > PORTEE_ART + 50 || (il.occ && !ennemis(r, il.occ))) r.cibleBat = null;
    else { r.voit = enVue(r, il); if (Math.abs(da) > ARC_ART * 0.6 && !r.moving) { r.tx = r.x; r.tz = r.z; r.tface = cap(r, il); r.moving = true; }
      if (r.voit && !r.moving && r.deploi <= 0 && r.recharge <= 0 && Math.abs(da) < ARC_ART) bombarder(r, il, di); return; } }
  if (art) { if (!r.moving) r.deploi -= dt; r.voit = !!e && d < PORTEE_ART && enVue(r, e);
    if (r.voit && !r.moving && r.deploi <= 0 && r.recharge <= 0 && Math.abs(ecart(cap(r, e), r.face)) < ARC_ART) canonnade(r, e, d); return; }
  if (cav) return; // la cavalerie ne tire pas : elle charge
  if (e && r.manoeuvre <= 0 && r.desordre <= 0 && r.recharge <= 0 && (!r.moving || tir) && (d < portee) && (gar || r.form === 'carre' || Math.abs(ecart(cap(r, e), r.face)) < (tir ? ARC_TIR : ARC))) salve(r, e, d);
}

/* ===== SIMULATION : on déplace le bataillon, les figurines rejoignent leur place ===== */
const AVANCE = 0.3, ETALE = 0.22; // la mise en joue et le feu ne sont pas parfaitement ensemble : écarts d'un homme à l'autre (s)
const D = c => (c[1] - 1) / c[2]; // durée d'un geste joué une seule fois (joue, feu, rechargement)
const tmp = [0, 0, 0]; let tAnim = 0; const champ = new THREE.Frustum(), mChamp = new THREE.Matrix4(), sphere = new THREE.Sphere();
function sim(dt) {
  const t = performance.now() / 1000; pools.forEach(p => p.n = 0);
  camera.updateMatrixWorld(); champ.setFromProjectionMatrix(mChamp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const dAnim = speed > 0 ? dt / speed * Math.min(speed, 2.5) : 0; tAnim += dAnim; // les jambes ne s'emballent pas en accéléré
  const dReel = speed > 0 ? dt / speed : 0;
  horloge += dt;
  regs.forEach((r, ri) => {
    if (r.reserve && horloge >= r.arrivee) { r.reserve = false; r.n = r.max; r.snap = true; r.flag.visible = true; avis(`Renforts : ${r.opts.corps || r.nom} entre en ligne.`); } // le renfort arrive
    if (r.n <= 0) return;
    if (dt > 0) combat(r, dt);
    if (r.n <= 0) return;
    const fuite = r.etat === 'deroute'; let avance = r.moving && Math.hypot(r.tx - r.x, r.tz - r.z) > 0.5; // le bataillon est en route : ses hommes marchent, même en pause
    if (r.manoeuvre > 0 && !fuite) avance = false; // en pleine manœuvre, on ne marche pas : l'ordre attend
    else if (r.moving && dt > 0) {
      const dx = r.tx - r.x, dz = r.tz - r.z, d = Math.hypot(dx, dz);
      const pente = Math.max(0, (altAt(r.x + dx / (d || 1) * 20, r.z + dz / (d || 1) * 20) - altAt(r.x, r.z)) / 20);
      if (r.type === 'art') r.deploi = d > 1 ? MISE_EN_BATTERIE : Math.max(r.deploi, PIVOT); // bouger oblige à remettre en batterie, pivoter coûte moins
      const v = fuite ? (r.type === 'cav' ? 6 : 2.8) : r.type === 'art' ? 1.2 * (1 - Math.min(0.65, pente * 6)) : (r.type === 'cav' ? (r.charge ? (d < ELAN_CAV || r.charge.etat !== 'ok' ? 8 : 4.5) : 3.5) * (1 - Math.min(0.4, pente * 3)) : r.charge ? (d - (r.charge.garnison ? r.charge.garnison.r : 0) < ELAN ? 3.5 : 2) * (1 - Math.min(0.35, pente * 3)) : FORMES[r.form].v * (1 - Math.min(0.5, pente * 4))) * (1 - r.fatigue / 300); // la ligne marche moins vite, la montée ralentit, la fatigue aussi
      const want = d > 15 ? Math.atan2(dx, -dz) : r.tface, da = ecart(want, r.face);
      r.face += Math.sign(da) * Math.min(Math.abs(da), (fuite || r.type === 'cav' ? 1.2 : r.charge || r.melee ? 0.7 : r.form === 'carre' ? 0.6 : 0.35) * dt);
      const bloque = !fuite && !r.charge && !r.melee && r.ennemi && r.dEnn < CONTACT && Math.abs(ecart(cap(r, r.ennemi), Math.atan2(dx, -dz))) < 1.2; // sans ordre de charge, on s'arrête au contact
      if (bloque) r.moving = false;
      else if (d > 0.5) { const st = Math.min(d, v * dt * (Math.abs(da) > 0.6 && !r.charge ? 0.3 : 1)); r.x += dx / d * st; r.z += dz / d * st; avance = true; }
      else if (fuite || Math.abs(da) < 0.01) r.moving = false;
    }
    const cav = r.type === 'cav', cs = Math.cos(r.face), sn = Math.sin(r.face), vmax = (cav ? (r.charge ? 9 : fuite ? 7 : 4.5) : fuite || r.charge ? 4.2 : 2.6) * dt, course = fuite || (r.charge && r.dEnn - (r.charge.garnison ? r.charge.garnison.r : 0) < ELAN);
    const dCam = Math.hypot(camera.position.x - r.x, camera.position.z - r.z, camera.position.y - yAt(r.x, r.z)), loin = dCam > LOIN_DIST * detail;
    const md = loin ? null : cav ? CHEVAUX[cleCheval(r)] : MODELES[r.camp], proche = dCam < LOD_DIST * detail, P = loin ? (cav ? lointains.cav : lointains) : !md ? provisoire : proche ? md.pPres : md.pLoin, M = P.M;
    const mc = cav && !loin ? CAVALIERS[cleCavalier(r)] : null, P2 = mc && (proche ? mc.pPres : mc.pLoin); // le cavalier, sur la selle de son cheval
    const cAvC = mc && (avance && (r.charge || fuite) ? mc.clips.course : mc.clips.attente);
    // gestes de l'infanterie : 1 feu de salve, 2 baïonnette croisée (charge), 3 mêlée, 4 feu à volonté des tirailleurs
    const gar = r.garnison, ilA = gar ? null : r.portes ? r.portes.il : r.melee && r.melee.garnison ? r.melee.garnison : null; // îlot tenu, îlot attaqué
    const postes = gar && V.postes(gar), cibles = ilA && V.proches(ilA, r.x, r.z, 3);
    let geste = 0; if (md && md.clips.joue && !cav && r.type !== 'art' && !fuite) geste = r.melee || r.portes ? 3 : r.charge ? 2 : gar ? (r.tFeu < 14 ? 4 : 0) : avance || r.manoeuvre > 0 || r.desordre > 0 ? 0 : r.form === 'tirailleurs' ? (r.tFeu < 12 ? 4 : 0) : 1;
    const enJoue = geste === 1 && r.recharge < D(md.clips.joue) + AVANCE && r.ennemi && r.dEnn < PORTEE && (r.form === 'carre' || Math.abs(ecart(cap(r, r.ennemi), r.face)) < ARC);
    const rangs = r.form === 'colonne' ? 2 * Math.max(6, Math.ceil(r.max / 10)) : 1e9; // en colonne, seuls les deux premiers rangs tirent
    sphere.center.set(r.x, yAt(r.x, r.z), r.z); sphere.radius = gar ? gar.r + 25 : ilA ? ilA.r * 2 + 40 : (r.type === 'art' ? 60 : front(r) / 2 + 40) * (fuite ? 2 : 1);
    const vu = champ.intersectsSphere(sphere); if (!vu) r.snap = true; // hors du champ de la caméra : rien à dessiner, les hommes reprendront leur place en revenant
    const feuVu = r.tFeu < r.tFeuVu ? -1 : r.tFeuVu; r.tFeuVu = r.tFeu; // où en était le feu à l'image précédente : chaque coup ne fume qu'une fois
    if (r.aFumer) { if (!(vu && (geste === 1 || geste === 4))) { const w = r.form === 'carre' ? 10 : front(r), fx = r.x + sn * 4, fz = r.z - cs * 4; FUM.salve(fx, yAt(fx, fz) + 1.5 * SC, fz, sn, -cs, w, r.aFumer); } r.aFumer = 0; }
    for (let k = 0; vu && k < r.n; k++) {
      const i = r.f0 + k; let tourne = 0, cache = false; // cache : la figurine entre dans un bâtiment et ne se dessine plus une fois la porte passée
      if (gar) { const p = postes[k]; // garnison : quelques hommes aux angles des maisons, les autres à l'intérieur
        if (p) { tmp[0] = p.x; tmp[1] = p.z; tourne = (r.ennemi && r.dEnn < 400 ? Math.atan2(r.ennemi.x - p.x, -(r.ennemi.z - p.z)) : p.a) - r.face || 1e-6; }
        else if (gar.bats.length) { const b = gar.bats[k % gar.bats.length]; tmp[0] = b.px; tmp[1] = b.pz; cache = true; } }
      else if (ilA && cibles.length) { const b = cibles[k % cibles.length]; cache = !!r.melee && rnd(i, 41) < r.dedans; // assaut : on se presse aux portes, puis on s'engouffre
        V.mur(b, r.x + (rnd(i, 45) - 0.5) * 14, r.z + (rnd(i, 47) - 0.5) * 14, tmp, cache ? 0.2 : 0.7 + rnd(i, 43) * 3 + Math.sin(t * 1.1 + rnd(i, 17) * 6.3) * 0.5);
        tourne = Math.atan2(b.x - tmp[0], -(b.z - tmp[1])) - r.face || 1e-6; }
      else { slot(r, k, tmp); tourne = tmp[2]; if (fuite) { tmp[0] += (rnd(i, 11) - 0.5) * 9; tmp[1] += (rnd(i, 13) - 0.5) * 9; }
        if (r.melee) { tmp[0] += Math.sin(t * 0.9 + rnd(i, 17) * 6.3) * 1.6; tmp[1] += Math.sin(t * 1.3 + rnd(i, 19) * 6.3) * 1.6 - 3; } // mêlée : les rangs se brisent et se poussent
        toWorld(r, tmp[0], tmp[1], tmp); }
      let x = sold[i * 3], z = sold[i * 3 + 1]; const ex = tmp[0] - x, ez = tmp[1] - z, e = Math.hypot(ex, ez); let bob = 0, fait = 0, tire = false;
      if (r.snap) { x = tmp[0]; z = tmp[1]; if (cache) { sold[i * 3] = x; sold[i * 3 + 1] = z; continue; } }
      else if (cache && e < 1.3) continue;
      else if (e > 1e-4 && dt > 0) { const st = Math.min(e, vmax * (0.8 + rnd(i, 5) * 0.4)); x += ex / e * st; z += ez / e * st; fait = st; if (!md) bob = Math.abs(Math.sin(t * (cav ? 4 + st / dt : 6) * Math.min(speed, 3) + sold[i * 3 + 2])) * (cav ? 0.18 : 0.12) * SC; }
      if (md) { // en marche, l'animation avance avec le chemin réellement parcouru : les pieds ne glissent pas
        const C = md.clips, bouge = e > 0.25 || avance; let c = C.attente, pos = -1, boucle = true; tire = false; // pos < 0 : boucle d'attente, ou marche
        if (geste === 3 && !((ilA || gar) && e > 1.2)) c = C.estoc;       // mêlée : coups de baïonnette (et de crosse dans les portes)
        else if (geste === 2) { if (bouge) c = course ? C.assaut : C.charge; else { c = C.estoc; pos = 0; } } // charge : baïonnette croisée
        else if (bouge) c = course || cav ? C.course : C.marche;         // le cheval qui suit son escadron prend le galop
        else if (geste === 1 && k < rangs) { boucle = false;             // feu de salve : joue, feu, puis chacun recharge à son rythme
          const dj = D(C.joue), tf = r.tFeu - rnd(i, 39) * ETALE;          // le feu roule le long du rang : chacun a son petit retard
          if (enJoue) { c = C.joue; pos = Math.max(0, dj + AVANCE - Math.max(0, r.recharge) - rnd(i, 37) * AVANCE) * c[2]; }
          else if (tf < 0) { c = C.joue; pos = dj * c[2]; }
          else if (tf < D(C.feu)) { c = C.feu; pos = tf * c[2]; tire = feuVu - rnd(i, 39) * ETALE < 0; }
          else { const tr = (tf - D(C.feu) - rnd(i, 31) * 0.8) * (0.85 + rnd(i, 33) * 0.3); if (tr < D(C.recharge)) { c = C.recharge; pos = Math.max(0, tr) * c[2]; } else boucle = true; } }
        else if (geste === 4) { const dj = D(C.joue), df = D(C.feu), dr = D(C.recharge), T = dj + df + dr + 3, ts = (tAnim + rnd(i, 35) * T) % T; // tirailleurs : feu à volonté, chacun son tour
          if (ts < dj + df + dr) { boucle = false; if (ts < dj) { c = C.joue; pos = ts * c[2]; } else if (ts < dj + df) { c = C.feu; pos = (ts - dj) * c[2]; tire = ts - dAnim < dj; } else { c = C.recharge; pos = (ts - dj - df) * c[2]; } } }
        if (pos < 0) { if (c[3] < 0.05) pos = (tAnim * c[2] + rnd(i, 7) * 40) % c[1]; // sur place
          else { let pas = fait / (c[3] * (md.haut || HAUT)); if (cav) pas = Math.min(pas, dAnim * c[2] / c[1] * 1.6); // à la charge, les jambes ne moulinent pas : le sabot glisse un peu
            sold[i * 3 + 2] = (sold[i * 3 + 2] + pas) % 1; pos = sold[i * 3 + 2] * c[1]; } }
        if (!boucle) pos = Math.min(pos, c[1] - 1);
        const ia = Math.floor(pos) % c[1], o4 = P.n * 4, R = P.R.array, li = c[0] + ia + Math.min(0.999, pos - Math.floor(pos)); R[o4] = li; R[o4 + 1] = c[0] + (boucle ? (ia + 1) % c[1] : Math.min(ia + 1, c[1] - 1));
        // le geste change : fondu depuis la dernière pose montrée, figée (pas de saut d'une pose à l'autre)
        if (r.snap || gClip[i] < 0) gFondu[i] = 9; else if (gClip[i] !== c[0]) { gDe[i] = Math.round(gLigne[i]); gFondu[i] = 0; }
        gClip[i] = c[0]; gLigne[i] = li; const w = gFondu[i] / FONDU; gFondu[i] += dReel; R[o4 + 2] = gDe[i]; R[o4 + 3] = w >= 1 ? 1 : w * w * (3 - 2 * w); }
      sold[i * 3] = x; sold[i * 3 + 1] = z;
      if (P.coul) { const h = CAMPS[r.camp].lin || (CAMPS[r.camp].lin = new THREE.Color(CAMPS[r.camp].coul)), v = 0.85 + rnd(i, 3) * 0.3; P.C[P.n * 3] = h.r * v; P.C[P.n * 3 + 1] = h.g * v; P.C[P.n * 3 + 2] = h.b * v; } // couleur du camp
      const o = P.n++ * 16, fc = tourne ? Math.cos(r.face + tourne) : cs, fs = tourne ? Math.sin(r.face + tourne) : sn; // rotation autour de la verticale puis position ; en carré, chaque face regarde dehors
      if (tire) FUM.fusil(x + fs * BOUCHE[0] * SC + fc * BOUCHE[1] * SC, yAt(x, z) + BOUCHE[2] * SC, z - fc * BOUCHE[0] * SC + fs * BOUCHE[1] * SC, fs, -fc, 0.6, r.n > 150); // la fumée sort de son fusil, à l'instant du coup
      M[o] = fc; M[o + 1] = 0; M[o + 2] = fs; M[o + 3] = 0; M[o + 4] = 0; M[o + 5] = 1; M[o + 6] = 0; M[o + 7] = 0;
      M[o + 8] = -fs; M[o + 9] = 0; M[o + 10] = fc; M[o + 11] = 0; M[o + 12] = x; M[o + 13] = yAt(x, z) + bob; M[o + 14] = z; M[o + 15] = 1;
      if (P2) { const pos = (tAnim * cAvC[2] + rnd(i, 9) * 40) % cAvC[1], ia = Math.floor(pos); P2.R.array[P2.n * 4] = cAvC[0] + ia + Math.min(0.999, pos - ia); P2.R.array[P2.n * 4 + 1] = cAvC[0] + (ia + 1) % cAvC[1]; P2.R.array[P2.n * 4 + 3] = 1; P2.M.set(M.subarray(o, o + 16), P2.n++ * 16); }
    }
    if (vu) r.snap = false;
    const gy = yAt(r.x, r.z); r.flag.position.set(r.x, gy, r.z); r.flag.rotation.y = -r.face; { const dC = Math.hypot(camera.position.x - r.x, camera.position.y - gy, camera.position.z - r.z); r.flag.scale.setScalar(dC < 60 ? 0.001 : Math.min(1, dC / 300)); } // le drapeau de repère rapetisse quand on approche et disparaît à moins de 60 m
    if (r.type === 'art') for (let g = 0; g < r.pieces; g++) { toWorld(r, (g - (r.pieces - 1) / 2) * ECART_PIECES, 0, tmp); mE.set(0, -r.face, 0); mQ.setFromEuler(mE); mV.set(tmp[0], yAt(tmp[0], tmp[1]), tmp[1]); r.canons.setMatrixAt(r.canon0 + g, mM.compose(mV, mQ, mSC)); }
    const rad = r.type === 'art' ? 36 : r.form === 'colonne' ? 22 : gar ? gar.r + 4 : r.form === 'carre' ? front(r) * 0.75 + 6 : front(r) / 2 + 8; r.ring.visible = r.sel; r.ring.position.set(r.x, gy + 1.5, r.z); r.ring.scale.set(rad, 1, rad);
  });
  pools.forEach(p => { p.meshes.forEach(m => m.count = p.n); if (!p.n) return; // n'envoyer à la carte graphique que la partie utilisée des tampons (ils sont dimensionnés pour toute l'armée)
    const env = (att, k) => { att.clearUpdateRanges(); att.addUpdateRange(0, p.n * k); att.needsUpdate = true; };
    env(p.meshes[0].instanceMatrix, 16); if (p.R) env(p.R, 4); if (p.coul) env(p.meshes[0].instanceColor, 3); });
  canons.forEach(c => c.instanceMatrix.needsUpdate = true);
  FUM.maj(dt); V.maj(dt);
}

/* ===== INTERFACE ===== */
const ETATS = { ok: 'en bon ordre', deroute: 'en déroute' };
function etatArt(r) { return r.cibleBat && !r.moving && r.deploi <= 0 ? (r.voit ? `<b>bombarde</b> ${r.cibleBat.nom}` : `${r.cibleBat.nom} masqué par le relief`) : r.moving ? (Math.hypot(r.tx - r.x, r.tz - r.z) > 1 ? 'attelée, en marche' : 'pivote') : r.deploi > 0 ? `mise en batterie (${Math.ceil(r.deploi)} s)` : !r.ennemi || r.dEnn > PORTEE_ART ? 'en batterie, pas de cible' : !r.voit ? 'en batterie, cible masquée par le relief' : Math.abs(ecart(cap(r, r.ennemi), r.face)) > ARC_ART ? 'en batterie, cible hors de l\'axe' : `tire à ${r.dEnn < MITRAILLE ? 'mitraille' : 'boulet'} à ${Math.round(r.dEnn)} m`; }
const court = r => r.nom.split(',')[0];
function etatInf(r) {
  if (r.etat !== 'ok') return ETATS[r.etat];
  if (r.melee && (r.garnison || r.melee.garnison)) return `<b>combat dans les maisons</b> contre ${court(r.melee)}`;
  if (r.melee) return `<b>en mêlée</b> contre ${court(r.melee)}`;
  if (r.portes) return `<b>enfonce les portes</b> (${r.portes.il.nom})`;
  if (r.garnison) return `<b>retranché</b> dans ${r.garnison.nom}${r.garnison.brule ? ', qui brûle' : ''}`;
  if (r.versIlot) return `va occuper ${r.versIlot.nom}`;
  if (r.charge) return `<b>charge à la baïonnette</b> sur ${court(r.charge)}`;
  if (r.manoeuvre > 0) return `prend la formation (${Math.ceil(r.manoeuvre)} s)`;
  if (r.desordre > 0) return `${r.issue === 'échoue' ? 'charge repoussée, ' : ''}se reforme (${Math.ceil(r.desordre)} s)`;
  if (r.cible) return `attaque ${court(r.cible)}`;
  return ETATS[r.etat];
}
let fin = false;
function bilan() { // une armée dont la plupart des unités sont détruites ou en fuite est battue
  if (fin) return; const casse = f => { const R = regs.filter(r => f(r) && !r.reserve), tot = R.reduce((a, r) => a + r.h0, 0); return R.filter(r => r.n <= 0 || r.etat !== 'ok').reduce((a, r) => a + r.h0, 0) / tot; };
  const fr = casse(r => r.camp === 'fr'), al = casse(r => r.camp !== 'fr'); if (fr < CASSE && al < CASSE) return;
  fin = true; const e = document.getElementById('fin'); e.innerHTML = al >= CASSE ? '<b>Victoire française</b><br>Les Alliés sont rejetés du plateau.' : '<b>Défaite</b><br>Le IVe corps est brisé.'; e.style.display = 'block';
}
function hud() {
  const S = regs.filter(r => r.sel && r.n > 0), e = document.getElementById('sel');
  if (!S.length) e.innerHTML = '<i>Aucune unité sélectionnée</i>';
  else if (S.length === 1) { const r = S[0]; e.innerHTML = r.type === 'art' ? `<b>${r.nom}</b><br>${Math.ceil(r.n / SERVANTS)} pièces · ${hommes(r)} hommes · moral ${Math.max(0, Math.round(r.moral))} · ${etatArt(r)}`
    : `<b>${r.nom}</b><br>${hommes(r)} ${r.type === 'cav' ? 'cavaliers' : 'hommes'} · moral ${Math.max(0, Math.round(r.moral))} · ${r.garnison ? 'à couvert' : 'en ' + FORMES[r.form].nom} · ${etatInf(r)}${r.fatigue >= 15 ? ' · fatigue ' + Math.round(r.fatigue) : ''}${r.dEnn < PORTEE_TIR ? ' · ennemi à ' + Math.round(r.dEnn) + ' m' : ''}`; }
  else e.innerHTML = `<b>${S.length} unités</b> · ${S.reduce((a, r) => a + hommes(r), 0)} hommes · moral moyen ${Math.round(S.reduce((a, r) => a + Math.max(0, r.moral), 0) / S.length)}<br>` + [...new Set(S.map(r => r.nom.split(',')[0]))].slice(0, 6).join(' · ');
  const tot = f => { const R = regs.filter(f); return `${R.reduce((a, r) => a + hommes(r), 0)} h. <small>(${R.filter(r => r.n > 0 && r.etat === 'ok').length}/${R.length} unités)</small>`; };
  document.getElementById('forces').innerHTML = `France ${tot(r => r.camp === 'fr')}<br>Alliés ${tot(r => r.camp !== 'fr')}`; bilan();
}
['ligne', 'colonne', 'carre', 'tirailleurs'].forEach(f => document.getElementById(f).onclick = () => setForm(f)); document.getElementById('charger').onclick = charger;
document.getElementById('fin').onclick = e => e.currentTarget.style.display = 'none';
document.querySelectorAll('[data-v]').forEach(b => b.onclick = () => setSpeed(+b.dataset.v));
document.getElementById('brume').onclick = e => { mist.uMist.value = mist.uMist.value ? 0 : 0.85; e.target.classList.toggle('on', !!mist.uMist.value); };
document.getElementById('ia').onclick = e => { iaAllies = !iaAllies; e.target.classList.toggle('on', iaAllies); regs.forEach(r => r.sel = false); hud(); };
document.getElementById('figs').onchange = e => { ECHELLE = +e.target.value; build(); };
const selB = document.getElementById('bataille'); selB.value = BATAILLE; selB.onchange = () => { location.search = selB.value === 'austerlitz' ? '?bataille=austerlitz' : ''; };
document.getElementById('aide').onclick = () => document.getElementById('touches').classList.toggle('cache');
function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize(); build(); hud(); setSpeed(1);

let last = performance.now(), fN = 0, fT = 0;
function loop(now) {
  const real = Math.min(0.1, (now - last) / 1000); last = now;
  camUpdate(real); const t0 = performance.now(); sim(real * speed); tSim = tSim * 0.9 + (performance.now() - t0) * 0.1; if (avisT > 0 && (avisT -= real) <= 0) avis(''), avisT = 0;
  for (const s of labels) { const d = camera.position.distanceTo(s.position) * 0.11; s.scale.set(d, d * 96 / 512, 1); }
  renderer.render(scene, camera);
  fN++; fT += real; if (fT > 0.5) { const fps = fN / fT; document.getElementById('fps').textContent = Math.round(fps);
    if (fps < 45) detail = Math.max(0.35, detail * 0.85); else if (fps > 57) detail = Math.min(1, detail * 1.08);
    const perf = document.getElementById('perf'); if (perf) perf.textContent = `calcul ${tSim.toFixed(1)} ms · ${(renderer.info.render.triangles / 1e6).toFixed(1)} M triangles · détail ${Math.round(detail * 100)} %`;
    fN = 0; fT = 0; hud(); }
  requestAnimationFrame(loop);
}
window.__jeu = { FUM, V, ilots, occuper, entrer, sortir, camera, regs, cam, order, ll, yAt, solAt, setForm, sim, setEchelle: e => { ECHELLE = e; }, changerForm, lancerCharge, attaquer, charger, setSpeed, hommes, build, toggleIA: v => { iaAllies = v; } };
requestAnimationFrame(loop);
