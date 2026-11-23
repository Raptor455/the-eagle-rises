/* ===== CAMPAGNE : parcellaire, herbes, haies, clôtures, vergers, bosquets =====
   La Moravie de 1805 vit sous l'assolement triennal : autour de chaque village, le finage est découpé en « quartiers » (tratě),
   chacun labouré en longues lanières étroites (10 à 35 m de large, plusieurs centaines de mètres de long) qui suivent la pente
   ou la courbe de niveau. Tout un quartier porte la même sole : blé d'hiver qui lève (semé en octobre), labour d'automne
   en attente de l'orge de printemps, ou jachère pâturée ; quelques lanières font exception, et les chaumes pas encore retournés.
   Entre les lanières, une raie ou une étroite bande d'herbe (mez) ; entre les quartiers, une bande plus large où poussent
   prunelliers, églantiers et poiriers sauvages, ou un chemin de terre. Autour des villages : cours closes de clayonnages,
   potagers, vergers de pruniers, enclos à bétail, meules de paille. Les prés humides occupent les fonds de vallon.
   Sources : cartes du premier relevé militaire autrichien (Josephinische Landesaufnahme, 1764-1768) et du cadastre stable
   (1824-1826) pour la forme des quartiers et des lanières ; OSM pour l'emplacement des villages et des ruisseaux.

   Le même découpage est calculé ici en JavaScript (pour placer haies, buissons et meules) et dans les shaders du sol
   et des herbes : les paramètres des quartiers sont dans une texture, et le hasard vient d'un hachage entier identique des deux côtés. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const TYPES = ['blé d\'hiver', 'labour', 'chaume', 'jachère', 'pré', 'jardin', 'chemin', 'mez', 'cour', 'bois', 'rien'];
const BLOC = 760; // taille moyenne d'un quartier de champs, en mètres

/* ---- hachage entier, identique en JavaScript et en GLSL ---- */
const pcg = v => { const s = (Math.imul(v, 747796405) + 2891336453) >>> 0, w = Math.imul((s >>> ((s >>> 28) + 4)) ^ s, 277803737) >>> 0; return ((w >>> 22) ^ w) >>> 0; };
export const hP = (a, b, c) => pcg(Math.imul(a + 4096, 73856093) ^ pcg(Math.imul(b + 4096, 19349663) ^ pcg(c + 4096))) / 4294967296;

export const GLSL_PARC = `
uniform highp sampler2D uBlocs; uniform vec3 uBlocG; uniform ivec2 uBlocN;
uint pcgH(uint v){ uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float hP(int a, int b, int c){ return float(pcgH(uint(a + 4096) * 73856093u ^ pcgH(uint(b + 4096) * 19349663u ^ pcgH(uint(c + 4096))))) / 4294967296.0; }
vec4 blocA(ivec2 c){ c = clamp(c, ivec2(0), uBlocN - 1); return texelFetch(uBlocs, ivec2(c.x * 2, c.y), 0); }
vec4 blocB(ivec2 c){ c = clamp(c, ivec2(0), uBlocN - 1); return texelFetch(uBlocs, ivec2(c.x * 2 + 1, c.y), 0); }
struct Parc { int type; float eBloc; float piste; float mx; float my; float sw; float ang; vec2 q; float rs; };
Parc parcelle(vec2 w0){
  vec2 w = w0 + 28.0 * vec2(sin(w0.y * 0.0061 + 1.3) + 0.5 * sin(w0.y * 0.017 + w0.x * 0.004), sin(w0.x * 0.0057 + 0.4) + 0.5 * sin(w0.x * 0.019 - w0.y * 0.005)); // bords de quartier un peu sinueux
  Parc P; ivec2 bc = ivec2(floor((w - uBlocG.xy) / uBlocG.z)), nb = bc; vec2 a = vec2(0.0); float d1 = 1e20;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { ivec2 c = bc + ivec2(i, j); vec2 o = blocA(c).xy; float d = dot(w - o, w - o); if (d < d1) { d1 = d; nb = c; a = o; } }
  float e = 1e20; ivec2 nb2 = nb;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { ivec2 c = nb + ivec2(i, j); vec2 o = blocA(c).xy; float l = length(o - a); if (l < 1.0) continue;
    float ee = (dot(w - o, w - o) - d1) / (2.0 * l); if (ee < e) { e = ee; nb2 = c; } }
  vec4 A = blocA(nb), B = blocB(nb); float ca = cos(A.z), sa = sin(A.z); vec2 d = w0 - a;
  vec2 q = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y); int bk = nb.x * 131 + nb.y;
  int sid = int(floor(q.x / A.w)); float qy = q.y + hP(sid, bk, 3) * B.y; int seg = int(floor(qy / B.y));
  int t = int(B.x + 0.5); if (hP(sid, seg, bk) < 0.2) t = int(hP(seg, sid, bk + 7) * 4.0);
  int k0 = min(bk, nb2.x * 131 + nb2.y), k1 = max(bk, nb2.x * 131 + nb2.y);
  P.type = t; P.eBloc = e; P.piste = hP(k0, k1, 9) < 0.45 ? 1.0 : 0.0; P.sw = A.w; P.ang = A.z; P.q = vec2(q.x, qy);
  P.mx = (0.5 - abs(fract(q.x / A.w) - 0.5)) * A.w; P.my = (0.5 - abs(fract(qy / B.y) - 0.5)) * B.y; P.rs = hP(sid, seg, bk + 3);
  return P;
}`;

