/* ===== FUMÉE ET FEUX =====
   Particules entièrement animées par la carte graphique : on ne fait qu'écrire chaque particule à sa naissance
   (position, vitesse, âge de départ, durée, tailles, couleur), le shader fait le reste (frein de l'air, vent, montée,
   gonflement, fondu). Rien à mettre à jour image par image, donc des dizaines de milliers de bouffées ne coûtent rien au calcul.

   const F = creerFumee(scene, renderer, camera);  F.maj(dt) à chaque image (dt en secondes de bataille).
   - F.fusil(x, y, z, dx, dz)      coup de fusil : x, y, z = bouche du canon, (dx, dz) = direction du tir (vecteur unité) ;
                                   deux réglages en plus : traine (part des tirs qui laissent une bouffée lente, 0,6) et leger (true : moins de particules)
   - F.canon(x, y, z, dx, dz)      coup de canon, depuis la bouche de la pièce
   - F.salve(x, y, z, dx, dz, l, n) nappe d'une salve vue de loin : n bouffées sur un front de largeur l centré en x, z
   - F.panache(x, y, z, force)     fumée noire d'incendie, à rappeler régulièrement (par ex. toutes les 0,2 s) tant que ça brûle
   - F.bouffee(x, y, z, o)         une particule au choix : o = { v: [vx, vy, vz], vie, t0, t1 (tailles en m), frein, monte,
                                   coul: [r, v, b], alpha, eclair: true pour une lueur (additive) }
   Les fenêtres d'un village qui tire : F.fusil(x, y, z, dx, dz) avec la position de la fenêtre suffit. */
import * as THREE from 'three';

