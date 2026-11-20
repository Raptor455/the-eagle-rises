/* ===== ORDRE DE BATAILLE : Austerlitz, 2 décembre 1805, vers 7 h du matin =====
   Toutes les unités des trois armées, avec leur effectif réel et leur position de départ.
   Exporte UNITES : [camp, nom, lat, lon, face, type, hommes, sorte, opts]
     face : radians, comme dans main.js (0 = nord, π/2 = est)
     type : 'inf', 'cav' ou 'art' ; sorte : libellé fin (ligne, leger, grenadiers, garde, cuirassiers…)
     opts : corps, division, chef, pieces et calibre (batteries), arrivee (minutes avant d'entrer en scène), modele
   Noms : ceux de Napoleon: Total War III (armées « [1805] France (Allemagne) » et « [1805] Rossiya, Österreich »)
   quand le régiment y figure, sinon le nom historique. Voir references/unites-austerlitz-1805.md.

   Sources (composition, effectifs) :
   - Wikipedia, « Battle of Austerlitz order of battle » (d'après Duffy 1977, Smith 1998, Kudrna et Smith 2008) :
     effectifs des corps français, escadrons et effectifs de la réserve de cavalerie de Murat, effectifs des colonnes alliées.
   - Stephen Millar, « Russian-Austrian Order-of-Battle at Austerlitz », Napoleon Series : bataillons, escadrons, batteries alliés.
   - George Nafziger, « French Order of Battle at Austerlitz » (805LCI) et « Allied Order of Battle » (805LCJ), Napoleon Series :
     effectif de chaque demi-brigade et régiment de cavalerie français, effectifs alliés par régiment.
   Sources (positions) : austerlitz.org (situation avant la bataille), historyofwar.org, frenchempire.net.
   Les sources donnent les positions par corps et par village, pas au mètre : l'emplacement exact de chaque bataillon
   est une reconstitution (brigades côte à côte, deux lignes, colonnes alliées en marche sur leurs routes).
   Quand une source ne donne pas l'effectif d'un bataillon, il est déduit du total du corps ou de la colonne. */

const D = Math.PI / 180;
const M_LAT = 111320, M_LON = 111320 * Math.cos(49.15 * D); // mètres par degré à Austerlitz

/* décale un point de `avant` mètres vers `face` et de `droite` mètres sur sa droite */
function decale(lat, lon, face, avant, droite) {
  const est = Math.sin(face) * avant + Math.cos(face) * droite, nord = Math.cos(face) * avant - Math.sin(face) * droite;
  return [lat + nord / M_LAT, lon + est / M_LON];
}

export const UNITES = [];

/* Éclate une liste de régiments en unités jouables : un bataillon d'infanterie, un régiment de cavalerie, une batterie.
   r = [nom, nombre (bataillons, 1 pour la cavalerie), hommes par bataillon, sorte, type, opts] */
function eclate(regs) {
  const out = [];
  for (const [nom, nb, h, sorte, type = 'inf', o = {}] of regs) {
    if (nb <= 1 || type !== 'inf') { out.push([nom, h * (type === 'inf' ? 1 : nb), sorte, type, o]); continue; }
    for (let k = 1; k <= nb; k++) out.push([`${nom}, ${k}${k === 1 ? 'er' : 'e'} bataillon`, h, sorte, type, o]);
  }
  return out;
}

/* Déploiement en ordre de bataille : les unités côte à côte sur `parLigne` colonnes, les suivantes en seconde ligne. */
function ligne(camp, base, lat, lon, faceDeg, regs, { ecart = 110, parLigne = 99, profondeur = 220 } = {}) {
  const face = faceDeg * D, u = eclate(regs), n = Math.min(parLigne, u.length);
  u.forEach(([nom, h, sorte, type, o], i) => {
    const col = i % parLigne, rang = Math.floor(i / parLigne), nl = Math.min(n, u.length - rang * parLigne);
    const [la, lo] = decale(lat, lon, face, -rang * profondeur, (col - (nl - 1) / 2) * ecart);
    UNITES.push([camp, nom, +la.toFixed(5), +lo.toFixed(5), +face.toFixed(3), type, Math.round(h), sorte, { ...base, ...o }]);
  });
}

/* Colonne de route : les unités l'une derrière l'autre le long d'un chemin (liste de [lat, lon], de la tête vers la queue). */
function marche(camp, base, chemin, regs, { pas = 130 } = {}) {
  const u = eclate(regs), seg = [];
  let tot = 0;
  for (let i = 1; i < chemin.length; i++) {
    const [a, b] = [chemin[i - 1], chemin[i]], de = (b[1] - a[1]) * M_LON, dn = (b[0] - a[0]) * M_LAT, l = Math.hypot(de, dn);
    seg.push({ a, de, dn, l, t0: tot }); tot += l;
  }
  u.forEach(([nom, h, sorte, type, o], i) => {
    const d = Math.min(i * pas, tot - 1), s = seg.find(s => d < s.t0 + s.l) || seg[seg.length - 1], f = (d - s.t0) / s.l;
    const face = Math.atan2(-s.de, -s.dn); // la tête de colonne regarde vers le début du chemin
    UNITES.push([camp, nom, +(s.a[0] + s.dn * f / M_LAT).toFixed(5), +(s.a[1] + s.de * f / M_LON).toFixed(5), +face.toFixed(3), type, Math.round(h), sorte, { ...base, ...o }]);
  });
}