/* Nature du sol en un point, pour les herbes : mêmes règles que le sol (voir carte.js). info : texture des villages et routes, md : pente, humidité, givre, glace. */
export const GLSL_TYPE = `
int typeIci(Parc P, vec4 info, vec4 md, float bruitJ){
  if (info.b > 0.5 || info.g * 255.0 < 3.5 || md.w > 0.3) return 10;
  if (info.a > 0.5) return 9;
  float dv = info.r * 510.0;
  if (dv < 4.0) return 8;
  if (dv < 34.0 + 34.0 * bruitJ) return 5;
  if (P.piste > 0.5 && P.eBloc < 1.6) return 6;
  if (md.y > 0.55) return 4;
  if (P.eBloc < 2.4 || P.mx < 0.55 || P.my < 2.2) return 7;
  return P.type;
}`;

/* ---- les quartiers : centre (jitté), orientation des lanières, largeur, longueur, sole ---- */
export function creerParcellaire(WX, WZ, altAt) {
  const NX = Math.ceil(WX / BLOC) + 4, NY = Math.ceil(WZ / BLOC) + 4, ox = -WX / 2 - 2 * BLOC, oz = -WZ / 2 - 2 * BLOC;
  const d = new Float32Array(NX * 2 * NY * 4);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const cx = ox + (i + 0.15 + 0.7 * hP(i, j, 1)) * BLOC, cz = oz + (j + 0.15 + 0.7 * hP(i, j, 2)) * BLOC;
    const gx = altAt(cx + 80, cz) - altAt(cx - 80, cz), gz = altAt(cx, cz + 80) - altAt(cx, cz - 80);
    let an = Math.hypot(gx, gz) > 1.5 ? Math.atan2(gz, gx) + (hP(i, j, 3) < 0.55 ? 0 : Math.PI / 2) : hP(i, j, 3) * Math.PI; // lanières dans le sens de la pente ou en travers
    an += (hP(i, j, 8) - 0.5) * 0.35;
    const sw = 12 + hP(i, j, 4) * 22, sl = 230 + hP(i, j, 5) * 420, r = hP(i, j, 6), type = r < 0.36 ? 0 : r < 0.68 ? 1 : r < 0.8 ? 2 : 3;
    d.set([cx, cz, an, sw], ((j * NX * 2) + i * 2) * 4); d.set([type, sl, 0, 0], ((j * NX * 2) + i * 2 + 1) * 4);
  }
  const tex = new THREE.DataTexture(d, NX * 2, NY, THREE.RGBAFormat, THREE.FloatType); tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
  const A = (i, j) => { i = Math.min(NX - 1, Math.max(0, i)); j = Math.min(NY - 1, Math.max(0, j)); return ((j * NX * 2) + i * 2) * 4; };
  function parcelle(x0, z0) { // copie exacte du GLSL ci-dessus
    const x = x0 + 28 * (Math.sin(z0 * 0.0061 + 1.3) + 0.5 * Math.sin(z0 * 0.017 + x0 * 0.004)), z = z0 + 28 * (Math.sin(x0 * 0.0057 + 0.4) + 0.5 * Math.sin(x0 * 0.019 - z0 * 0.005));
    const bi = Math.floor((x - ox) / BLOC), bj = Math.floor((z - oz) / BLOC); let ni = bi, nj = bj, ax = 0, az = 0, d1 = 1e20;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const k = A(bi + i, bj + j), dx = x - d[k], dz = z - d[k + 1], dd = dx * dx + dz * dz; if (dd < d1) { d1 = dd; ni = bi + i; nj = bj + j; ax = d[k]; az = d[k + 1]; } }
    ni = Math.min(NX - 1, Math.max(0, ni)); nj = Math.min(NY - 1, Math.max(0, nj));
    let e = 1e20, n2i = ni, n2j = nj;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const k = A(ni + i, nj + j), l = Math.hypot(d[k] - ax, d[k + 1] - az); if (l < 1) continue;
      const ee = ((x - d[k]) ** 2 + (z - d[k + 1]) ** 2 - d1) / (2 * l); if (ee < e) { e = ee; n2i = Math.min(NX - 1, Math.max(0, ni + i)); n2j = Math.min(NY - 1, Math.max(0, nj + j)); } }
    const k = A(ni, nj), an = d[k + 2], sw = d[k + 3], sl = d[k + 5], ca = Math.cos(an), sa = Math.sin(an), dx = x - ax, dz = z - az;
    const dx0 = x0 - ax, dz0 = z0 - az, qx = ca * dx0 + sa * dz0, qy0 = -sa * dx0 + ca * dz0, bk = ni * 131 + nj, sid = Math.floor(qx / sw), qy = qy0 + hP(sid, bk, 3) * sl, seg = Math.floor(qy / sl);
    let type = Math.round(d[k + 4]); if (hP(sid, seg, bk) < 0.2) type = Math.floor(hP(seg, sid, bk + 7) * 4);
    const b2 = n2i * 131 + n2j, fr = v => v - Math.floor(v);
    return { type, eBloc: e, piste: hP(Math.min(bk, b2), Math.max(bk, b2), 9) < 0.45, ang: an, sw, mx: (0.5 - Math.abs(fr(qx / sw) - 0.5)) * sw, my: (0.5 - Math.abs(fr(qy / sl) - 0.5)) * sl };
  }
  return { tex, uniforms: { uBlocs: { value: tex }, uBlocG: { value: new THREE.Vector3(ox, oz, BLOC) }, uBlocN: { value: new THREE.Vector2(NX, NY) } }, parcelle };
}

