// Génère des modèles 3D avec l'API Meshy à partir de outils/meshy/unites.json, et les range dans modeles/.
//   npm run meshy                      tout ce qui manque
//   npm run meshy -- fantassin-russe   une seule unité (ou plusieurs noms)
//   npm run meshy -- --essai           montre ce qui serait fait et le coût estimé, sans rien dépenser
//   npm run meshy -- --animations walk liste les animations Meshy qui correspondent à « walk » (gratuit)
//   npm run meshy -- --refaire nom     oublie ce qui a déjà été fait pour cette unité et recommence
//   npm run meshy -- --refaire-animations nom   refait seulement les animations (garde forme, texture, squelette)
// La clé se lit dans la variable MESHY_API_KEY, ou dans un fichier .env à la racine du dépôt (ignoré par git).
// L'avancement est noté dans modeles/.meshy-etat.json : si le script s'arrête, il reprend là où il en était
// sans repayer les étapes déjà faites (Meshy garde les résultats 3 jours).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dossierModeles = path.join(racine, 'modeles');
const fichierEtat = path.join(dossierModeles, '.meshy-etat.json');
const API = (process.env.MESHY_API_BASE || 'https://api.meshy.ai/openapi').replace(/\/$/, '');
const ATTENTE_S = Number(process.env.MESHY_ATTENTE_S || 10);
const EN_PARALLELE = 3; // le plan Pro accepte 10 tâches en cours à la fois
const CREDITS = { apercu: 20, texture: 10, image: 30, squelette: 5, animation: 3 };

// ---------- arguments ----------
const args = process.argv.slice(2);
const essai = args.includes('--essai');
const refaire = args.includes('--refaire');
const refaireAnims = args.includes('--refaire-animations');
const iAnim = args.indexOf('--animations');
const noms = args.filter((a, i) => !a.startsWith('--') && !(iAnim >= 0 && i === iAnim + 1));

// ---------- clé ----------
function lireCle() {
  if (process.env.MESHY_API_KEY) return process.env.MESHY_API_KEY.trim();
  const env = path.join(racine, '.env');
  if (fs.existsSync(env)) {
    for (const ligne of fs.readFileSync(env, 'utf8').split(/\r?\n/)) {
      const m = ligne.match(/^\s*MESHY_API_KEY\s*=\s*["']?([^"'\s]+)["']?\s*$/);
      if (m) return m[1];
    }
  }
  return null;
}

// ---------- API ----------
const pause = (s) => new Promise((r) => setTimeout(r, s * 1000));
let cle = null;
async function appel(methode, chemin, corps) {
  for (let essaiN = 1; ; essaiN++) {
    let rep;
    try {
      rep = await fetch(API + '/' + chemin, {
        method: methode,
        headers: { Authorization: 'Bearer ' + cle, ...(corps ? { 'Content-Type': 'application/json' } : {}) },
        body: corps ? JSON.stringify(corps) : undefined,
      });
    } catch (e) {
      if (essaiN >= 5) throw new Error(`réseau injoignable (${e.message})`);
      await pause(5 * essaiN); continue;
    }
    if (rep.status === 429 || rep.status >= 500) {
      if (essaiN >= 5) throw new Error(`Meshy répond ${rep.status} après 5 essais`);
      await pause(Number(rep.headers.get('retry-after')) || 5 * essaiN); continue;
    }
    const texte = await rep.text();
    if (!rep.ok) {
      const conseils = {
        401: 'clé refusée : vérifie MESHY_API_KEY dans .env',
        402: 'plus assez de crédits, ou compte gratuit (l’API demande un abonnement payant)',
        422: 'Meshy n’a pas reconnu la pose du personnage pour le squelette',
      };
      throw new Error(`Meshy ${rep.status} sur ${chemin} : ${texte.slice(0, 300)}${conseils[rep.status] ? ' — ' + conseils[rep.status] : ''}`);
    }
    return texte ? JSON.parse(texte) : {};
  }
}