const batt = (nom, pieces, calibre, sorte = 'pied', hommes) => [nom, 1, hommes || pieces * 25, sorte, 'art', { pieces, calibre }];
const cav = (nom, escadrons, hommes, sorte, o = {}) => [nom, 1, hommes, sorte, 'cav', { escadrons, ...o }];

/* =====================================================================================================
   FRANCE : la Grande Armée (environ 73 000 hommes, 139 canons). Face à l'est, derrière le Goldbach.
   ===================================================================================================== */
const E = 90, SE = 120, NE = 60;

/* ---- Ve corps, Lannes (12 700 h, 20 canons) : la gauche, à cheval sur la route de Brünn à Olmütz, au pied du Santon ---- */
const V = { corps: 'Ve corps (Lannes)' };
// Le 17e léger tient le Santon, avec 18 canons mis en batterie sur la butte (austerlitz.org : « strong artillery »).
ligne('fr', { ...V, division: 'Suchet', chef: 'Claparède' }, 49.1915, 16.7640, E, [['17e léger « Provence »', 2, 706, 'leger']], { ecart: 90 });
ligne('fr', { ...V, division: 'Suchet' }, 49.1925, 16.7555, E, [
  ['34e de ligne « le Savoie-Carignan »', 2, 906, 'ligne'], ['40e de ligne « le Roc de Marengo »', 2, 714, 'ligne'],
  ['64e de ligne « Jura »', 2, 570, 'ligne'], ['88e de ligne « les Sans-cœurs »', 2, 798, 'ligne']], { parLigne: 4, ecart: 120 });
ligne('fr', { ...V, division: 'Caffarelli' }, 49.1830, 16.7560, E, [
  ['13e léger « le Berwick »', 2, 704, 'leger'], ['17e de ligne « les Auvergnats »', 2, 830, 'ligne'], ['30e de ligne « les Perches »', 2, 686, 'ligne'],
  ['51e de ligne « la Ferté »', 2, 639, 'ligne'], ['61e de ligne « les Pharaons »', 2, 603, 'ligne']], { parLigne: 5, ecart: 120 });
ligne('fr', { ...V, division: 'Treillard' }, 49.1960, 16.7520, E, [
  cav('9e hussards « les Hussards de la Liberté »', 3, 227, 'hussards'), cav('10e hussards', 3, 179, 'hussards'),
  cav('13e chasseurs à cheval « les Américains »', 3, 320, 'chasseurs'), cav('21e chasseurs à cheval', 3, 320, 'chasseurs')], { ecart: 140 });
ligne('fr', V, 49.1905, 16.7665, E, [batt('Artillerie à pied, batterie du Santon (12 livres)', 6, '12'), batt('Artillerie à pied, batterie du Santon (8 livres)', 6, '8')], { ecart: 80 });
ligne('fr', V, 49.1850, 16.7600, E, [batt('Artillerie à pied, batterie de 8 (Caffarelli)', 4, '8'), batt('Artillerie à pied, batterie de 8 (Suchet)', 4, '8')], { ecart: 300 });

/* ---- Réserve de cavalerie, Murat (7 400 sabres, 36 canons) : derrière Lannes, de part et d'autre de la route ---- */
const R = { corps: 'Réserve de cavalerie (Murat)' };
// Écran de cavalerie légère en avant (Kellermann, détaché du Ier corps, et Milhaud)
ligne('fr', { ...R, division: 'Kellermann' }, 49.1790, 16.7620, E, [
  cav('2e hussards', 3, 328, 'hussards'), cav('4e hussards', 3, 280, 'hussards'), cav('5e hussards', 3, 342, 'hussards'),
  cav('5e chasseurs à cheval', 3, 317, 'chasseurs'), cav('16e chasseurs à cheval', 3, 320, 'chasseurs', { division: 'Milhaud' }),
  cav('22e chasseurs à cheval', 3, 234, 'chasseurs', { division: 'Milhaud' })], { ecart: 150, parLigne: 6 });
// Cuirassiers : effectifs par régiment donnés par Wikipedia
ligne('fr', { ...R, division: 'Nansouty' }, 49.1890, 16.7430, E, [
  cav('1er carabiniers', 3, 205, 'carabiniers'), cav('2e carabiniers', 3, 181, 'carabiniers'),
  cav('2e cuirassiers « l\'Enclume »', 3, 304, 'cuirassiers'), cav('9e cuirassiers « la Grosse Charrue »', 3, 280, 'cuirassiers'),
  cav('3e cuirassiers « les Gros culs »', 3, 333, 'cuirassiers'), cav('12e cuirassiers « le Glaive »', 3, 277, 'cuirassiers')], { ecart: 130, parLigne: 3 });