/* ---- ce que la carte sait du sol (cases de 10 m) : distance au village, à la route, eau, bois ; lu par le sol et les herbes ---- */
export function creerInfoSol(sols, GW, GH, CS) {
  const dist = (test, max) => { const D = new Float32Array(GW * GH); // distance de chanfrein 3-4, en mètres
    for (let k = 0; k < D.length; k++) D[k] = test(sols[k]) ? 0 : 1e9;
    const a = CS, b = CS * 1.4142;
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const k = j * GW + i; let v = D[k];
      if (i) v = Math.min(v, D[k - 1] + a); if (j) { v = Math.min(v, D[k - GW] + a); if (i) v = Math.min(v, D[k - GW - 1] + b); if (i < GW - 1) v = Math.min(v, D[k - GW + 1] + b); } D[k] = v; }
    for (let j = GH - 1; j >= 0; j--) for (let i = GW - 1; i >= 0; i--) { const k = j * GW + i; let v = D[k];
      if (i < GW - 1) v = Math.min(v, D[k + 1] + a); if (j < GH - 1) { v = Math.min(v, D[k + GW] + a); if (i < GW - 1) v = Math.min(v, D[k + GW + 1] + b); if (i) v = Math.min(v, D[k + GW - 1] + b); } D[k] = Math.min(v, max); }
    return D; };
  const dV = dist(s => s === 4, 510), dR = dist(s => s === 1, 255), u = new Uint8Array(GW * GH * 4);
  for (let k = 0; k < GW * GH; k++) { u[k * 4] = Math.round(dV[k] / 2); u[k * 4 + 1] = Math.round(dR[k]); u[k * 4 + 2] = sols[k] === 2 || sols[k] === 3 ? 255 : 0; u[k * 4 + 3] = sols[k] === 5 ? 255 : 0; }
  const tex = new THREE.DataTexture(u, GW, GH, THREE.RGBAFormat); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return { tex, dV, dR };
}

/* ---- petits modèles ---- */
function teinte(g, color, sombreBas) { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); const c = new THREE.Color(color), p = g.attributes.position, n = p.count, a = new Float32Array(n * 3);
  g.computeBoundingBox(); const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y;
  for (let i = 0; i < n; i++) { const f = sombreBas ? 0.7 + 0.3 * (p.getY(i) - y0) / (y1 - y0 || 1) : 1; a[i * 3] = c.r * f; a[i * 3 + 1] = c.g * f; a[i * 3 + 2] = c.b * f; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('normal'); g.computeVertexNormals(); return g; }
const boite = (w, h, d, x, y, z, c) => teinte(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);
const MOD = {
  buisson: () => mergeGeometries([teinte(new THREE.IcosahedronGeometry(1, 0).scale(1.3, 0.9, 1.1).translate(0, 0.8, 0), 0x4b4236, true), teinte(new THREE.IcosahedronGeometry(0.8, 0).translate(0.9, 0.6, 0.3), 0x544a3a, true), teinte(new THREE.IcosahedronGeometry(0.7, 0).translate(-0.8, 0.5, -0.4), 0x433b30, true)]),
  fruitier: () => mergeGeometries([boite(0.25, 2, 0.25, 0, 1, 0, 0x4d4033), teinte(new THREE.IcosahedronGeometry(1.9, 1).scale(1, 0.75, 1).translate(0, 3.2, 0), 0x5f5547, true)]),
  poirier: () => mergeGeometries([boite(0.45, 4, 0.45, 0, 2, 0, 0x463a2e), teinte(new THREE.IcosahedronGeometry(3.6, 1).scale(0.85, 1.15, 0.85).translate(0, 7, 0), 0x574d40, true)]),
  claie: () => mergeGeometries([boite(3, 1.05, 0.08, 0, 0.62, 0, 0x6e5a40), boite(0.1, 1.3, 0.1, -1.45, 0.65, 0, 0x4f4030)]), // clayonnage de branches tressées, 3 m
  lisse: () => mergeGeometries([boite(3, 0.09, 0.07, 0, 0.55, 0, 0x7a6750), boite(3, 0.09, 0.07, 0, 1.0, 0, 0x7a6750), boite(0.13, 1.25, 0.13, -1.45, 0.62, 0, 0x55473a)]), // barrière à deux lisses, 3 m
  palis: () => mergeGeometries([boite(3, 1.5, 0.06, 0, 0.75, 0, 0x7d6b55), boite(3, 0.08, 0.08, 0, 1.3, -0.06, 0x5c4c3b), boite(0.12, 1.7, 0.12, -1.45, 0.85, 0, 0x4f4030)]), // palissade de planches côté rue
  meule: () => mergeGeometries([teinte(new THREE.CylinderGeometry(2.3, 2.5, 2.4, 9).translate(0, 1.2, 0), 0x9a8656, true), teinte(new THREE.ConeGeometry(2.45, 3, 9).translate(0, 3.9, 0), 0x8c7a4e, true)]),
  croix: () => mergeGeometries([boite(1.1, 0.8, 1.1, 0, 0.4, 0, 0xb8b0a0), boite(0.3, 4.2, 0.3, 0, 2.9, 0, 0x5a4a38), boite(1.6, 0.25, 0.25, 0, 3.9, 0, 0x5a4a38)]), // croix de chemin
};