async function attendre(chemin, id, etiquette) {
  let dernier = -1;
  for (;;) {
    const t = await appel('GET', `${chemin}/${id}`);
    if (t.status === 'SUCCEEDED') { console.log(`  ${etiquette} : terminé`); return t; }
    if (t.status === 'FAILED' || t.status === 'CANCELED') {
      throw new Error(`${etiquette} : ${t.status} ${t.task_error?.message || ''} (crédits rendus par Meshy)`);
    }
    if (t.progress !== dernier) { console.log(`  ${etiquette} : ${t.status === 'PENDING' ? 'en file' : t.progress + ' %'}`); dernier = t.progress; }
    await pause(ATTENTE_S);
  }
}

async function telecharger(url, nomFichier) {
  if (!url) throw new Error(`pas d’adresse de téléchargement pour ${nomFichier}`);
  const rep = await fetch(url);
  if (!rep.ok) throw new Error(`téléchargement ${nomFichier} : ${rep.status} (les fichiers Meshy expirent après 3 jours)`);
  const octets = Buffer.from(await rep.arrayBuffer());
  fs.writeFileSync(path.join(dossierModeles, nomFichier), octets);
  console.log(`  -> modeles/${nomFichier} (${(octets.length / 1e6).toFixed(1)} Mo)`);
  return octets;
}

// Renomme les animations d'un .glb (une par action, dans l'ordre demandé) pour que outils/convertir_modele.py
// les retrouve (walking, running, idle, shooting).
function renommerAnimations(octets, nouveauxNoms) {
  if (octets.readUInt32LE(0) !== 0x46546c67) return octets;
  const lgJson = octets.readUInt32LE(12);
  const json = JSON.parse(octets.subarray(20, 20 + lgJson).toString('utf8').replace(/[\0 ]+$/, ''));
  (json.animations || []).forEach((a, i) => { if (nouveauxNoms[i]) a.name = nouveauxNoms[i]; });
  let neuf = Buffer.from(JSON.stringify(json), 'utf8');
  neuf = Buffer.concat([neuf, Buffer.alloc((4 - (neuf.length % 4)) % 4, 0x20)]);
  const reste = octets.subarray(20 + lgJson);
  const tete = Buffer.alloc(20);
  tete.writeUInt32LE(0x46546c67, 0); tete.writeUInt32LE(2, 4); tete.writeUInt32LE(20 + neuf.length + reste.length, 8);
  tete.writeUInt32LE(neuf.length, 12); tete.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([tete, neuf, reste]);
}

// ---------- état (reprise) ----------
const etat = fs.existsSync(fichierEtat) ? JSON.parse(fs.readFileSync(fichierEtat, 'utf8')) : {};
const noter = (nom, cleEtape, valeur) => {
  etat[nom] = { ...(etat[nom] || {}), [cleEtape]: valeur };
  fs.writeFileSync(fichierEtat, JSON.stringify(etat, null, 2));
};
// une étape : réutilise la tâche déjà lancée si elle existe, sinon la crée
async function etape(nom, cleEtape, chemin, corps, etiquette) {
  let id = etat[nom]?.[cleEtape];
  if (id) {
    try { return await attendre(chemin, id, `${nom} ${etiquette}`); } catch (e) {
      if (!/ 404 /.test(e.message)) throw e;
      console.log(`  ${nom} ${etiquette} : la tâche ${id} n'existe plus chez Meshy (expirée), on la relance`);
      id = null;
    }
  }
  if (!id) {
    id = (await appel('POST', chemin, corps)).result;
    const ordre = ['apercu', 'image', 'texture', 'squelette', 'animations'];
    for (const k of ordre.slice(ordre.indexOf(cleEtape) + 1)) if (etat[nom]?.[k]) delete etat[nom][k];
    noter(nom, cleEtape, id);
    console.log(`  ${nom} ${etiquette} : lancé (${id})`);
  }
  return attendre(chemin, id, `${nom} ${etiquette}`);
}