ligne('fr', { ...R, division: 'd\'Hautpoul' }, 49.1805, 16.7430, E, [
  cav('1er cuirassiers « le Régiment de fer »', 3, 388, 'cuirassiers'), cav('5e cuirassiers « le Royal-Pologne »', 3, 375, 'cuirassiers'),
  cav('10e cuirassiers « le Royal-Cravates »', 3, 254, 'cuirassiers'), cav('11e cuirassiers « Roussillon »', 3, 327, 'cuirassiers')], { ecart: 130, parLigne: 2 });
ligne('fr', { ...R, division: 'Walther' }, 49.1745, 16.7500, E, [
  cav('3e dragons', 3, 193, 'dragons'), cav('6e dragons « la Reine »', 3, 164, 'dragons'), cav('10e dragons', 3, 246, 'dragons'),
  cav('11e dragons', 3, 214, 'dragons'), cav('13e dragons « les Blancs de Camargue »', 3, 271, 'dragons'), cav('22e dragons', 3, 167, 'dragons')], { ecart: 130, parLigne: 3 });
ligne('fr', { ...R, division: 'Beaumont' }, 49.1735, 16.7400, E, [
  cav('5e dragons « le Colonel Général »', 3, 264, 'dragons'), cav('8e dragons', 3, 295, 'dragons'), cav('9e dragons', 3, 292, 'dragons'), cav('12e dragons', 3, 312, 'dragons'), cav('16e dragons', 3, 258, 'dragons')], { ecart: 130, parLigne: 3 });
ligne('fr', R, 49.1840, 16.7470, E, [
  batt('Artillerie à cheval, 2e régiment (Nansouty)', 6, '8', 'cheval', 92), batt('Artillerie à cheval, 2e régiment (d\'Hautpoul)', 3, '8', 'cheval', 42),
  batt('Artillerie à cheval, 5e régiment (dragons)', 6, '8', 'cheval'), batt('Artillerie à cheval, 6e régiment (Kellermann)', 6, '8', 'cheval')], { ecart: 200 });

/* ---- Ier corps, Bernadotte (13 000 h, 24 canons) : caché derrière Lannes, entre Girschikowitz et le Goldbach ---- */
const I = { corps: 'Ier corps (Bernadotte)' };
ligne('fr', { ...I, division: 'Rivaud' }, 49.1700, 16.7460, SE, [
  ['27e léger', 2, 1034, 'leger'], ['8e de ligne', 2, 929, 'ligne'], ['45e de ligne', 2, 802, 'ligne'], ['54e de ligne', 2, 807, 'ligne']], { parLigne: 4, ecart: 120 });
ligne('fr', { ...I, division: 'Drouet' }, 49.1660, 16.7400, SE, [
  ['94e de ligne', 2, 907, 'ligne'], ['95e de ligne', 2, 952, 'ligne']], { parLigne: 4, ecart: 120 });
ligne('fr', I, 49.1720, 16.7520, SE, [batt('Artillerie à pied, batterie de 8 (Rivaud)', 8, '8'), batt('Artillerie à pied, batterie de 8 (Drouet)', 8, '8'),
  batt('Artillerie à cheval, batterie de 4 (Ier corps)', 8, '4', 'cheval')], { ecart: 250 });

/* ---- Garde impériale, Bessières (5 500 h, 24 canons) et grenadiers d'Oudinot (5 700 h) :
        en réserve derrière le Žuráň, où se tient l'Empereur, vers Schlapanitz ---- */
const G = { corps: 'Garde impériale (Bessières)' };
ligne('fr', { ...G, chef: 'Napoléon' }, 49.1795, 16.7345, E, [cav('Napoléon et l\'état-major', 1, 60, 'etat-major', { modele: 'napoleon' })]);
ligne('fr', G, 49.1765, 16.7270, E, [
  ['Grenadiers à pied de la Garde impériale « les Grognards »', 2, 750, 'garde'], ['Chasseurs à pied de la Garde impériale', 2, 700, 'garde'],
  ['Grenadiers à pied de la Garde royale d\'Italie', 1, 550, 'garde']], { parLigne: 5, ecart: 100 });
ligne('fr', G, 49.1815, 16.7230, E, [
  cav('Grenadiers à cheval de la Garde « les Dieux »', 4, 600, 'garde'), cav('Chasseurs à cheval de la Garde', 4, 376, 'garde'),
  cav('Mamelouks de la Garde', 1, 50, 'garde'), cav('Gendarmes d\'élite « les Immortels »', 2, 200, 'garde')], { ecart: 130 });