/* Instances regroupées par tuiles de 1,2 km : la carte graphique n'envoie que les tuiles dans le champ, et les petites choses (clôtures) ne sont tracées que de près. */
function semer(scene, geo, mat, items, portee) {
  const T = 1200, tuiles = new Map(), mM = new THREE.Matrix4(), mQ = new THREE.Quaternion(), mV = new THREE.Vector3(), mS = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color(), out = [];
  for (const it of items) { const k = Math.floor(it[0] / T) + ',' + Math.floor(it[2] / T); if (!tuiles.has(k)) tuiles.set(k, []); tuiles.get(k).push(it); }
  for (const liste of tuiles.values()) {
    const im = new THREE.InstancedMesh(geo, mat, liste.length);
    liste.forEach(([x, y, z, a, sx, sy, sz, c], i) => { mQ.setFromAxisAngle(Y, a); im.setMatrixAt(i, mM.compose(mV.set(x, y, z), mQ, mS.set(sx, sy, sz))); im.setColorAt(i, col.setScalar(c)); });
    im.computeBoundingSphere(); scene.add(im); out.push({ im, x: im.boundingSphere.center.x, y: im.boundingSphere.center.y, z: im.boundingSphere.center.z, r: im.boundingSphere.radius, portee });
  }
  return out;
}

/* ---- bosquets le long des ruisseaux (aulnes, saules) : appelé avant le sol, ils comptent comme bois ---- */
export function bosquets(RUISSEAUX, solAt, marque, arbres, rnd, presVillage) {
  let n = 0;
  RUISSEAUX.forEach((r, ri) => { for (let k = 0; k < r.length; k += 3 * 14) {
    if (rnd(r[k], ri + 0.5) > 0.16) continue; const x0 = r[k], z0 = r[k + 1], R = 22 + rnd(z0, x0) * 45;
    if (presVillage(x0, z0, 160) || solAt(x0, z0) === 'route') continue;
    for (let q = 0; q < R * 0.8; q++) { const a = rnd(q, x0) * 6.283, d = Math.sqrt(rnd(z0, q)) * R, x = x0 + Math.cos(a) * d * 1.3, z = z0 + Math.sin(a) * d * 0.8;
      if (solAt(x, z) === 'champ') { arbres.push([x, z, 0.8 + rnd(x, q) * 0.5]); marque(x, z, 6, 'bois'); } }
    n++; } });
  return n;
}