function imageEnDataUri(fichier) {
  const p = path.resolve(racine, fichier);
  const ext = path.extname(p).slice(1).toLowerCase().replace('jpg', 'jpeg');
  if (!['jpeg', 'png', 'webp'].includes(ext)) throw new Error(`image ${fichier} : jpg, png ou webp seulement`);
  return `data:image/${ext};base64,${fs.readFileSync(p).toString('base64')}`;
}

// ---------- bibliothèque d'animations ----------
let bibliotheque = null;
async function chercherAnimation(mot, typeRig = 'biped') {
  if (typeof mot === 'number') return mot;
  bibliotheque ??= await appel('GET', 'v1/animations/library');
  const liste = (Array.isArray(bibliotheque) ? bibliotheque : bibliotheque.result || bibliotheque.data || [])
    .filter((a) => (a.rig_type || 'biped') === typeRig);
  // nom exact d'abord (espaces et _ confondus), sinon le nom le plus court qui contient le mot
  const norm = (x) => (x || '').toLowerCase().replace(/[_\s]+/g, ' ').trim();
  const m = norm(mot);
  const trouve = liste.find((a) => norm(a.name) === m || norm(a.key) === m)
    || liste.filter((a) => norm(a.name).includes(m)).sort((a, b) => a.name.length - b.name.length)[0];
  if (!trouve) throw new Error(`aucune animation Meshy ne correspond à « ${mot} » (essaie npm run meshy -- --animations ${mot})`);
  console.log(`  animation « ${mot} » -> ${trouve.action_id} ${trouve.name}`);
  return trouve.action_id;
}

// ---------- une unité ----------
function cout(u) {
  let c = u.image ? CREDITS.image : CREDITS.apercu + CREDITS.texture;
  if (u.squelette) c += CREDITS.squelette + CREDITS.animation * Object.keys(u.animations || {}).length;
  return c;
}

async function generer(u, d) {
  const nom = u.nom;
  const opts = { ...d, ...u };
  const geometrie = {
    ai_model: opts.ai_model, should_remesh: true, topology: 'triangle', target_polycount: opts.target_polycount,
    ...(opts.pose_mode ? { pose_mode: opts.pose_mode } : {}), target_formats: ['glb'], origin_at: 'bottom',
  };
  let modele;
  if (u.image) {
    modele = await etape(nom, 'image', 'v1/image-to-3d', {
      image_url: imageEnDataUri(u.image), should_texture: true, enable_pbr: opts.enable_pbr,
      texture_resolution: opts.texture_resolution, ...(u.texture_prompt ? { texture_prompt: u.texture_prompt } : {}), ...geometrie,
    }, 'image -> 3D');
  } else {
    const apercu = await etape(nom, 'apercu', 'v2/text-to-3d', { mode: 'preview', prompt: u.prompt, ...geometrie }, 'forme');
    modele = await etape(nom, 'texture', 'v2/text-to-3d', {
      mode: 'refine', preview_task_id: apercu.id, enable_pbr: opts.enable_pbr, texture_resolution: opts.texture_resolution,
      ...(u.texture_prompt ? { texture_prompt: u.texture_prompt } : {}), target_formats: ['glb'],
    }, 'texture');
  }
  await telecharger(modele.model_urls?.glb, `${nom}.glb`);
  if (!u.squelette) return;

  const rig = await etape(nom, 'squelette', 'v1/rigging', {
    input_task_id: modele.id,
    ...(u.quadrupede ? { animation_type: 'quadruped' } : { animation_type: 'biped', skeleton_template: 'mixamo', height_meters: opts.taille_m || 1.75 }),
  }, 'squelette');
  await telecharger(rig.result?.rigged_character_glb_url, `${nom}-rig.glb`);

  const anims = Object.entries(u.animations || {});
  if (!anims.length) return;
  const ids = [];
  for (const [, mot] of anims) ids.push(await chercherAnimation(mot, u.quadrupede ? 'quadruped' : 'biped'));
  const anim = await etape(nom, 'animations', 'v1/animations', { rig_task_id: rig.id, action_ids: ids }, 'animations');
  const glb = await telecharger(anim.result?.animation_glb_url, `${nom}-anime.glb`);
  fs.writeFileSync(path.join(dossierModeles, `${nom}-anime.glb`), renommerAnimations(glb, anims.map(([k]) => k)));
  console.log(`  ${nom} animations nommées : ${anims.map(([k]) => k).join(', ')}`);
}