ligne('fr', G, 49.1745, 16.7310, E, [batt('Artillerie à pied de la Garde', 12, '12'), batt('Artillerie à cheval de la Garde', 12, '8', 'cheval')], { ecart: 250 });
const O = { corps: 'Grenadiers de la réserve (Oudinot, commandés par Duroc)' };
ligne('fr', O, 49.1720, 16.7270, E, [
  ['1er grenadiers de réserve « les Grenadiers d\'Oudinot »', 3, 570, 'grenadiers'], ['2e grenadiers de réserve « la Colonne infernale »', 3, 570, 'grenadiers'],
  ['3e carabiniers de réserve', 4, 570, 'grenadiers']], { parLigne: 5, ecart: 100 });

/* ---- IVe corps, Soult (23 600 h, 35 canons) : le centre et la droite, le long du Goldbach.
        Saint-Hilaire et Vandamme attendent dans le brouillard du fond de vallée, entre Puntowitz et Kobelnitz ;
        Legrand tient seul la droite : Sokolnitz, la faisanderie, Telnitz. ---- */
const IV = { corps: 'IVe corps (Soult)' };
ligne('fr', { ...IV, division: 'Vandamme' }, 49.1530, 16.7400, E, [
  ['24e léger « les Picorins »', 2, 646, 'leger'], ['4e de ligne « l\'Impétueuse »', 2, 829, 'ligne'], ['28e de ligne « le Bon et Brave »', 2, 800, 'ligne'],
  ['46e de ligne « l\'Infaillible »', 2, 675, 'ligne'], ['57e de ligne « le Terrible que Rien n\'arrête »', 2, 872, 'ligne']], { parLigne: 5, ecart: 120 });
ligne('fr', { ...IV, division: 'Saint-Hilaire' }, 49.1430, 16.7360, E, [
  ['10e léger « Normandie »', 2, 744, 'leger'], ['14e de ligne « l\'Intrépide »', 2, 776, 'ligne'], ['36e de ligne « Anjou »', 2, 743, 'ligne'],
  ['43e de ligne « le Royal des vaisseaux »', 2, 799, 'ligne'], ['55e de ligne « les Condés »', 2, 854, 'ligne']], { parLigne: 5, ecart: 120 });
// Legrand : garnisons des villages (Telnitz : 3e de ligne ; Sokolnitz et la faisanderie : 26e léger, tirailleurs du Pô et corses)
ligne('fr', { ...IV, division: 'Legrand', chef: 'Merle' }, 49.1015, 16.7195, E, [['3e de ligne « le Piémont »', 2, 822, 'ligne']], { ecart: 160 });
ligne('fr', { ...IV, division: 'Legrand', chef: 'Merle' }, 49.1140, 16.7230, E, [['26e léger « la Légion des Alpes »', 2, 782, 'leger']], { ecart: 200 });
ligne('fr', { ...IV, division: 'Legrand', chef: 'Merle' }, 49.1185, 16.7160, E, [
  ['Tirailleurs du Pô', 1, 308, 'tirailleurs'], ['Tirailleurs corses « les Cousins de l\'Empereur »', 1, 519, 'tirailleurs']], { ecart: 220 });
ligne('fr', { ...IV, division: 'Legrand', chef: 'Levasseur' }, 49.1250, 16.7200, E, [
  ['18e de ligne « le Royal-Auvergne »', 2, 701, 'ligne'], ['75e de ligne « la Peste »', 2, 844, 'ligne']], { parLigne: 4, ecart: 120 });
ligne('fr', { ...IV, division: 'Margaron' }, 49.1080, 16.7080, E, [
  cav('8e hussards « les Flibustiers »', 3, 341, 'hussards'), cav('11e chasseurs à cheval', 3, 308, 'chasseurs'), cav('26e chasseurs à cheval', 3, 256, 'chasseurs')], { ecart: 150 });
ligne('fr', IV, 49.1480, 16.7420, E, [
  batt('Artillerie à pied, batterie de 12 (Vandamme)', 6, '12'), batt('Artillerie à pied, batterie de 12 (Saint-Hilaire)', 6, '12'),
  batt('Artillerie à pied, batterie de 8 (Saint-Hilaire)', 6, '8'), batt('Artillerie à pied, batterie de 12 (réserve du IVe corps)', 6, '12')], { ecart: 280 });
ligne('fr', IV, 49.1180, 16.7230, E, [batt('Artillerie à pied, batterie de 8 (Legrand)', 6, '8'), batt('Artillerie à cheval, batterie de 4 (Margaron)', 5, '4', 'cheval')], { ecart: 400 });

/* ---- IIIe corps, Davout (4 300 h dont 830 cavaliers, 12 canons) : arrive de Raigern après une marche forcée,
        par la route de l'ouest, et soutient Legrand à Telnitz et Sokolnitz vers 9 h. ---- */