const N = 60000; // particules vivantes au plus ; les plus anciennes sont recyclées
export function creerFumee(scene, renderer, camera) {
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 4), vie = new Float32Array(N * 4), col = new Float32Array(N * 4);
  const geo = new THREE.BufferGeometry(), att = (nom, a, k) => { const b = new THREE.BufferAttribute(a, k); b.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(nom, b); return b; };
  const A = [att('position', pos, 3), att('aVel', vel, 4), att('aVie', vie, 4), att('aCol', col, 4)];
  vie.fill(-1e9); // naissance très ancienne : particule morte
  const un = { uT: { value: 0 }, uPx: { value: 600 }, uVent: { value: new THREE.Vector3(1.4, 0, 0.15) } };
  const mat = new THREE.ShaderMaterial({ uniforms: un, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    vertexShader: `
attribute vec4 aVel; attribute vec4 aVie; attribute vec4 aCol; uniform float uT, uPx; uniform vec3 uVent; varying vec4 vC; varying float vG, vE;
void main(){
  float age = uT - aVie.x, u = age / aVie.y; vE = step(1.5, aCol.a); float a0 = aCol.a - 2.0 * vE; // aCol.a >= 2 : lueur
  if (age < 0.0 || u >= 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float k = aVel.w, monte = fract(aVie.w) * 4.0, t1 = floor(aVie.w) * 0.05;
  vec3 p = position + aVel.xyz * (1.0 - exp(-k * age)) / k + uVent * age * (1.0 - exp(-age * 0.8)) * (1.0 - vE) + vec3(0.0, monte * age, 0.0);
  float taille = mix(aVie.z, t1, 1.0 - pow(1.0 - u, 2.2)) ;
  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
  float px = taille * uPx / max(0.3, -mv.z); gl_PointSize = min(px, 900.0);
  float fondu = vE > 0.5 ? (1.0 - u) : smoothstep(0.0, 0.04, u + 0.02) * pow(1.0 - u, 1.2);
  fondu *= smoothstep(0.5, 2.5, -mv.z); // pas de voile sur l'objectif
  vC = vec4(aCol.rgb, a0 * fondu); vG = fract(aVie.x * 7.31 + position.x * 0.37) * 6.28;
}`,
    fragmentShader: `
varying vec4 vC; varying float vG, vE;
void main(){
  vec2 q = gl_PointCoord - 0.5; float c = cos(vG), s = sin(vG); vec2 r = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  float d = length(q) * 2.0, bosse = 0.82 + 0.18 * sin(r.x * 11.0 + vG) * sin(r.y * 9.0 - vG * 1.7) + 0.1 * sin(r.x * 23.0) * sin(r.y * 19.0 + vG);
  float a = smoothstep(1.0, 0.25, d / bosse) * vC.a; if (a < 0.003) discard;
  if (vE > 0.5) { float coeur = smoothstep(0.7, 0.0, d); gl_FragColor = vec4((vC.rgb + vec3(0.6, 0.5, 0.35) * coeur) * a, 0.0); return; } // lueur : s'ajoute à l'image
  float jour = 0.78 + 0.22 * (0.5 - q.y) * 1.6; // le dessus de la bouffée prend la lumière
  gl_FragColor = vec4(vC.rgb * jour * a, a);
}` });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 3; scene.add(pts);
  pts.onAfterRender = () => { sale0 = N; sale1 = -1; }; // les nouvelles particules sont parties à la carte graphique
  let k = 0, sale0 = N, sale1 = -1, T = 0;
  /* Une particule. v : vitesse de départ (m/s), freinée par l'air (frein : plus il est grand, plus elle s'arrête court) ;
     t0 -> t1 : taille en mètres de la naissance à la fin ; monte : m/s ; retard : naît dans retard secondes. */
  function bouffee(x, y, z, o = {}) {
    const i = k; k = (k + 1) % N; sale0 = Math.min(sale0, i); sale1 = Math.max(sale1, i);
    const v = o.v || ZERO; pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 4] = v[0]; vel[i * 4 + 1] = v[1]; vel[i * 4 + 2] = v[2]; vel[i * 4 + 3] = o.frein ?? 3;
    vie[i * 4] = T + (o.retard || 0); vie[i * 4 + 1] = o.vie ?? 4; vie[i * 4 + 2] = o.t0 ?? 0.4; vie[i * 4 + 3] = Math.min(2000, Math.round((o.t1 ?? 2) * 20)) + Math.min(0.99, Math.max(0, (o.monte ?? 0.3) / 4));
    const c = o.coul || BLANC; col[i * 4] = c[0]; col[i * 4 + 1] = c[1]; col[i * 4 + 2] = c[2]; col[i * 4 + 3] = Math.min(1, o.alpha ?? 0.5) + (o.eclair ? 2 : 0);
  }
  const ZERO = [0, 0, 0], BLANC = [0.93, 0.92, 0.9], al = () => Math.random(), v3 = [0, 0, 0];
  const gris = () => { const g = 0.84 + al() * 0.12; return [g, g * 0.99, g * 0.97]; };
  /* Coup de fusil : lueur à la bouche et au bassinet, jet de fumée dans l'axe du tir, bouffée du bassinet, puis une
     bouffée lente qui reste devant le rang et dérive au vent. traine : part de tireurs qui laissent cette bouffée lente. */
  function fusil(x, y, z, dx, dz, traine = 0.6, leger = false) {
    bouffee(x + dx * 0.25, y, z + dz * 0.25, { eclair: true, vie: 0.09, t0: 0.5, t1: 1.3, coul: [1, 0.72, 0.3], alpha: 1, frein: 9, v: [dx * 6, 0, dz * 6], monte: 0 });
    if (leger) { const f = 9 + al() * 5; // gros bataillon : une seule bouffée par tireur, plus ample
      bouffee(x, y, z, { v: [dx * f + (al() - 0.5) * 1.5, (al() - 0.3) * 1.2, dz * f + (al() - 0.5) * 1.5], frein: 3.6, vie: 3 + al() * 2.5, t0: 0.3, t1: 2.2 + al() * 0.8, alpha: 0.55, coul: gris(), monte: 0.25 }); }
    else {
      bouffee(x - dx * 1.05 + dz * 0.04, y + 0.07, z - dz * 1.05 - dx * 0.04, { eclair: true, vie: 0.07, t0: 0.18, t1: 0.4, coul: [1, 0.8, 0.45], alpha: 0.9, monte: 0, frein: 9 }); // l'amorce
      for (let j = 0; j < 3; j++) { const f = 5 + j * 5 + al() * 3, e = 1.2; // le jet : trois bouffées de plus en plus loin
        bouffee(x, y, z, { v: [dx * f + (al() - 0.5) * e, (al() - 0.3) * e, dz * f + (al() - 0.5) * e], frein: 4.2, vie: 2.6 + al() * 2.2, t0: 0.25, t1: 1.5 + j * 0.5 + al() * 0.6, alpha: 0.55 - j * 0.08, coul: gris(), monte: 0.25 }); }
      bouffee(x - dx * 1.05, y + 0.1, z - dz * 1.05, { v: [(al() - 0.5) * 1.5, 2.2, (al() - 0.5) * 1.5], frein: 3.5, vie: 1.6 + al(), t0: 0.15, t1: 0.9, alpha: 0.4, coul: gris(), monte: 0.4 }); }
    if (al() < traine) bouffee(x + dx * 2.2, y + 0.2, z + dz * 2.2, { v: [dx * 1.2 + (al() - 0.5), 0.2, dz * 1.2 + (al() - 0.5)], frein: 1.2, retard: 0.25, vie: 13 + al() * 12, t0: 1.6, t1: 5 + al() * 3, alpha: 0.2, coul: gris(), monte: 0.18 + al() * 0.15 });
  }
  /* Coup de canon : grande lueur, long jet, bouffée de la lumière (au-dessus de la culasse), nuage qui reste. */
  function canon(x, y, z, dx, dz) {
    bouffee(x + dx * 0.8, y, z + dz * 0.8, { eclair: true, vie: 0.13, t0: 1.6, t1: 5, coul: [1, 0.7, 0.28], alpha: 1, frein: 6, v: [dx * 18, 0, dz * 18], monte: 0 });
    bouffee(x + dx * 2.5, y, z + dz * 2.5, { eclair: true, vie: 0.09, t0: 1, t1: 2.6, coul: [1, 0.85, 0.55], alpha: 0.9, frein: 6, v: [dx * 30, 0, dz * 30], monte: 0 });
    for (let j = 0; j < 10; j++) { const f = 2 + j * 5 + al() * 4, e = 1.2 + j * 0.4;
      bouffee(x, y, z, { v: [dx * f + (al() - 0.5) * e, (al() - 0.35) * e, dz * f + (al() - 0.5) * e], frein: 2.6, vie: 5 + al() * 5, t0: 0.7, t1: 3.5 + j * 0.45 + al() * 1.5, alpha: 0.6 - j * 0.03, coul: gris(), monte: 0.3 }); }
    bouffee(x - dx * 1.7, y + 0.25, z - dz * 1.7, { v: [(al() - 0.5) * 2, 5, (al() - 0.5) * 2], frein: 3, vie: 2.5, t0: 0.3, t1: 1.8, alpha: 0.45, coul: gris(), monte: 0.5 });
    for (let j = 0; j < 4; j++) bouffee(x + dx * (3 + j * 3), y + 0.5, z + dz * (3 + j * 3), { v: [dx * 2 + (al() - 0.5) * 2, 0.3, dz * 2 + (al() - 0.5) * 2], frein: 1, retard: 0.4, vie: 18 + al() * 14, t0: 3, t1: 9 + al() * 5, alpha: 0.24, coul: gris(), monte: 0.2 + al() * 0.2 });
  }
  /* Salve vue de loin (les hommes ne sont pas dessinés un à un) : la même fumée, en n grosses bouffées le long du front. */
  function salve(x, y, z, dx, dz, largeur, n) {
    for (let j = 0; j < n; j++) { const l = (al() - 0.5) * largeur, px = x - dz * l, pz = z + dx * l, f = 4 + al() * 6, r = al() * 0.35;
      if (j % 3 === 0) bouffee(px + dx, y, pz + dz, { eclair: true, retard: r, vie: 0.1, t0: 1, t1: 2.4, coul: [1, 0.72, 0.3], alpha: 0.9, monte: 0, frein: 9 });
      bouffee(px, y, pz, { v: [dx * f, 0.4, dz * f], frein: 2.5, retard: r, vie: 4 + al() * 3, t0: 1, t1: 3.5 + al() * 1.5, alpha: 0.5, coul: gris(), monte: 0.25 });
      bouffee(px + dx * 3, y + 0.3, pz + dz * 3, { v: [dx * 1.5, 0.2, dz * 1.5], frein: 1, retard: r + 0.3, vie: 16 + al() * 12, t0: 3, t1: 9 + al() * 5, alpha: 0.3, coul: gris(), monte: 0.2 + al() * 0.15 }); }
  }
  /* Incendie : fumée sombre qui monte en colonne et s'étale, avec parfois une lueur à la base. À rappeler tant que ça brûle. */
  function panache(x, y, z, force = 1) {
    const g = 0.16 + al() * 0.14;
    bouffee(x + (al() - 0.5) * 2 * force, y, z + (al() - 0.5) * 2 * force, { v: [(al() - 0.5) * 1.5, 2.5 + al() * 2, (al() - 0.5) * 1.5], frein: 0.9, vie: 14 + al() * 10, t0: 1.2 * force, t1: (7 + al() * 5) * force, alpha: 0.5, coul: [g, g * 0.95, g * 0.9], monte: 1.6 + al() });
    if (al() < 0.5) bouffee(x + (al() - 0.5) * 1.5 * force, y + 0.3, z + (al() - 0.5) * 1.5 * force, { eclair: true, v: [0, 2.5, 0], frein: 2, vie: 0.5 + al() * 0.5, t0: 1.2 * force, t1: 0.4, coul: [1, 0.45, 0.12], alpha: 0.8, monte: 0 });
  }
  function maj(dt) {
    T += dt; un.uT.value = T; un.uPx.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    if (sale1 >= sale0) { for (const b of A) { b.clearUpdateRanges(); b.addUpdateRange(sale0 * b.itemSize, (sale1 - sale0 + 1) * b.itemSize); b.needsUpdate = true; } }
  }
  return { bouffee, fusil, canon, salve, panache, maj, vent: un.uVent.value, points: pts };
}
