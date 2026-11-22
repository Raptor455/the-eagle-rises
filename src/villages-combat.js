/* ===== VILLAGES AU COMBAT : ce qu'on voit et ce qui arrive aux bâtiments =====
   Les îlots et leurs bâtiments viennent de src/carte.js. Ici : les postes de la garnison, les fumées de tir aux fenêtres,
   les portes enfoncées, la mêlée dans les maisons, les boulets qui arrachent les toits, les obus qui mettent le feu,
   l'incendie qui gagne de toit en toit, et la ruine qui fume. Les règles du combat (qui entre, qui cède) sont dans src/main.js.
   Réglages en tête de fichier. */
import * as THREE from 'three';
import { majBati, horlogeBati } from './carte.js';

export const PLACES = { maison: 70, grange: 50, eglise: 300, chateau: 600 }; // hommes à l'abri par bâtiment ; au-delà, le reste est dans les cours
const TOUCHE_BOULET = 0.55, TOUCHE_OBUS = 0.6, FEU_OBUS = 0.3;               // chances de toucher un bâtiment, et qu'un obus y mette le feu
const DUREE_FEU = 140, EFFONDRE = 60, PROPAGE = 0.008, VOISIN = 19;          // secondes de l'incendie, chute du toit, chance par seconde de gagner un voisin à moins de 19 m
const VENT = 2.2;                                                            // m/s vers l'est, comme la fumée des salves