/* ---- tout le reste : haies et buissons des mezes, poiriers isolés, clôtures des cours, vergers, enclos, meules, croix, herbes ---- */
export function habiller(scene, withMist, C) {
  const { WX, WZ, yAt, altAt, solAt, rnd, parc, info, GW, GH, CS, maisons, villages, hRaw, HW, HH, H0, VE, uMod, bruit } = C;
  const iInfo = (x, z) => { const i = Math.min(GW - 1, Math.max(0, Math.floor((x + WX / 2) / CS))), j = Math.min(GH - 1, Math.max(0, Math.floor((z + WZ / 2) / CS))); return j * GW + i; };
  const dVil = (x, z) => info.dV[iInfo(x, z)], dRte = (x, z) => info.dR[iInfo(x, z)];
  const libre = (x, z, dv = 25, dr = 6) => { const s = solAt(x, z); return s === 'champ' && dVil(x, z) >= dv && dRte(x, z) >= dr && Math.abs(x) < WX / 2 - 40 && Math.abs(z) < WZ / 2 - 40; };
  const mat = withMist(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const buissons = [], poiriers = [], fruitiers = [], claies = [], lisses = [], palis = [], meules = [], croix = [];

  /* mezes entre les quartiers : buissons par fourrés (certaines bandes sont envahies, d'autres nues), poiriers sauvages isolés */
  const P = 11;
  for (let z = -WZ / 2 + 40; z < WZ / 2 - 40; z += P) for (let x = -WX / 2 + 40; x < WX / 2 - 40; x += P) {
    const jx = x + (rnd(x, z) - 0.5) * P, jz = z + (rnd(z, x) - 0.5) * P, pc = parc.parcelle(jx, jz);
    if (pc.eBloc > 4.5) continue;
    const touffu = hP(Math.floor(jx / 140), Math.floor(jz / 140), 11), p = touffu > 0.62 ? 0.42 : touffu > 0.35 ? 0.07 : 0.0;
    const off = pc.piste ? 3.2 : 0; // le long d'un chemin, les buissons sont sur l'accotement
    if (rnd(jx * 0.7, jz) < p && libre(jx, jz, 30, 7)) { const s = 0.7 + rnd(jz, 3) * 0.9; buissons.push([jx, yAt(jx, jz) - 0.2, jz, rnd(jx, 9) * 6.28, s * 1.1, s * (0.8 + rnd(9, jz) * 0.5), s, 0.8 + rnd(jx, jz + 1) * 0.35]); }
    else if (rnd(jz, jx * 0.3) < 0.006 + (touffu > 0.62 ? 0.01 : 0) && libre(jx, jz, 40, 8) && !off) { const s = 0.8 + rnd(jx, 5) * 0.5; poiriers.push([jx, yAt(jx, jz) - 0.2, jz, rnd(jz, 2) * 6.28, s, s * (0.9 + rnd(4, jx) * 0.3), s, 0.85 + rnd(jx, 7) * 0.3]); }
  }
  /* bords des chemins de village à village : quelques buissons et arbres */
  for (let z = -WZ / 2 + 40; z < WZ / 2 - 40; z += 9) for (let x = -WX / 2 + 40; x < WX / 2 - 40; x += 9) {
    const d = dRte(x, z); if (d < 6 || d > 9) continue; const r = rnd(x * 1.3, z * 0.7);
    if (r < 0.035 && libre(x, z, 30, 5)) { const s = 0.7 + rnd(z, 3) * 0.6; buissons.push([x, yAt(x, z) - 0.2, z, rnd(x, 9) * 6.28, s, s, s, 0.85 + rnd(x, 1) * 0.3]); }
    else if (r < 0.042 && libre(x, z, 30, 5)) { const s = 0.75 + rnd(x, 5) * 0.4; poiriers.push([x, yAt(x, z) - 0.2, z, rnd(z, 2) * 6.28, s, s, s, 0.9]); }
  }

  /* villages : cour close derrière chaque maison (clayonnage sur un côté et au fond), palissade sur la rue entre deux maisons, potager et verger de pruniers au-delà */
  const grille = new Map(), gk = (x, z) => Math.floor(x / 25) + ',' + Math.floor(z / 25);
  for (const m of maisons) { const k = gk(m.x, m.z); if (!grille.has(k)) grille.set(k, []); grille.get(k).push(m); }
  const presMaison = (x, z, d, sauf) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const m of grille.get(gk(x + i * 25, z + j * 25)) || []) if (m !== sauf && Math.hypot(m.x - x, m.z - z) < d) return true; return false; };
  const ligne = (liste, x0, z0, x1, z1, ok) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 3)), a = -Math.atan2(z1 - z0, x1 - x0);
    for (let t = 0; t < n; t++) { const x = x0 + (x1 - x0) * (t + 0.5) / n, z = z0 + (z1 - z0) * (t + 0.5) / n; if (ok(x, z)) liste.push([x, yAt(x, z) - 0.05, z, a, L / n / 3, 0.9 + rnd(x, z) * 0.2, 1, 0.8 + rnd(z, x) * 0.35]); } };
  for (const m of maisons) {
    const pt = (k, o) => [m.x + m.nx * k + m.ux * o, m.z + m.nz * k + m.uz * o], fond = 31 + rnd(m.x, 3) * 4, arr = m.pg ? 6.8 : 3.8, cote = rnd(m.z, 1) < 0.5 ? -1 : 1;
    const okC = (x, z) => solAt(x, z) !== 'eau' && solAt(x, z) !== 'glace' && dRte(x, z) > 4 && !presMaison(x, z, 7.5, m);
    ligne(claies, ...pt(arr, cote * 7.2), ...pt(fond, cote * 7.2), okC);
    ligne(claies, ...pt(fond, -7.2), ...pt(fond, 7.2), okC);
    if (!m.pg) ligne(palis, ...pt(-1.5, cote * 4.2), ...pt(-1.5, cote * 7.2), (x, z) => !presMaison(x, z, 4.5, m) && dRte(x, z) > 2); // portail de la cour, sur la rue
    for (let k = fond + 6; k < fond + 34; k += 7.5) for (let o = -4.5; o <= 4.5; o += 6) { const [x, z] = pt(k + (rnd(k, m.x) - 0.5) * 2, o + (rnd(o, m.z) - 0.5) * 2);
      if (rnd(x, z) < 0.62 && solAt(x, z) === 'champ' && dRte(x, z) > 5 && !presMaison(x, z, 12)) { const s = 0.7 + rnd(z, x) * 0.5; fruitiers.push([x, yAt(x, z) - 0.15, z, rnd(x, 2) * 6.28, s, s, s, 0.85 + rnd(z, 6) * 0.3]); } }
  }
  /* enclos à bétail (barrières à lisses) et meules de paille à la sortie des villages, croix aux chemins */
  for (const v of villages) {
    const bord = maisons.filter(m => m.v === v).sort((a, b) => b.d - a.d).slice(0, 8);
    let enclos = 0;
    for (const m of bord) { if (enclos >= 2) break;
      const k0 = 62 + rnd(m.x, 8) * 10, L = 38 + rnd(m.z, 8) * 22, W = 28 + rnd(m.x, m.z) * 16, pt = (k, o) => [m.x + m.nx * k + m.ux * o, m.z + m.nz * k + m.uz * o];
      const coins = [pt(k0, -W / 2), pt(k0 + L, -W / 2), pt(k0 + L, W / 2), pt(k0, W / 2)];
      if (!coins.every(([x, z]) => solAt(x, z) === 'champ' && dRte(x, z) > 7 && !presMaison(x, z, 20)) || !libre(...pt(k0 + L / 2, 0), 0, 7)) continue;
      for (let s = 0; s < 4; s++) ligne(lisses, ...coins[s], ...coins[(s + 1) % 4], (x, z) => !(s === 0 && Math.abs(Math.hypot(x - coins[0][0], z - coins[0][1]) - W / 2) < 2)); // une barrière ouverte côté village
      const [mx, mz] = pt(k0 + L + 10, (rnd(m.x, 4) - 0.5) * W); if (libre(mx, mz, 0, 7)) meules.push([mx, yAt(mx, mz) - 0.3, mz, rnd(mx, 1) * 6, 1, 0.9 + rnd(mz, 2) * 0.3, 1, 0.85 + rnd(mx, mz) * 0.3]);
      enclos++; }
    for (const r of v.rues) for (const bout of [r[0], r[r.length - 1]]) { const [x, z] = bout; if (Math.hypot(x - v.x, z - v.z) < 80 || rnd(x, z) > 0.6) continue;
      const cx = x + (rnd(z, 1) - 0.5) * 10, cz = z + (rnd(x, 1) - 0.5) * 10; if (solAt(cx, cz) === 'champ' && dRte(cx, cz) > 4.5 && !presMaison(cx, cz, 12)) croix.push([cx, yAt(cx, cz) - 0.1, cz, rnd(cx, 3) * 6.28, 1, 1, 1, 1]); }
  }
  /* meules dans les champs moissonnés */
  for (let q = 0; q < 2600; q++) { const x = (rnd(q, 1.7) - 0.5) * WX * 0.96, z = (rnd(2.3, q) - 0.5) * WZ * 0.96, pc = parc.parcelle(x, z);
    if (pc.type === 2 && pc.mx > 3 && pc.eBloc > 6 && libre(x, z, 60, 15)) meules.push([x, yAt(x, z) - 0.3, z, rnd(x, 1) * 6, 0.9, 0.85 + rnd(z, 2) * 0.3, 0.9, 0.8 + rnd(x, z) * 0.3]); }

  const geos = Object.fromEntries(Object.entries(MOD).map(([k, f]) => [k, f()]));
  const groupes = [
    ...semer(scene, geos.buisson, mat, buissons, 6000), ...semer(scene, geos.poirier, mat, poiriers, 0), ...semer(scene, geos.fruitier, mat, fruitiers, 5000),
    ...semer(scene, geos.claie, mat, claies, 900), ...semer(scene, geos.palis, mat, palis, 900), ...semer(scene, geos.lisse, mat, lisses, 1100),
    ...semer(scene, geos.meule, mat, meules, 5000), ...semer(scene, geos.croix, mat, croix, 1500)];
  console.log(`campagne : ${buissons.length} buissons, ${poiriers.length} poiriers, ${fruitiers.length} fruitiers, ${claies.length + palis.length + lisses.length} pans de clôture, ${meules.length} meules, ${croix.length} croix`);

  const herbe = creerHerbe(scene, withMist, C);
  return function maj(cam) { // appelé à chaque image avec la caméra
    for (const g of groupes) if (g.portee) g.im.visible = Math.hypot(cam.position.x - g.x, cam.position.y - g.y, cam.position.z - g.z) < g.portee + g.r;
    herbe(cam);
  };
}