// ---------- programme ----------
async function principal() {
  cle = lireCle();
  if (!essai && !cle) {
    console.error('Pas de clé Meshy. Crée un fichier .env à la racine du dépôt avec la ligne :\n  MESHY_API_KEY=msy_...\n(voir outils/meshy/LISEZ-MOI.md)');
    process.exit(1);
  }
  if (iAnim >= 0) {
    const mot = args[iAnim + 1] || '';
    const lib = await appel('GET', 'v1/animations/library' + (mot ? '?search=' + encodeURIComponent(mot) : ''));
    for (const a of Array.isArray(lib) ? lib : lib.result || lib.data || []) console.log(`${a.action_id}\t${a.rig_type}\t${a.category}\t${a.name}`);
    return;
  }
  const conf = JSON.parse(fs.readFileSync(path.join(racine, 'outils/meshy/unites.json'), 'utf8'));
  const inconnus = noms.filter((n) => !conf.unites.some((u) => u.nom === n));
  if (inconnus.length) { console.error('Unités inconnues : ' + inconnus.join(', ')); process.exit(1); }
  let choix = conf.unites.filter((u) => (noms.length ? noms.includes(u.nom) : true));
  if (refaireAnims) for (const u of choix) { if (etat[u.nom]) delete etat[u.nom].animations; fs.rmSync(path.join(dossierModeles, `${u.nom}-anime.glb`), { force: true }); }
  if (refaire) for (const u of choix) { delete etat[u.nom]; for (const s of ['', '-rig', '-anime']) fs.rmSync(path.join(dossierModeles, `${u.nom}${s}.glb`), { force: true }); }
  // sans nom précis, on saute ce qui est déjà fini
  const fini = (u) => fs.existsSync(path.join(dossierModeles, `${u.nom}${u.squelette && Object.keys(u.animations || {}).length ? '-anime' : u.squelette ? '-rig' : ''}.glb`));
  if (!noms.length) choix = choix.filter((u) => !fini(u));

  const total = choix.reduce((s, u) => s + cout(u), 0);
  console.log(`${choix.length} unité(s) : ${choix.map((u) => u.nom).join(', ') || 'rien à faire'}. Coût estimé : ~${total} crédits.`);
  if (essai) { for (const u of choix) console.log(`  ${u.nom} : ${u.image ? 'image' : 'texte'} -> 3D${u.squelette ? ' + squelette' : ''}${u.animations ? ' + ' + Object.keys(u.animations).join('/') : ''} (~${cout(u)} crédits)`); return; }

  fs.mkdirSync(dossierModeles, { recursive: true });
  const echecs = [];
  const file = [...choix];
  await Promise.all(Array.from({ length: Math.min(EN_PARALLELE, file.length) }, async () => {
    for (let u; (u = file.shift()); ) {
      try { await generer(u, conf.defauts || {}); } catch (e) { echecs.push(u.nom); console.error(`!! ${u.nom} : ${e.message}`); }
    }
  }));
  console.log(echecs.length ? `\nÉchecs : ${echecs.join(', ')}. Relance la même commande pour reprendre.` : '\nTout est prêt dans modeles/.');
  if (echecs.length) process.exitCode = 1;
}
principal().catch((e) => { console.error(e.message); process.exit(1); });
