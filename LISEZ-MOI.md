# The Eagle Rises

Batailles des guerres napoléoniennes en 3D, pour jouer entre amis.

Première démo : le plateau de Pratzen (Austerlitz, 2 décembre 1805), sur le relief réel.
Pour l'instant : terrain, caméra, bataillons à sélectionner et à faire marcher, en ligne ou en colonne.
Combat : feu de salve, pertes, moral, déroute, IA alliée minimale. Artillerie : mise en batterie, boulet et mitraille, ligne de vue sur le relief.
Formations : ligne, colonne, carré, tirailleurs ; changer de formation prend 15 à 45 secondes, sans marche ni feu pendant ce temps.
Charge à la baïonnette : épreuve des nerfs avant le contact (le défenseur cède, la charge échoue, ou c'est la mêlée), feu à bout portant, fatigue, désordre après le combat.
Cavalerie : trot, galop sur les 150 derniers mètres, poids de choc selon l'arme (cuirassiers, dragons, hussards, cosaques...). Elle balaie l'infanterie surprise hors du carré, les artilleurs et les fuyards, mais se brise sur un carré.
Villages : chaque village est découpé en îlots (une poignée de maisons et leurs granges, l'église, le château). L'infanterie peut s'y retrancher : quelques hommes se postent aux angles des maisons, les autres tirent par les fenêtres ; la garnison est à l'abri (30 % des coups portent) mais son feu est plus maigre. On l'en déloge à la baïonnette (course aux murs, portes enfoncées à coups de crosse, combat dans les maisons, le vaincu ressort par l'arrière et le vainqueur s'installe) ou au canon : les boulets arrachent le chaume, les obus mettent le feu, l'incendie gagne les toits voisins sous le vent, chasse la garnison et laisse des ruines qui fument. La cavalerie ne peut rien contre une garnison.
Effectifs réels : chaque unité a son effectif, et l'échelle (1/1 à 1/20) fixe le nombre d'hommes par figurine.
Deux batailles : Pratzen (démo) ou Austerlitz entière (`index.html?bataille=austerlitz`, 337 unités, Davout arrive à 90 minutes).
Fin de bataille quand 60 % des hommes d'une armée sont dans des unités détruites ou en déroute. Pas encore de multijoueur.

## Commandes de combat
- `1` `2` `3` `4` : ligne, colonne, carré, tirailleurs.
- Clic droit sur une unité ennemie : l'attaquer (se placer à portée et tirer).
- `C`, ou Ctrl + clic droit sur l'ennemi : charger à la baïonnette, à 300 m au plus.
- Cavalerie : clic droit sur l'ennemi pour charger (700 m) ; elle s'approche d'abord si la cible est plus loin.
- Clic droit sur un bâtiment : l'infanterie va occuper l'îlot (les unités suivantes prennent les îlots voisins) ; s'il est tenu par l'ennemi, elle l'enlève à la baïonnette. L'artillerie choisie le bombarde (900 m au plus). Un ordre de marche ou d'attaque fait ressortir la garnison.

Les réglages (portées, durées des manœuvres, vitesses, vigueur en mêlée, seuil de la charge) sont en tête de la section COMBAT de `src/main.js`. Ceux des villages (couvert, feu de la garnison, durée de l'enfoncement des portes, chances de toucher et d'incendier, durée et propagation du feu) sont sur la ligne « villages » de la même section et en tête de `src/villages-combat.js`.

## Jouer
Ouvrir `index.html` dans Chrome, Edge ou Firefox. La page contient tout, sans connexion.

## Version Windows (.exe)
Double-cliquer sur `construire-exe.bat` après chaque mise à jour du code (ou `npm install` puis `npm run exe`). Le jeu est réassemblé et le fichier `dist\The Eagle Rises.exe` est refait ; il se lance seul, sans installation. F11 : plein écran.

À chaque lancement, le .exe télécharge le jeu de la branche main sur GitHub ; hors ligne, il garde la dernière version téléchargée. Il n'y a donc à refaire l'exe que si `appli/` change.

## Fichiers
- `index.html` : le jeu, assemblé. Ne pas le modifier à la main.
- `src/main.js` : le code de la bataille.
- `src/page.html` : la page et l'interface.
- `src/menu.js` : le menu principal (Échap pour y revenir).
- `appli/` : la fenêtre du .exe (Electron).
- `src/carte.js` : la carte : sol, ruisseaux, étangs gelés, routes, villages, faisanderie, et `solAt(x, z)` qui donne la nature du sol (champ, route, eau, glace, village, bois).
- `src/villages-combat.js` : les villages au combat : postes de la garnison, fumées aux fenêtres, portes enfoncées, toits troués, obus, incendie et ruines (particules et état des bâtiments). Les règles (qui entre, qui cède) sont dans `src/main.js`, section VILLAGES. Les îlots et le matériau qui montre les dégâts sont dans `src/carte.js`.
- `src/villages.js` : centres et tracés de rues réels des villages (données OpenStreetMap).
- `src/heights.js` : le relief et les ruisseaux, fabriqués par `python3 outils/relief.py` à partir des images de `donnees/` (les tuiles manquantes sont téléchargées).
- `outils/meshy/` : génère les modèles avec l'API Meshy à partir d'une liste d'unités (`npm run meshy`), voir `outils/meshy/LISEZ-MOI.md`.
- `src/unites.js` : les modèles des soldats et des objets fixes (canon), partagés par le jeu et la galerie.
- `galerie.html` : les soldats, les cavaliers des trois camps et les canons en gros plan, avec leurs animations (assemblée, comme `index.html`).
- `modeles/` : les modèles Meshy d'origine (.glb).
- `outils/convertir_modele.py` : prépare un soldat animé pour la foule, résultat dans `src/modeles/`. Demande Python avec numpy et Pillow. Le fusil est tenu au port d'arme : bras gauche figé dans toutes les animations, fusil vertical contre l'épaule gauche, crosse dans la main.
  - soldat animé par Meshy : `python3 outils/convertir_modele.py modeles/fantassin-francais-anime.glb fr --fusil modeles/fusil-1777.glb`
  - soldat Meshy sans squelette, en pose A : il reprend squelette et animations du Français (`python3 outils/convertir_modele.py modeles/fantassin-autrichien.glb au --squelette modeles/fantassin-francais-anime.glb --fusil modeles/fusil-1777.glb`)
  - Russe animé par Meshy, allégé de 20 000 à 3 000 triangles : `python3 outils/convertir_modele.py modeles/fantassin-russe-anime.glb ru --fusil modeles/fusil-1777.glb --pres 3000`
  - cheval : `python3 outils/convertir_modele.py modeles/cheval-selle-anime.glb cheval-selle --sans-port --pres 3000 --loin 500`
  - cavalier (squelette Mixamo, clip « riding ») : `python3 outils/convertir_modele.py modeles/cavalier-cuirassier-francais-anime.glb cav-fr --sans-port --pres 3000 --loin 500 --selle=0.1224,0.5122,-0.1343 --clips "attente=riding:10:0-1.1,marche=riding:10:0-1.1,course=riding:10:2.4-7.6"` ; idem `cavalier-russe-anime cav-ru --selle=0.1152,0.5294,-0.1461`, `cavalier-autrichien-anime cav-au --selle=0.1124,0.5117,-0.1722`, `cosaque-du-don-anime cosaque --selle=0.1374,0.4956,-0.1606`. `--selle` (en hauteurs de cavalier) pose les hanches sur la selle du cheval, `--clips nom=mot:images par seconde:début-fin` découpe un clip.
  - En jeu : cavalier selon le camp (cosaque pour les cosaques), cheval de selle, robe sombre pour cuirassiers, carabiniers et garde. Le cheval lourd, la licorne russe et le canon autrichien de Meshy ne sont pas utilisés (cheval cabré sans animations, roues de travers) : les trois camps tirent avec le Gribeauval, affût ocre pour les Autrichiens.
- `outils/gestes.py` : les gestes du fantassin, faits à la main d'après le règlement de 1791 et le fusil modèle 1777, sans aucun fichier repris d'un autre jeu : apprêtez armes et joue, feu, charge en douze temps (bassinet, cartouche, amorce, l'arme à gauche, baguette, port d'arme), baïonnette croisée au pas et au pas de course, coup de baïonnette. Chaque geste est une suite de postures-clés (fusil, mains, buste, tête, baguette) ; les bras suivent par cinématique inverse. Le fusil et la baguette ont chacun leur os. `convertir_modele.py` les ajoute à tout soldat converti avec `--fusil` (clips `joue`, `feu`, `recharge`, `charge`, `assaut`, `estoc`). Pour retoucher un geste : modifier les postures en bas du fichier, reconvertir les trois fantassins, `npm run assembler`, puis regarder dans `galerie.html` (boutons en haut à gauche ; `?seul=1&clip=recharge&t=7.2` fige un soldat seul à un instant).
  - En jeu : une ligne qui va tirer met en joue, fait feu, puis chaque homme recharge à son rythme et revient au port d'arme ; en colonne, seuls les deux premiers rangs ; les tirailleurs tirent à volonté, chacun son tour ; la charge se fait baïonnette croisée, la mêlée à coups de baïonnette.
- `outils/convertir_objet.py` : prépare un objet fixe (canon, bâtiment) en mètres, l'avant vers -z (`python3 outils/convertir_objet.py modeles/canon-gribeauval.glb canon --longueur 4.0 --avant=-x --teinte au:vert-ocre`). `--avant=canon` trouve seul l'axe du fût, `--pres N` allège la version de près, `--sans-debris` retire les morceaux posés à l'écart, `--maison` fait une maison de loin en quelques triangles.
- `outils/assembler.js` : refait `index.html` et `galerie.html` (`npm install`, puis `npm run assembler`).

## À vérifier
- L'ordre de bataille et les positions de départ sont provisoires.
- Les villages sont à l'échelle 1/1 et suivent leur vrai plan : centres, rues, églises et châteaux viennent d'OpenStreetMap (`src/villages.js`, © les contributeurs d'OpenStreetMap, licence ODbL). Ce sont les rues d'aujourd'hui, qui gardent pour l'essentiel le tracé ancien ; le nombre de maisons de 1805 reste un ordre de grandeur. Les chemins entre villages, la faisanderie de Sokolnitz, la forme des châteaux et celle des étangs sont encore approximatifs.
- Tout est à l'échelle 1/1 : distances, relief et taille des soldats. `VE` (src/carte.js) et `SC` (src/main.js) permettent de regrossir le relief ou les figurines.