const III = { corps: 'IIIe corps (Davout)', arrivee: 90 };
marche('fr', { ...III, division: 'Friant' }, [[49.1060, 16.7060], [49.1000, 16.7010]], [
  ['15e léger « les Hommes des montagnes »', 2, 188, 'leger'], ['33e de ligne « les Monte-en-l\'air »', 2, 304, 'ligne'],
  ['48e de ligne', 2, 341, 'ligne'], ['111e de ligne « les Lézards »', 2, 360, 'ligne'], ['108e de ligne « les Hommes de fer »', 2, 409, 'ligne'],
  batt('Artillerie à pied, batterie de 8 (Friant)', 8, '8'), batt('Obusiers de 6 pouces (Friant)', 4, 'obusier')], { pas: 110 });
marche('fr', { ...III, division: 'Bourcier' }, [[49.0950, 16.7030], [49.0880, 16.7010]], [
  cav('15e dragons', 3, 385, 'dragons'), cav('17e dragons', 3, 474, 'dragons'), cav('18e dragons', 3, 553, 'dragons'),
  cav('19e dragons', 3, 408, 'dragons'), cav('25e dragons', 3, 396, 'dragons'), cav('27e dragons', 3, 365, 'dragons')], { pas: 120 });

/* =====================================================================================================
   ALLIÉS : armée austro-russe de Koutouzov (environ 85 400 hommes, 278 canons).
   À l'aube, les quatre premières colonnes descendent du plateau de Pratzen vers le Goldbach.
   ===================================================================================================== */
const O_ = -90, SO = -135, NO = -45;

/* ---- Avant-garde de Kienmayer (3 440 fantassins, 3 440 cavaliers, 12 canons), autrichienne :
        devant Telnitz, qu'elle attaque à 7 h (cinq bataillons repoussés). ---- */
const K = { corps: 'Avant-garde (Kienmayer)' };
ligne('au', { ...K, chef: 'Carneville' }, 49.1035, 16.7330, O_, [
  ['Grenzer de Brod Nr. 7', 1, 500, 'grenzer'], ['1er Szekler Nr. 14', 2, 650, 'grenzer'], ['2e Szekler Nr. 15', 2, 650, 'grenzer'],
  ['Pionniers autrichiens', 1, 340, 'pionniers']], { ecart: 110 });
ligne('au', { ...K, chef: 'Stutterheim' }, 49.0990, 16.7440, O_, [
  cav('Chevau-légers Nr. 3 « O\'Reilly »', 8, 900, 'chevau-legers'), cav('Uhlans Nr. 1 « Merveldt »', 1, 40, 'uhlans'),
  cav('Uhlans Nr. 2 « Schwarzenberg »', 1, 100, 'uhlans')], { ecart: 170 });
ligne('au', { ...K, chef: 'Nostitz' }, 49.1080, 16.7440, O_, [cav('Hussards Nr. 4 « Hessen-Homburg »', 6, 600, 'hussards')], { ecart: 170 });
ligne('au', { ...K, chef: 'Moritz Liechtenstein' }, 49.0960, 16.7350, O_, [cav('Hussards Nr. 11 « Szekler »', 8, 800, 'hussards')]);
ligne('ru', { ...K, chef: 'Stutterheim' }, 49.1110, 16.7380, O_, [
  cav('Donskie kazaki Sissoyev', 5, 500, 'cosaques'), cav('Donskie kazaki Melentyev', 5, 500, 'cosaques')], { ecart: 170 });
ligne('au', K, 49.1050, 16.7400, O_, [batt('Artillerie à cheval autrichienne, batterie Nr. 1 (6 livres)', 6, '6', 'cheval'),
  batt('Artillerie à cheval autrichienne, batterie Nr. 2 (6 livres)', 6, '6', 'cheval')], { ecart: 250 });

/* ---- 1re colonne, Dokhtourov (13 240 fantassins, 250 cavaliers, 64 canons) :
        descend des hauteurs d'Aujezd vers Telnitz. ---- */
const C1 = { corps: '1re colonne (Dokhtourov)' };
marche('ru', { ...C1, chef: 'Löwis' }, [[49.1060, 16.7420], [49.1060, 16.7560], [49.1110, 16.7650]], [
  ['Yegeri 7e régiment « Pyarnu »', 1, 600, 'leger'], ['Mousquetaires de Novoingria', 3, 600, 'ligne'], ['Mousquetaires de Iaroslavl', 2, 600, 'ligne']]);
marche('ru', { ...C1, chef: 'Ouroussov' }, [[49.1110, 16.7650], [49.1180, 16.7740], [49.1220, 16.7860]], [
  ['Mousquetaires de Vladimir', 3, 600, 'ligne'], ['Mousquetaires de Briansk', 3, 600, 'ligne'], ['Mousquetaires de Viatka', 3, 600, 'ligne'],
  ['Mousquetaires de Moskva', 3, 600, 'ligne'], ['Grenadyori de Kiev', 3, 620, 'grenadiers']]);
