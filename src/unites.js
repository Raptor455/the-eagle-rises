/* ===== UNITÉS : modèles des soldats et des canons, partagés par le jeu et la galerie (outils/galerie) ===== */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* Soldat animé par la carte graphique : chaque sommet suit ses os, lus dans la table d'animation (uOs),
   en mélangeant deux images (aRow.xy). aRow.z, aRow.w : fondu depuis la pose figée aRow.z (w de 0 à 1) quand le geste change. À appeler dans onBeforeCompile, avec les uniformes uOs et uHaut. */
export function animerShader(sh) {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute vec4 aJ; attribute vec4 aW; attribute vec4 aRow; uniform sampler2D uOs; uniform float uHaut;
mat4 osM(float j, float l){ int x=int(j+0.5)*3, y=int(l+0.5); vec4 a=texelFetch(uOs,ivec2(x,y),0), b=texelFetch(uOs,ivec2(x+1,y),0), c=texelFetch(uOs,ivec2(x+2,y),0);
  return mat4(a.x,b.x,c.x,0., a.y,b.y,c.y,0., a.z,b.z,c.z,0., a.w,b.w,c.w,1.); }
mat4 poseM(float l){ return aW.x*osM(aJ.x,l)+aW.y*osM(aJ.y,l)+aW.z*osM(aJ.z,l)+aW.w*osM(aJ.w,l); }`)
    .replace('#include <beginnormal_vertex>', 'float fB=fract(aRow.x);\nmat4 sk=poseM(floor(aRow.x))*(1.0-fB)+poseM(aRow.y)*fB;\nif(aRow.w<0.999) sk=poseM(aRow.z)*(1.0-aRow.w)+sk*aRow.w;\nsk/=(aW.x+aW.y+aW.z+aW.w);\n#include <beginnormal_vertex>\nobjectNormal=mat3(sk)*objectNormal;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed=(sk*vec4(transformed,1.0)).xyz*uHaut;');
}

const bin = (t, T) => { const b = atob(t), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new T(u.buffer); };
function geoModele(d) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(bin(d.pos, Float32Array), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(bin(d.nor, Int8Array), 3, true));
  g.setAttribute('uv', new THREE.BufferAttribute(bin(d.uv, Float32Array), 2));
  g.setAttribute('aJ', new THREE.BufferAttribute(bin(d.os, Uint8Array), 4));        // les os qui tirent ce sommet
  g.setAttribute('aW', new THREE.BufferAttribute(bin(d.poids, Uint8Array), 4, true)); // et leur poids
  g.setIndex(new THREE.BufferAttribute(bin(d.idx, Uint16Array), 1)); return g;
}
const texture = src => { const t = new THREE.TextureLoader().load(src); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

/* Hauteur d'un cheval dans le jeu, en mètres avant grossissement (oreilles comprises) : le cavalier est calé
   sur sa selle pour cette hauteur (outils/convertir_modele.py --selle) et pour un cavalier de 1,8 m. */
export const HAUT_CHEVAL = 1.75;
// grosse cavalerie (cuirassiers, carabiniers, garde) : même cheval, robe plus sombre
export const ROBE_LOURD = 0x5a4a40;

/* Soldat préparé par outils/convertir_modele.py. Corps et fusil partagent le même squelette ; le fusil est
   tenu au port d'arme, dans la main gauche contre l'épaule. habiller(material, uniformes) ajoute l'animation
   (et ce que le jeu veut en plus, comme la brume). */
export function soldat(D, haut, habiller) {
  const a = D.anim, table = new THREE.DataTexture(bin(a.table, Uint16Array), a.os * 3, a.images, THREE.RGBAFormat, THREE.HalfFloatType); table.needsUpdate = true;
  const un = { uOs: { value: table }, uHaut: { value: haut } };
  const mat = src => habiller(new THREE.MeshLambertMaterial({ map: texture(src), side: THREE.DoubleSide }), un);
  const m = { clips: a.clips, pres: [geoModele(D.pres)], loin: [geoModele(D.loin)], mats: [mat(D.tex)] };
  if (D.fusil) { m.pres.push(geoModele(D.fusil.pres)); m.loin.push(geoModele(D.fusil.loin)); m.mats.push(mat(D.fusil.tex)); }
  return m;
}

/* Objet fixe préparé par outils/convertir_objet.py (canon, bâtiment), en mètres, avant vers -z.
   camp : prend la texture repeinte de ce camp s'il en a une (affût jaune ocre autrichien). */
function geoFixe(d) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(bin(d.pos, Float32Array), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(bin(d.nor, Int8Array), 3, true));
  g.setAttribute('uv', new THREE.BufferAttribute(bin(d.uv, Float32Array), 2));
  g.setIndex(new THREE.BufferAttribute(bin(d.idx, Uint16Array), 1)); return g;
}
const geosFixes = new WeakMap();
export function objet(D, habiller, camp) {
  if (!geosFixes.has(D)) geosFixes.set(D, { pres: geoFixe(D.pres), loin: geoFixe(D.loin) });
  return { ...geosFixes.get(D), mat: habiller(new THREE.MeshLambertMaterial({ map: texture(D.teintes?.[camp] || D.tex) })) };
}