export function creerVillages(scene, renderer, camera, ilots, yAt) {
  const tous = ilots.flatMap(il => il.bats); ilots.forEach(il => { il.bats.forEach(b => b.il = il); il.brule = 0; il.ruines = 0; il.postes = null; });
  const R = Math.random, loc = (b, lx, lz, out) => { out[0] = b.x + lx * b.cs + lz * b.sn; out[1] = b.z - lx * b.sn + lz * b.cs; return out; };

  /* ---- particules : un nuage qui se fond (fumées, poussière, éclats), un nuage lumineux (flammes, lueurs, étincelles) ---- */
  const S = 17; // par particule : x y z, vx vy vz, couleur de départ, couleur de fin, taille de départ, taille de fin, opacité, pesanteur, frein
  function nuage(n, additif) {
    const d = new Float32Array(n * S), pos = new Float32Array(n * 3), col = new Float32Array(n * 4), tai = new Float32Array(n), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 4)); g.setAttribute('aTaille', new THREE.BufferAttribute(tai, 1));
    const mat = new THREE.ShaderMaterial({ uniforms: { uEch: { value: 800 } }, transparent: true, depthWrite: false, blending: additif ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: 'attribute vec4 aCol; attribute float aTaille; varying vec4 vCol; uniform float uEch;\nvoid main(){ vCol = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aTaille * uEch / max(0.5, -mv.z); }',
      fragmentShader: 'varying vec4 vCol;\nvoid main(){ float a = vCol.a * smoothstep(1.0, 0.2, length(gl_PointCoord - 0.5) * 2.0); if (a < 0.004) discard; gl_FragColor = vec4(vCol.rgb, a); }' });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = additif ? 4 : 3; pts.visible = false; scene.add(pts);
    const N = { n, d, k: 0, vifs: 0, haut: 0, pts, mat,
      mets(x, y, z, vx, vy, vz, c0, c1, t0, t1, op, pes, frein, duree) { const o = N.k * S; N.k = (N.k + 1) % n; N.haut = Math.max(N.haut, N.k || n);
        d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz; d[o + 6] = c0[0]; d[o + 7] = c0[1]; d[o + 8] = c0[2]; d[o + 9] = c1[0]; d[o + 10] = c1[1]; d[o + 11] = c1[2];
        d[o + 12] = t0; d[o + 13] = t1; d[o + 14] = op; d[o + 15] = pes; d[o + 16] = frein; N.age[o / S] = 0; N.duree[o / S] = duree; },
      age: new Float32Array(n), duree: new Float32Array(n),
      maj(dt) { let vifs = 0; const vent = additif ? 0 : VENT * dt;
        for (let i = 0; i < N.haut; i++) { const T = N.duree[i]; if (T <= 0) continue; const a = (N.age[i] += dt), o = i * S;
          if (a >= T) { N.duree[i] = 0; col[i * 4 + 3] = 0; tai[i] = 0; continue; } vifs++;
          const k = a / T, f = Math.max(0, 1 - d[o + 16] * dt); d[o + 3] *= f; d[o + 5] *= f; d[o + 4] = d[o + 4] * f - d[o + 15] * dt;
          d[o] += d[o + 3] * dt + (d[o + 15] ? 0 : vent * Math.min(1, k * 4)); d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt; // le vent ne pousse que ce qui flotte
          pos[i * 3] = d[o]; pos[i * 3 + 1] = d[o + 1]; pos[i * 3 + 2] = d[o + 2];
          col[i * 4] = d[o + 6] + (d[o + 9] - d[o + 6]) * k; col[i * 4 + 1] = d[o + 7] + (d[o + 10] - d[o + 7]) * k; col[i * 4 + 2] = d[o + 8] + (d[o + 11] - d[o + 8]) * k;
          col[i * 4 + 3] = d[o + 14] * Math.min(1, k * 12) * (1 - k * k); tai[i] = d[o + 12] + (d[o + 13] - d[o + 12]) * Math.sqrt(k); }
        const fin = Math.max(1, N.haut); N.vifs = vifs; pts.visible = vifs > 0; if (!vifs) { N.haut = 0; N.k = 0; } // tout est retombé : on repart du début du tampon
        for (const at of [g.attributes.position, g.attributes.aCol, g.attributes.aTaille]) { at.clearUpdateRanges(); at.addUpdateRange(0, fin * at.itemSize); at.needsUpdate = true; } },
      vide() { N.duree.fill(0); col.fill(0); tai.fill(0); N.haut = n; N.maj(0); } };
    return N;
  }
  const mat = nuage(12000, false), lum = nuage(5000, true);
  const BLANC = [0.9, 0.9, 0.88], GRIS = [0.6, 0.6, 0.6], NOIR = [0.07, 0.065, 0.06], SUIE = [0.33, 0.32, 0.31], TERRE = [0.5, 0.44, 0.34], CHAUME = [0.5, 0.4, 0.22], BOIS = [0.34, 0.24, 0.14],
    JAUNE = [1, 0.85, 0.45], ORANGE = [1, 0.5, 0.1], ROUGE = [0.75, 0.13, 0.02], ECLAIR = [1, 0.95, 0.75];
  const eclair = (x, y, z, t, duree) => lum.mets(x, y, z, 0, 0, 0, ECLAIR, ORANGE, t, t * 0.5, 0.95, 0, 0, duree);
  const poussiere = (x, y, z, n, c, t) => { for (let k = 0; k < n; k++) mat.mets(x + (R() - 0.5) * 2, y + R() * 1.5, z + (R() - 0.5) * 2, (R() - 0.5) * 3, 0.6 + R() * 1.6, (R() - 0.5) * 3, c, GRIS, t * 0.4, t * (1 + R()), 0.4, 0, 0.9, 4 + R() * 5); };
  const eclats = (x, y, z, n, c, force) => { for (let k = 0; k < n; k++) { const a = R() * 6.28, v = force * (0.3 + R()); mat.mets(x, y, z, Math.cos(a) * v, force * (0.5 + R() * 1.2), Math.sin(a) * v, c, c, 0.35 + R() * 0.35, 0.25, 1, 9.8, 0.3, 1.2 + R() * 1.6); } };

  /* ---- géométrie d'un bâtiment : fenêtres, mur qui regarde un point, postes de la garnison ---- */
  const t2 = [0, 0];
  function fenetres(b) { if (b.fen) return b.fen; const F = [], h = b.type === 'eglise' ? 3.6 : 1.5, etages = b.type === 'chateau' ? [2, 6.5] : [h];
    for (const y of etages) { for (let z = -b.hd + 2.6; z <= b.hd - 2.5; z += b.type === 'maison' ? 3.6 : 4.5) for (const s of [-1, 1]) F.push([s * b.hw, z, s, 0, y]);
      for (let x = -b.hw + 1.9; x <= b.hw - 1.8; x += 3.2) for (const s of [-1, 1]) F.push([x, s * b.hd, 0, s, y]); }
    return (b.fen = F.map(([lx, lz, nx, nz, y]) => { loc(b, lx, lz, t2); return { x: t2[0], z: t2[1], y: b.y + y, nx: nx * b.cs + nz * b.sn, nz: -nx * b.sn + nz * b.cs }; })); }
  function mur(b, x, z, out, marge) { // point du pied de mur qui regarde (x, z), à « marge » mètres du mur
    const dx = x - b.x, dz = z - b.z, lx = dx * b.cs - dz * b.sn, lz = dx * b.sn + dz * b.cs, l = Math.hypot(lx, lz) || 1, t = Math.min(b.hw / (Math.abs(lx) || 1e-6), b.hd / (Math.abs(lz) || 1e-6));
    return loc(b, lx * t + lx / l * marge, lz * t + lz / l * marge, out); }
  function postes(il) { if (il.postes) return il.postes; const parBat = il.bats.filter(b => b.feu < 2).map(b => {
      const P = []; for (const [sx, sz] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) P.push([sx * (b.hw + 0.9), sz * (b.hd + 0.9), sx, sz]);
      for (const s of [-1, 1]) { P.push([s * (b.hw + 1.1), b.hd * 0.42, s, 0]); P.push([s * (b.hw + 1.1), -b.hd * 0.42, s, 0]); }
      return P.map(([lx, lz, nx, nz]) => { loc(b, lx, lz, t2); const wx = nx * b.cs + nz * b.sn, wz = -nx * b.sn + nz * b.cs; return { x: t2[0], z: t2[1], a: Math.atan2(wx, -wz), b }; }); });
    const P = []; for (let k = 0; k < 8; k++) for (const l of parBat) if (l[k]) P.push(l[k]); // un homme par maison d'abord, puis un deuxième...
    return (il.postes = P); }
  const debout = il => il.bats.filter(b => b.feu === 0);
  const auHasard = L => L[Math.floor(R() * L.length)];

  /* ---- tirs de la garnison : éclair et bouffée à une fenêtre qui regarde l'ennemi ---- */
  function tir(il, ex, ez, n) { const L = il.bats.filter(b => b.feu < 2); if (!L.length) return;
    for (let k = 0; k < n; k++) { const b = auHasard(L), F = fenetres(b); let f = null;
      for (let e = 0; e < 5 && !f; e++) { const c = auHasard(F); if ((ex - c.x) * c.nx + (ez - c.z) * c.nz > 0) f = c; } if (!f) continue;
      apres(k * 0.12 * R(), () => { eclair(f.x + f.nx * 0.6, f.y, f.z + f.nz * 0.6, 2.2, 0.1); // feu roulant : les coups partent l'un après l'autre
        for (let q = 0; q < 3; q++) mat.mets(f.x + f.nx * 0.5, f.y + R() * 0.3, f.z + f.nz * 0.5, f.nx * (1.5 + R() * 3.5), 0.3 + R() * 0.6, f.nz * (1.5 + R() * 3.5), BLANC, BLANC, 1.1, 5 + R() * 3.5, 0.5, 0, 1.1, 9 + R() * 7); }); } }
  /* ---- assaut : coups de crosse dans les portes, portes enfoncées, combat dans les maisons ---- */
  const proches = (il, x, z, n) => il.bats.filter(b => b.feu < 2).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z)).slice(0, n);
  function coups(il, x, z) { for (const b of proches(il, x, z, 3)) if (R() < 0.6) { mur(b, x, z, t2, 0.3); poussiere(t2[0], b.y + 0.6, t2[1], 1, TERRE, 1.4); if (R() < 0.4) eclats(t2[0], b.y + 1.3, t2[1], 3, BOIS, 2.2); } }
  function enfonce(il, x, z) { for (const b of proches(il, x, z, 4)) { mur(b, x, z, t2, 0.3); eclats(t2[0], b.y + 1.2, t2[1], 22, BOIS, 4.5); poussiere(t2[0], b.y + 0.5, t2[1], 7, TERRE, 3); } }
  function bagarre(il) { const L = il.bats.filter(b => b.feu < 2); if (!L.length) return; const b = auHasard(L), f = auHasard(fenetres(b));
    if (R() < 0.7) eclair(f.x + f.nx * 0.3, f.y, f.z + f.nz * 0.3, 1.9, 0.1);
    if (R() < 0.5) mat.mets(f.x + f.nx * 0.4, f.y + 0.2, f.z + f.nz * 0.4, f.nx * (1 + R() * 1.5), 0.5 + R() * 0.6, f.nz * (1 + R() * 1.5), BLANC, BLANC, 0.8, 3.5 + R() * 2, 0.38, 0, 1.2, 6 + R() * 4);
    if (R() < 0.12) { loc(b, (R() - 0.5) * b.hw, (R() - 0.5) * b.hd, t2); eclats(t2[0], b.y + b.hToit, t2[1], 4, CHAUME, 2.5); } }

  /* ---- bombardement : le boulet arrache le chaume, l'obus décrit sa cloche, éclate et met le feu ---- */
  const tard = [], vols = [];
  const apres = (t, f) => tard.push({ t, f });
  function toitAuHasard(b, out) { loc(b, (R() - 0.5) * 1.6 * b.hw, (R() - 0.5) * 1.6 * b.hd, out); return b.y + b.hToit + R() * (b.haut - b.hToit) * 0.5; }
  function boulet(il) { const L = debout(il);
    if (!L.length || R() > TOUCHE_BOULET) { const a = R() * 6.28, d = il.r * (0.3 + R()), x = il.x + Math.cos(a) * d, z = il.z + Math.sin(a) * d; poussiere(x, yAt(x, z), z, 6, TERRE, 3.5); eclats(x, yAt(x, z) + 0.3, z, 8, TERRE, 5); return; } // le boulet laboure le sol
    const b = auHasard(L), y = toitAuHasard(b, t2); b.trous = Math.min(0.62, b.trous + 0.09 + R() * 0.11); majBati(b);
    eclats(t2[0], y, t2[1], 34, CHAUME, 6.5); eclats(t2[0], y, t2[1], 8, BOIS, 5); poussiere(t2[0], y, t2[1], 8, CHAUME, 4); }
  function obus(il, x0, z0) { const L = debout(il), touche = L.length && R() < TOUCHE_OBUS, b = touche ? auHasard(L) : null; let x, y, z;
    if (b) { y = toitAuHasard(b, t2); x = t2[0]; z = t2[1]; } else { const a = R() * 6.28, d = il.r * (0.2 + R() * 0.9); x = il.x + Math.cos(a) * d; z = il.z + Math.sin(a) * d; y = yAt(x, z) + 0.5; }
    const d = Math.hypot(x - x0, z - z0), T = Math.max(1.5, d / 130); vols.push({ x0, y0: yAt(x0, z0) + 1.6, z0, x, y, z, t: 0, T, h: d * 0.16 });
    apres(T, () => { eclair(x, y + 1, z, 16, 0.16); eclair(x, y + 1, z, 7, 0.3);
      for (let k = 0; k < 14; k++) mat.mets(x, y + 1, z, (R() - 0.5) * 9, 1 + R() * 5, (R() - 0.5) * 9, SUIE, GRIS, 2, 7 + R() * 5, 0.5, 0, 1.4, 5 + R() * 5);
      eclats(x, y + 0.5, z, 26, b ? CHAUME : TERRE, 8); for (let k = 0; k < 12; k++) { const a = R() * 6.28; lum.mets(x, y + 1, z, Math.cos(a) * 9 * R(), 3 + R() * 8, Math.sin(a) * 9 * R(), JAUNE, ROUGE, 0.5, 0.2, 1, 9.8, 0.2, 0.8 + R()); }
      if (b && b.feu === 0) { b.trous = Math.min(0.62, b.trous + 0.16 + R() * 0.1); majBati(b); if (R() < FEU_OBUS + (b.trous > 0.35 ? 0.25 : 0)) allume(b); } }); }
  function bombarde(il, x0, z0, d, boulets, nObus) { for (let k = 0; k < boulets; k++) apres(d / 260 + R() * 0.5, () => boulet(il)); for (let k = 0; k < nObus; k++) apres(R() * 0.6, () => obus(il, x0, z0)); }

  /* ---- incendie ---- */
  const feux = new Set(), braises = new Set();
  function allume(b) { if (b.feu) return; b.feu = 1; b.t = 0; b.chu = false; feux.add(b); b.il.postes = null;
    if (!b.voisins) b.voisins = tous.filter(o => o !== b && Math.hypot(o.x - b.x, o.z - b.z) < VOISIN + Math.max(o.hw, o.hd) * 0.6); }
  function incendie(b, dt, dtP, dCam) { b.t += dt; const t = b.t, I = t < 20 ? t / 20 : t < 100 ? 1 : Math.max(0.2, 1 - (t - 100) / 40 * 0.8), surf = Math.sqrt(b.hw * b.hd) / 4.7, lod = dCam > 2500 ? 0.3 : dCam > 900 ? 0.55 : 1;
    b.trous = Math.max(b.trous, t < EFFONDRE ? 0.12 + 0.5 * t / EFFONDRE : Math.min(1.32, 0.72 + (t - EFFONDRE) / (DUREE_FEU - EFFONDRE) * 0.6)); b.braise = I; b.suie = Math.min(1, t / 45); majBati(b);
    if (!b.chu && t >= EFFONDRE) { b.chu = true; // le toit s'effondre dans une gerbe d'étincelles
      for (let k = 0; k < 70; k++) { const y = toitAuHasard(b, t2); lum.mets(t2[0], y - 1, t2[1], (R() - 0.5) * 7, 4 + R() * 9, (R() - 0.5) * 7, JAUNE, ROUGE, 0.55, 0.2, 1, 3, 0.4, 1.5 + R() * 2.5); }
      for (let k = 0; k < 16; k++) { const y = toitAuHasard(b, t2); mat.mets(t2[0], y - 2, t2[1], (R() - 0.5) * 6, 2 + R() * 4, (R() - 0.5) * 6, NOIR, SUIE, 4, 14 + R() * 8, 0.6, 0, 0.5, 9 + R() * 8); } }
    const hFl = b.y + (b.chu ? b.hToit * 0.5 : b.hToit), dh = (b.chu ? b.hToit * 0.6 : (b.haut - b.hToit) * 0.7);
    for (let n = jet(I * surf * 46 * lod * dtP); n > 0; n--) { loc(b, (R() - 0.5) * 2 * b.hw * Math.min(1, 0.3 + I), (R() - 0.5) * 2 * b.hd * Math.min(1, 0.3 + I), t2); const g = (1.6 + R() * 2.2) * (0.7 + I * 0.6) / Math.sqrt(lod);
      const y = hFl + R() * dh, vy = 2.5 + R() * 4 * I, T = 0.6 + R() * 0.8;
      lum.mets(t2[0], y, t2[1], (R() - 0.5) * 1.2 + VENT * 0.5, vy, (R() - 0.5) * 1.2, R() < 0.5 ? JAUNE : ORANGE, ROUGE, g * 1.3, g * 0.4, 0.5, 0, 0.3, T);
      if (n % 2) mat.mets(t2[0], y, t2[1], (R() - 0.5) * 1.2, vy, (R() - 0.5) * 1.2, R() < 0.4 ? JAUNE : ORANGE, ROUGE, g * 0.8, g * 0.2, 0.85, 0, 0.3, T); } // cœur de flamme opaque : se voit aussi sur un fond clair
    for (let n = jet(I * surf * 5 * lod * dtP); n > 0; n--) { loc(b, (R() - 0.5) * 1.4 * b.hw, (R() - 0.5) * 1.4 * b.hd, t2);  // fumée noire : une colonne qui monte et que le vent couche
      mat.mets(t2[0], hFl + dh * 0.6 + R() * 2, t2[1], (R() - 0.5) * 1.5, 2.4 + R() * 2.2, (R() - 0.5) * 1.5, NOIR, SUIE, 3.5 / Math.sqrt(lod), (17 + R() * 12) / Math.sqrt(lod), 0.66, 0, 0.035, 26 + R() * 12); }
    for (let n = jet(I * surf * 5 * lod * dtP); n > 0; n--) { loc(b, (R() - 0.5) * 2 * b.hw, (R() - 0.5) * 2 * b.hd, t2); lum.mets(t2[0], hFl + R() * dh, t2[1], (R() - 0.5) * 4 + VENT, 5 + R() * 7, (R() - 0.5) * 4, JAUNE, ROUGE, 0.4, 0.15, 1, -1.5, 0.5, 1.5 + R() * 2); } // étincelles emportées
    if (I > 0.6) for (const o of b.voisins) if (o.feu === 0 && R() < PROPAGE * dt * (o.x > b.x ? 1.5 : 0.7) * (o.trous > 0.2 ? 1.5 : 1)) allume(o); // le feu gagne les toits voisins, surtout sous le vent
    if (t >= DUREE_FEU) { b.feu = 2; b.t = 0; feux.delete(b); braises.add(b); b.il.postes = null; }
  }
  function ruine(b, dt, dtP, dCam) { b.t += dt; const br = Math.max(0.05, 0.45 * Math.exp(-b.t / 70)); if (Math.abs(br - b.braise) > 0.01) { b.braise = br; b.trous = 1.35; majBati(b); }
    if (dCam > 4000) return; const surf = Math.sqrt(b.hw * b.hd) / 4.7;
    for (let n = jet((b.t < 300 ? 0.9 : 0.25) * surf * dtP); n > 0; n--) { loc(b, (R() - 0.5) * 1.6 * b.hw, (R() - 0.5) * 1.6 * b.hd, t2); mat.mets(t2[0], b.y + 1 + R() * 2, t2[1], (R() - 0.5), 1.6 + R() * 1.4, (R() - 0.5), SUIE, GRIS, 2.5, 11 + R() * 7, b.t < 300 ? 0.34 : 0.22, 0, 0.05, 14 + R() * 10); } }
  const jet = x => Math.floor(x) + (R() < x - Math.floor(x) ? 1 : 0); // nombre de particules pour un débit fractionnaire

  function maj(dt) { // dt : temps de bataille (accéléré ou en pause)
    const dtP = Math.min(dt, 0.12), plein = mat.vifs > mat.n * 0.75 ? 0.4 : 1; horlogeBati.value += dtP;
    mat.mat.uniforms.uEch.value = lum.mat.uniforms.uEch.value = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
    for (let k = tard.length - 1; k >= 0; k--) if ((tard[k].t -= dt) <= 0) { const f = tard[k].f; tard.splice(k, 1); f(); }
    for (let k = vols.length - 1; k >= 0; k--) { const v = vols[k]; v.t += dt; if (v.t >= v.T) { vols.splice(k, 1); continue; } const u = v.t / v.T, x = v.x0 + (v.x - v.x0) * u, z = v.z0 + (v.z - v.z0) * u, y = v.y0 + (v.y - v.y0) * u + v.h * 4 * u * (1 - u);
      lum.mets(x, y, z, 0, 0, 0, ORANGE, ROUGE, 1.6, 0.6, 1, 0, 0, 0.14); mat.mets(x, y, z, 0, 0.3, 0, GRIS, GRIS, 0.6, 2.4, 0.3, 0, 0, 1.6); } // l'obus : sa mèche qui brûle et un filet de fumée
    const cp = camera.position;
    for (const b of feux) incendie(b, dt, dtP * plein, Math.hypot(cp.x - b.x, cp.z - b.z, cp.y - b.y));
    for (const b of braises) ruine(b, dt, dtP * plein, Math.hypot(cp.x - b.x, cp.z - b.z, cp.y - b.y));
    for (const il of ilots) { if (!il.brule && !il.ruines && !feux.size) continue; let f = 0, r = 0; for (const b of il.bats) { if (b.feu === 1) f++; else if (b.feu === 2) r++; } il.brule = f / il.bats.length; il.ruines = r / il.bats.length; }
    mat.maj(dtP); lum.maj(dtP);
  }
  function reset() { tard.length = vols.length = 0; feux.clear(); braises.clear(); mat.vide(); lum.vide();
    for (const il of ilots) { il.occ = null; il.brule = il.ruines = 0; il.postes = null; for (const b of il.bats) if (b.trous || b.feu) { b.trous = b.braise = b.suie = b.feu = b.t = 0; majBati(b); } } }

  /* ---- ce que le combat demande ---- */
  function ilotA(x, z, marge = 2) { for (const il of ilots) { if (Math.hypot(x - il.x, z - il.z) > il.r + marge) continue;
      for (const b of il.bats) { const dx = x - b.x, dz = z - b.z; if (Math.abs(dx * b.cs - dz * b.sn) < b.hw + marge && Math.abs(dx * b.sn + dz * b.cs) < b.hd + marge) return il; } } return null; }
  const places = il => debout(il).reduce((a, b) => a + PLACES[b.type], 0);
  const couvert = (il, h) => { const p = places(il); return h <= p ? 0.3 : 0.3 + 0.5 * (1 - p / h); };  // part des coups qui portent sur une garnison
  const libre = il => !il.occ && il.brule === 0 && il.ruines < 0.6;
  return { ilots, ilotA, postes, mur, proches, tir, coups, enfonce, bagarre, bombarde, allume, maj, reset, places, couvert, libre, feux, particules: () => mat.vifs + lum.vifs };
}