ligne('ru', C1, 49.1150, 16.7600, SO, [cav('Donskie kazaki Denissov', 5, 250, 'cosaques'),
  batt('Batterie russe de 12 livres Nr. 1', 12, '12', 'pied', 300), batt('Batterie russe de 12 livres Nr. 2', 12, '12', 'pied', 300),
  batt('Pièces de bataillon (1re colonne)', 10, '6'), batt('Pièces de bataillon (1re colonne), 2e batterie', 10, '6'),
  batt('Licornes de bataillon (1re colonne)', 10, 'licorne'), batt('Licornes de bataillon (1re colonne), 2e batterie', 10, 'licorne')], { ecart: 140, parLigne: 4 });

/* ---- 2e colonne, Langeron (11 250 fantassins, 300 cavaliers, 30 canons) :
        quitte le sud du plateau, au-dessus de la Pratzeberg, vers le Goldbach entre Telnitz et Sokolnitz. ---- */
const C2 = { corps: '2e colonne (Langeron)' };
marche('ru', { ...C2, chef: 'Olsoufiev' }, [[49.1180, 16.7440], [49.1200, 16.7560], [49.1240, 16.7650]], [
  ['Yegeri 8e régiment « Ekaterinoslav »', 3, 560, 'leger'], ['Mousquetaires de Vyborg', 3, 620, 'ligne'],
  ['Mousquetaires de Perm', 3, 620, 'ligne'], ['Mousquetaires de Koursk', 3, 620, 'ligne']]);
marche('ru', { ...C2, chef: 'Kamenski Ier' }, [[49.1240, 16.7650], [49.1270, 16.7760]], [
  ['Grenadyori de Fanagoria', 3, 680, 'grenadiers'], ['Mousquetaires de Riazan', 3, 620, 'ligne']]);
ligne('ru', C2, 49.1270, 16.7700, O_, [cav('Donskie kazaki Issayev', 3, 300, 'cosaques'),
  batt('Pièces de bataillon (2e colonne)', 10, '6'), batt('Pièces de bataillon (2e colonne), 2e batterie', 10, '6'), batt('Licornes de bataillon (2e colonne)', 10, 'licorne')], { ecart: 150 });

/* ---- 3e colonne, Przybyszewski (7 700 fantassins, 30 canons) : du plateau vers le château de Sokolnitz. ---- */
const C3 = { corps: '3e colonne (Przybyszewski)' };
marche('ru', { ...C3, chef: 'Müller III' }, [[49.1240, 16.7420], [49.1270, 16.7530]], [
  ['Yegeri 7e régiment « Pyarnu »', 2, 450, 'leger'], ['Mousquetaires de Galitsiya', 3, 450, 'ligne']]);
marche('ru', { ...C3, chef: 'Strik' }, [[49.1270, 16.7530], [49.1310, 16.7620]], [
  ['Mousquetaires de Boutyrsk', 3, 450, 'ligne'], ['Mousquetaires de Narva', 3, 450, 'ligne']]);
marche('ru', { ...C3, chef: 'Lochakov' }, [[49.1310, 16.7620], [49.1340, 16.7720]], [
  ['Mousquetaires d\'Azov', 3, 450, 'ligne'], ['Mousquetaires de Podolsk', 3, 450, 'ligne']]);
ligne('ru', C3, 49.1335, 16.7580, SO, [batt('Pièces de bataillon (3e colonne)', 10, '6'), batt('Pièces de bataillon (3e colonne), 2e batterie', 10, '6'),
  batt('Licornes de bataillon (3e colonne)', 10, 'licorne')], { ecart: 200 });

/* ---- 4e colonne, Kollowrat et Miloradovitch (13 900 fantassins, 76 canons) : au centre du plateau, à Pratzen,
        en retard sur les autres ; elle ne part que vers 8 h, sur ordre du tsar. C'est elle que Soult surprend. ---- */
const C4 = { corps: '4e colonne (Kollowrat, Miloradovitch)' };
marche('ru', { ...C4, chef: 'Monakhtine' }, [[49.1415, 16.7680], [49.1430, 16.7760]], [
  ['Mousquetaires de Novgorod (avant-garde)', 1, 450, 'ligne'], ['Mousquetaires d\'Apsheron (avant-garde)', 1, 450, 'ligne']]);
ligne('au', { ...C4, chef: 'Monakhtine' }, 49.1445, 16.7690, SO, [cav('Dragons Nr. 1 « Erzherzog Johann »', 2, 250, 'dragons')]);
marche('ru', { ...C4, chef: 'Berg' }, [[49.1430, 16.7760], [49.1450, 16.7880]], [
  ['Mousquetaires de Novgorod', 2, 450, 'ligne'], ['Grenadyori de Malorossiya', 3, 500, 'grenadiers']]);
