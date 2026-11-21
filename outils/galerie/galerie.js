// Galerie des modèles : soldats, cavaliers et pièces des trois camps en gros plan, pour vérifier les modèles hors de la bataille.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import FR from '../../src/modeles/fr.js';
import RU from '../../src/modeles/ru.js';
import AU from '../../src/modeles/au.js';
import CAV_FR from '../../src/modeles/cav-fr.js';
import CAV_RU from '../../src/modeles/cav-ru.js';
import CAV_AU from '../../src/modeles/cav-au.js';
import COSAQUE from '../../src/modeles/cosaque.js';
import CHEVAL from '../../src/modeles/cheval-selle.js';
import CANON from '../../src/modeles/canon.js';
import MAISON from '../../src/modeles/maison.js';
import { animerShader, soldat, objet, HAUT_CHEVAL, ROBE_LOURD } from '../../src/unites.js';

const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xc9d6e2);
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 300); camera.position.set(-7, 4, -14);
const ctl = new OrbitControls(camera, renderer.domElement); ctl.target.set(0, 1.2, 0); ctl.update();
scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x6b6250, 1.15));
const sun = new THREE.DirectionalLight(0xffe2b0, 2.1); sun.position.set(0.75, 0.42, -0.5); scene.add(sun);
scene.add(new THREE.Mesh(new THREE.CircleGeometry(40, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x7a7458 })));

// figurines animées comme dans le jeu (table d'os lue par la carte graphique) : un groupe par modèle
const HAUT = 1.8, habiller = (mat, un) => { if (un) mat.onBeforeCompile = sh => { Object.assign(sh.uniforms, un); animerShader(sh); }; return mat; };
const groupes = [];
function groupe(D, haut, places, clipDe, robe) {
  const M = soldat(D, haut, habiller); if (robe) M.mats.forEach(m => m.color.setHex(robe));
  const lignes = new THREE.InstancedBufferAttribute(new Float32Array(places.length * 2), 2);
  M.pres.forEach((g, gi) => { g.setAttribute('aRow', lignes); const im = new THREE.InstancedMesh(g, M.mats[gi], places.length); im.frustumCulled = false; scene.add(im);
    places.forEach(([x, z], k) => { const o = new THREE.Object3D(); o.position.set(x, 0, z); o.updateMatrix(); im.setMatrixAt(k, o.matrix); }); });
  groupes.push({ M, lignes, n: places.length, clipDe });
}
// fantassins : trois par camp
[FR, RU, AU].forEach((D, ci) => groupe(D, HAUT, [-1, 0, 1].map(k => [(ci - 1) * 2.4 + k * 0.75, k === 0 ? -0.5 : 0]), c => c));
// cavaliers sur leur cheval, devant : cuirassier (grosse cavalerie : robe sombre), Russe, Autrichien, cosaque
const CAV = [[CAV_FR, ROBE_LOURD], [CAV_RU], [CAV_AU], [COSAQUE]];
CAV.forEach(([C, robe], i) => { const p = [[(i - 1.5) * 3, -7]]; groupe(CHEVAL, HAUT_CHEVAL, p, c => c, robe); groupe(C, HAUT, p, c => c === 'course' ? 'course' : 'marche'); });
// pièces : Gribeauval (affût vert pour les Français et les Russes, ocre pour les Autrichiens)
[[CANON, 'fr'], [CANON, 'ru'], [CANON, 'au']].forEach(([D, c], ci) => { const o = objet(D, habiller, c), m = new THREE.Mesh(o.pres, o.mat); m.position.set((ci - 1) * 4.5, 0, 5); m.rotation.y = -0.5; scene.add(m); });
// maison morave : version détaillée à gauche, version allégée (vue de loin) à droite
{ const o = objet(MAISON, habiller); [o.pres, o.loin].forEach((g, i) => { const m = new THREE.Mesh(g, o.mat); m.position.set(i ? 9 : -9, 0, 16); m.rotation.y = 0.4; scene.add(m); }); }

let clip = q.get('clip') || 'marche';
document.querySelectorAll('[data-clip]').forEach(b => { b.classList.toggle('on', b.dataset.clip === clip); b.onclick = () => { clip = b.dataset.clip; document.querySelectorAll('[data-clip]').forEach(x => x.classList.toggle('on', x === b)); }; });
const t0 = +(q.get('t') ?? -1);
function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
if (q.get('vue')) { const v = q.get('vue').split(',').map(Number); camera.position.set(v[0], v[1], v[2]); ctl.target.set(v[3], v[4], v[5]); ctl.update(); } // ?vue=x,y,z,cible x,y,z
renderer.setAnimationLoop(now => {
  const t = t0 >= 0 ? t0 : now / 1000;
  groupes.forEach(({ M, lignes, n, clipDe }) => { const c = M.clips[clipDe(clip)] || M.clips.attente; for (let i = 0; i < n; i++) { const pos = (t * c[2]) % c[1], ia = Math.floor(pos); lignes.array[i * 2] = c[0] + ia + Math.min(0.999, pos - ia); lignes.array[i * 2 + 1] = c[0] + (ia + 1) % c[1]; } lignes.needsUpdate = true; });
  ctl.update(); renderer.render(scene, camera);
});