/* ---- herbes : des touffes posées par la carte graphique dans des anneaux autour de la caméra, de plus en plus espacées
   (et de plus en plus larges) avec la distance ; au-delà de 150 m, la texture du sol prend le relais. La touffe lit le sol
   sous elle : pousses vertes et serrées sur le blé d'hiver, chaumes raides et pâles, herbe sèche et haute sur les mezes,
   les jachères et les prés, presque rien sur les labours, rien sur les routes, l'eau et la glace. ---- */
function creerHerbe(scene, withMist, C) {
  const { WX, WZ, yAt, parc, info, GW, GH, CS, hRaw, HW, HH, H0, VE, uMod, bruit } = C;
  // une touffe : 7 brins, chacun un triangle penché
  const pos = [], base = [], brin = [], NB = 14;
  for (let b = 0; b < NB; b++) { const a = b * 2.39996 + 0.3, r = Math.sqrt((b + 0.5) / NB) * 0.5, bx = Math.cos(a) * r, bz = Math.sin(a) * r, lean = 0.2 + rnd2(b + 9) * 0.35;
    for (const [lx, ly, lz] of [[-0.5, 0, 0], [0.5, 0, 0], [0.1, 1, lean]]) { pos.push(lx, ly, lz); base.push(bx * 1.3, bz * 1.3, 0.6 + 0.7 * rnd2(b + 3)); brin.push((b + rnd2(b + 5) * 0.9) / NB); } }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aBase', new THREE.Float32BufferAttribute(base, 3)); g.setAttribute('aBrin', new THREE.Float32BufferAttribute(brin, 1));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => i % 3 === 1 ? 1 : 0), 3));
  const ANN = [[0, 14, 0.42], [14, 36, 0.8], [36, 80, 1.5], [80, 150, 2.7]], inst = [];
  for (const [r0, r1, sp] of ANN) { const R = Math.ceil((r1 + 2 * sp) / sp);
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) { const d = Math.hypot(i, j) * sp; if (d >= r0 - 2 * sp && d <= r1 + 2 * sp) inst.push(i * sp, j * sp, sp, r0, r1); } }
  { const t = []; for (let k = 0; k < inst.length; k += 5) t.push(inst.slice(k, k + 5)); t.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1])); inst.length = 0; for (const e of t) inst.push(...e); } // du plus près au plus loin
  const ia = new Float32Array(inst.length / 5 * 4), ib = new Float32Array(inst.length / 5 * 2);
  for (let k = 0; k < inst.length / 5; k++) { ia.set(inst.slice(k * 5, k * 5 + 3), k * 4); ia[k * 4 + 3] = k; ib[k * 2] = inst[k * 5 + 3]; ib[k * 2 + 1] = inst[k * 5 + 4]; }
  g.setAttribute('aInst', new THREE.InstancedBufferAttribute(ia, 4)); g.setAttribute('aAnn', new THREE.InstancedBufferAttribute(ib, 2));
  const N = ia.length / 4; g.instanceCount = N;
  const altTex = (() => { const f = new Float32Array(HW * HH); for (let k = 0; k < f.length; k++) f[k] = (hRaw[k] / 10 - H0) * VE; const t = new THREE.DataTexture(f, HW, HH, THREE.RedFormat, THREE.FloatType); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
  const U = { ...parc.uniforms, uAlt: { value: altTex }, uInfo: { value: info.tex }, uMod: { value: uMod }, uBruit: { value: bruit }, uMonde: { value: new THREE.Vector4(WX, WZ, GW * CS, GH * CS) }, uTempsH: { value: 0 }, uPortee: { value: 1 } };
  const mat = withMist(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })), avant = mat.onBeforeCompile;
  mat.customProgramCacheKey = () => 'herbe';
  mat.onBeforeCompile = sh => { avant(sh); Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute vec4 aInst; attribute vec2 aAnn; attribute vec3 aBase; attribute float aBrin;
uniform highp sampler2D uAlt; uniform sampler2D uInfo; uniform sampler2D uMod; uniform sampler2D uBruit; uniform vec4 uMonde; uniform float uTempsH; uniform float uPortee;
${GLSL_PARC}
${GLSL_TYPE}
float altG(vec2 p){ vec2 f = (p / uMonde.xy + 0.5) * vec2(${HW - 1}.0, ${HH - 1}.0); ivec2 i = ivec2(floor(f)); vec2 t = f - vec2(i);
  float a = texelFetch(uAlt, clamp(i, ivec2(0), ivec2(${HW - 1}, ${HH - 1})), 0).r, b = texelFetch(uAlt, clamp(i + ivec2(1, 0), ivec2(0), ivec2(${HW - 1}, ${HH - 1})), 0).r;
  float c = texelFetch(uAlt, clamp(i + ivec2(0, 1), ivec2(0), ivec2(${HW - 1}, ${HH - 1})), 0).r, d = texelFetch(uAlt, clamp(i + ivec2(1, 1), ivec2(0), ivec2(${HW - 1}, ${HH - 1})), 0).r;
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y); }`)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', `
  float sp = aInst.z; vec2 cam = cameraPosition.xz;
  vec2 cell = floor(cam / sp) + floor(aInst.xy / sp + 0.5); ivec2 ci = ivec2(cell);
  float h1 = hP(ci.x, ci.y, int(sp * 10.0)), h2 = hP(ci.y, ci.x, 77), h3 = hP(ci.x + 11, ci.y, 5), h4 = hP(ci.x, ci.y + 13, 6);
  vec2 wp = (cell + vec2(h1, h2) - 0.5) * sp; float dc = distance(wp, cam);
  float garde = step(aAnn.x + (h3 - 0.5) * sp * 1.5, dc) * step(dc, aAnn.y + (h3 - 0.5) * sp * 1.5) * step(dc, 150.0 * uPortee);
  Parc P = parcelle(wp);
  vec2 uvI = (wp + uMonde.xy * 0.5) / uMonde.zw, uvM = wp / uMonde.xy + 0.5;
  vec4 info = textureLod(uInfo, uvI, 0.0), md = textureLod(uMod, uvM, 0.0), bz = textureLod(uBruit, wp / 730.0, 0.0);
  int ty = typeIci(P, info, md, bz.r);
  // hauteur, densité, couleur du pied et de la pointe, selon le sol
  float hh = 0.3, dens = 1.0, raide = 0.0; vec3 cb = vec3(0.20, 0.20, 0.11), ct = vec3(0.42, 0.40, 0.22);
  if (ty == 0) { hh = 0.13; dens = 0.95; cb = vec3(0.10, 0.16, 0.05); ct = vec3(0.22, 0.34, 0.10); raide = 0.6; }
  else if (ty == 1) { hh = 0.12; dens = 0.06; }
  else if (ty == 2) { hh = 0.17; dens = 0.85; cb = vec3(0.30, 0.25, 0.14); ct = vec3(0.62, 0.55, 0.34); raide = 1.0; }
  else if (ty == 3) { hh = 0.28; dens = 0.95; cb = vec3(0.17, 0.18, 0.09); ct = vec3(0.47, 0.44, 0.25); }
  else if (ty == 4) { hh = 0.36; dens = 1.0; cb = vec3(0.13, 0.17, 0.07); ct = vec3(0.36, 0.40, 0.18); }
  else if (ty == 5) { hh = 0.24; dens = 0.8; cb = vec3(0.14, 0.17, 0.08); ct = vec3(0.33, 0.36, 0.17); }
  else if (ty == 6) { hh = 0.2; dens = P.eBloc < 0.3 ? 0.7 : 0.03; }
  else if (ty == 7) { hh = 0.45; dens = 1.0; cb = vec3(0.19, 0.18, 0.10); ct = vec3(0.52, 0.47, 0.28); }
  else if (ty == 8) { hh = 0.16; dens = 0.3; }
  else if (ty == 9) { hh = 0.3; dens = 0.5; cb = vec3(0.18, 0.13, 0.08); ct = vec3(0.40, 0.31, 0.18); }
  else { dens = 0.0; }
  float var = 0.65 + 0.7 * h4; hh *= var * (0.85 + 0.3 * bz.g);
  float bord = smoothstep(150.0 * uPortee, 110.0 * uPortee, dc);
  float s = garde * step(h4 * 0.999, dens) * bord;
  float larg = (0.022 + 0.03 * sp) * (1.0 - raide * 0.5);                 // largeur du brin en mètres
  float aR = aBrin * 6.2832 * 3.0 + h1 * 6.2832, cR = cos(aR), sR = sin(aR), hb = hh * aBase.z;
  vec2 lx = vec2(position.x * larg, position.z * hb * (1.0 - raide * 0.85));
  vec3 lb = vec3(lx.x * cR - lx.y * sR, position.y * hb, lx.x * sR + lx.y * cR);
  float vent = sin(uTempsH * 1.7 + wp.x * 0.13 + wp.y * 0.09 + aBrin * 3.0) * 0.06 * position.y * (1.0 - raide);
  vec3 transformed = vec3(wp.x + aBase.x * sp * 0.9 + lb.x * s + vent, altG(wp) - 0.03 + lb.y * s, wp.y + aBase.y * sp * 0.9 + lb.z * s);
  transformed.y -= (1.0 - s) * 2.0;
  vec3 cG = mix(cb * 1.25, ct, position.y) * (0.78 + 0.45 * hP(ci.x, ci.y, int(aBrin * 9.0) + 20));
  cG = mix(cG, vec3(0.78, 0.81, 0.82), md.z * 0.5 * position.y * smoothstep(0.4, 0.8, bz.a + 0.3));`)
      .replace('#include <project_vertex>', 'vColor = cG;\n#include <project_vertex>'); // couleur du brin, après color_vertex
  };
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; scene.add(mesh);
  let tPrec = 0, moy = 16;
  return cam => {
    const t = performance.now(); U.uTempsH.value = t / 1000;
    if (tPrec) moy = moy * 0.95 + Math.min(100, t - tPrec) * 0.05; tPrec = t;
    if (moy > 24) U.uPortee.value = Math.max(0.35, U.uPortee.value - 0.01); else if (moy < 18) U.uPortee.value = Math.min(1, U.uPortee.value + 0.005); // la portée des herbes recule si les images ralentissent
    const haut = cam.position.y - yAt(cam.position.x, cam.position.z); mesh.visible = haut < 160;
    let n = 0; for (; n < N && Math.hypot(ia[n * 4], ia[n * 4 + 1]) < 150 * U.uPortee.value + 6; n++); g.instanceCount = Math.max(1, n); // ne pas envoyer les anneaux au-delà de la portée
  };
}
function rnd2(a) { const s = Math.sin(a * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