marche('ru', { ...C4, chef: 'Repninski' }, [[49.1450, 16.7880], [49.1470, 16.7960]], [
  ['Mousquetaires d\'Apsheron', 2, 450, 'ligne'], ['Mousquetaires de Smolensk', 2, 450, 'ligne']]);
marche('au', { ...C4, chef: 'Rottermund' }, [[49.1470, 16.7960], [49.1500, 16.8060], [49.1520, 16.8160]], [
  ['IR 20 « Kaunitz »', 1, 900, 'ligne'], ['IR 23 « Salzburg »', 6, 500, 'ligne'], ['IR 24 « Auersperg »', 1, 600, 'ligne']], { pas: 120 });
marche('au', { ...C4, chef: 'Jurczik' }, [[49.1520, 16.8160], [49.1540, 16.8270]], [
  ['IR 1 « Kaiser Franz »', 1, 1000, 'ligne'], ['IR 9 « Czartoryski »', 1, 600, 'ligne'], ['IR 29 « Lindenau »', 1, 400, 'ligne'],
  ['IR 38 « Württemberg »', 1, 500, 'ligne'], ['IR 40 « Mittrowsky »', 1, 500, 'ligne'], ['IR 49 « Kerpen »', 1, 700, 'ligne'],
  ['IR 55 « Reuß-Greitz »', 1, 600, 'ligne'], ['IR 58 « Beaulieu »', 1, 500, 'ligne'], ['Wiener Freiwillige (chasseurs de Vienne)', 1, 300, 'tirailleurs'],
  ['Pionniers autrichiens (4e colonne)', 1, 340, 'pionniers']], { pas: 110 });
ligne('ru', C4, 49.1400, 16.7790, SO, [batt('Batterie russe de 12 livres Nr. 3', 12, '12', 'pied', 300),
  batt('Pièces de bataillon russes (4e colonne)', 10, '6'), batt('Licornes de bataillon russes (4e colonne)', 10, 'licorne')], { ecart: 160 });
ligne('au', C4, 49.1490, 16.8100, SO, [batt('Artillerie autrichienne de 12 livres Nr. 1', 6, '12'), batt('Artillerie autrichienne de 12 livres Nr. 2', 6, '12'),
  batt('Pièces de bataillon autrichiennes (Rottermund)', 6, '3'), batt('Pièces de bataillon autrichiennes (Rottermund), 2e', 6, '3'),
  batt('Pièces de bataillon autrichiennes (Jurczik)', 6, '3'), batt('Pièces de bataillon autrichiennes (Jurczik), 2e', 6, '3')], { ecart: 140, parLigne: 3 });

/* ---- 5e colonne, Liechtenstein (5 375 cavaliers, 30 canons) : la cavalerie, qui doit remonter du sud du plateau
        vers Blasowitz pour faire la liaison entre le centre et Bagration. ---- */
const C5 = { corps: '5e colonne (Jean de Liechtenstein)' };
ligne('au', { ...C5, chef: 'Caramelli' }, 49.1560, 16.7980, NO, [
  cav('Cuirassiers Nr. 5 « Nassau-Usingen »', 6, 300, 'cuirassiers'), cav('Cuirassiers Nr. 7 « Lothringen »', 6, 300, 'cuirassiers')], { ecart: 160 });
ligne('au', { ...C5, chef: 'Weber' }, 49.1530, 16.8030, NO, [cav('Cuirassiers Nr. 1 « Kaiser Franz »', 8, 500, 'cuirassiers')]);
ligne('ru', { ...C5, chef: 'Essen II' }, 49.1600, 16.8050, NO, [
  cav('Uhlans « Velikii Knyaz Konstantin »', 10, 1000, 'uhlans'), cav('Donskie kazaki Gordeyev', 5, 450, 'cosaques'), cav('Donskie kazaki Issayev (2e)', 5, 300, 'cosaques')], { ecart: 170 });
ligne('ru', { ...C5, chef: 'Ouvarov' }, 49.1640, 16.8110, NO, [
  cav('Gousari d\'Elisavetgrad', 10, 1000, 'hussards'), cav('Dragouni de Kharkov', 5, 500, 'dragons'), cav('Dragouni de Tchernigov', 5, 525, 'dragons')], { ecart: 170 });
ligne('ru', C5, 49.1580, 16.8120, NO, [batt('Artillerie à cheval russe Nr. 2 (6 livres)', 12, '6', 'cheval'), batt('Artillerie à cheval russe Nr. 3 (6 livres)', 12, '6', 'cheval')], { ecart: 200 });
ligne('au', C5, 49.1520, 16.7990, NO, [batt('Artillerie à cheval autrichienne Nr. 3 (6 livres)', 6, '6', 'cheval')]);

/* ---- Avant-garde de Bagration (9 200 fantassins, 4 500 cavaliers, 42 canons) : la droite alliée, sur la route
        d'Olmütz entre Posorsitz et Holubitz, face au Santon et à Lannes. ---- */
const B = { corps: 'Avant-garde de Bagration' };
ligne('ru', { ...B, chef: 'Dolgoroukov' }, 49.1960, 16.7900, O_, [['Yegeri 5e régiment « Orany »', 3, 610, 'leger'], ['Yegeri 6e régiment « Livland »', 3, 610, 'leger']], { ecart: 110 });
ligne('ru', { ...B, chef: 'Kamenski II' }, 49.1880, 16.8000, O_, [['Mousquetaires d\'Arkhangelgorod', 3, 610, 'ligne']], { ecart: 110 });
ligne('ru', { ...B, chef: 'Engelhardt' }, 49.1980, 16.8050, O_, [['Mousquetaires de Staroingria', 3, 610, 'ligne'], ['Mousquetaires de Pskov', 3, 610, 'ligne']], { ecart: 110 });
ligne('ru', { ...B, chef: 'Wittgenstein' }, 49.1820, 16.8000, O_, [cav('Gousari de Pavlograd', 10, 900, 'hussards'), cav('Gousari de Marioupol', 10, 900, 'hussards')], { ecart: 200 });
ligne('ru', { ...B, chef: 'Voropaïtski' }, 49.1780, 16.8130, O_, [
  cav('Leyb-kirasiri « Eyo Velitchestva » (cuirassiers de l\'Impératrice)', 5, 650, 'cuirassiers'), cav('Dragouni de Tver', 5, 600, 'dragons'),
  cav('Dragouni de Saint-Pétersbourg', 5, 600, 'dragons')], { ecart: 180 });
ligne('ru', { ...B, chef: 'Tchaplitz' }, 49.2010, 16.8150, SO, [
  cav('Donskie kazaki Kiselyov', 5, 280, 'cosaques'), cav('Donskie kazaki Malakhov', 5, 280, 'cosaques'), cav('Donskie kazaki Khazankov', 5, 290, 'cosaques')], { ecart: 180 });
ligne('ru', B, 49.1920, 16.7950, O_, [batt('Batterie russe de 6 livres (avant-garde)', 10, '6'), batt('Licornes russes (avant-garde)', 10, 'licorne'),
  batt('Artillerie à cheval russe Nr. 1 (6 livres)', 12, '6', 'cheval'), batt('Artillerie à cheval russe Nr. 4 (6 livres)', 6, '6', 'cheval')], { ecart: 200 });
ligne('au', B, 49.1860, 16.8080, O_, [batt('Artillerie à cheval autrichienne Nr. 5 (6 livres)', 6, '6', 'cheval')]);

/* ---- Garde impériale russe, grand-duc Constantin (6 730 fantassins, 3 700 cavaliers, 40 canons) :
        la seule réserve, entre Holubitz et Krzenowitz, derrière Blasowitz. ---- */
const GR = { corps: 'Garde impériale russe (grand-duc Constantin)' };
ligne('ru', { ...GR, chef: 'Maliutine' }, 49.1640, 16.8250, O_, [
  ['Leyb-gvardyi Preobrajenskyi', 2, 750, 'garde'], ['Leyb-gvardyi Semyonovskyi', 2, 700, 'garde'], ['Leyb-gvardyi Izmailovskyi', 2, 500, 'garde'],
  ['Leyb-gvardyi Yegerskyi', 1, 300, 'garde'], ['Leib-grenadiers', 3, 770, 'grenadiers'], ['Pionniers de la Garde', 1, 100, 'pionniers']], { parLigne: 5, ecart: 110 });
ligne('ru', { ...GR, chef: 'Kologrivov' }, 49.1720, 16.8300, O_, [
  cav('Kavalergard (chevaliers-gardes)', 5, 800, 'garde'), cav('Leyb-gvardyi Konnyi (garde à cheval)', 5, 800, 'garde'),
  cav('Leyb-gvardyi Gousarskyi (hussards de la Garde)', 5, 750, 'hussards'), cav('Leyb-gvardyi Kazachyi (cosaques de la Garde)', 2, 300, 'cosaques')], { ecart: 170 });
ligne('ru', GR, 49.1600, 16.8200, O_, [batt('Artillerie de la Garde, batterie de 12 livres Nr. 1', 10, '12', 'pied', 250),
  batt('Artillerie de la Garde, batterie de 6 livres', 10, '6'), batt('Artillerie de la Garde, 2e batterie de 6 livres', 10, '6'),
  batt('Artillerie à cheval de la Garde Nr. 1 (6 livres)', 10, '6', 'cheval')], { ecart: 170 });
ligne('ru', { ...GR, chef: 'Alexandre Ier, Koutouzov' }, 49.1480, 16.7800, O_, [cav('Alexandre Ier, Koutouzov et l\'état-major', 1, 80, 'etat-major', { modele: 'koutouzov' })]);

/* Bilan, pour vérification : effectifs par camp */
export const BILAN = UNITES.reduce((b, u) => { b[u[0]] = (b[u[0]] || 0) + u[6]; return b; }, {});
