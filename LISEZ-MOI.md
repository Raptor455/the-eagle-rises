# The Eagle Rises

Batailles des guerres napoléoniennes en 3D, pour jouer entre amis.

Première démo : le plateau de Pratzen (Austerlitz, 2 décembre 1805), sur le relief réel.
Pour l'instant : terrain, caméra, bataillons à sélectionner et à faire marcher, en ligne ou en colonne.
Combat : feu de salve, pertes, moral, déroute, IA alliée minimale. Artillerie : mise en batterie, boulet et mitraille, ligne de vue sur le relief.
Formations : ligne, colonne, carré, tirailleurs ; changer de formation prend 15 à 45 secondes, sans marche ni feu pendant ce temps.
Charge à la baïonnette : épreuve des nerfs avant le contact (le défenseur cède, la charge échoue, ou c'est la mêlée), feu à bout portant, fatigue, désordre après le combat.
Cavalerie : trot, galop sur les 150 derniers mètres, poids de choc selon l'arme (cuirassiers, dragons, hussards, cosaques...). Elle balaie l'infanterie surprise hors du carré, les artilleurs et les fuyards, mais se brise sur un carré.
Effectifs réels : chaque unité a son effectif, et l'échelle (1/1 à 1/20) fixe le nombre d'hommes par figurine.
Deux batailles : Pratzen (démo) ou Austerlitz entière (`index.html?bataille=austerlitz`, 337 unités, Davout arrive à 90 minutes).
Fin de bataille quand 60 % des hommes d'une armée sont dans des unités détruites ou en déroute. Pas encore de multijoueur.

## Commandes de combat
- `1` `2` `3` `4` : ligne, colonne, carré, tirailleurs.
- Clic droit sur une unité ennemie : l'attaquer (se placer à portée et tirer).
- `C`, ou Ctrl + clic droit sur l'ennemi : charger à la baïonnette, à 300 m au plus.
- Cavalerie : clic droit sur l'ennemi pour charger (700 m) ; elle s'approche d'abord si la cible est plus loin.

Les réglages (portées, durées des manœuvres, vitesses, vigueur en mêlée, seuil de la charge) sont en tête de la section COMBAT de `src/main.js`.

## Jouer
Ouvrir `index.html` dans Chrome, Edge ou Firefox. La page contient tout, sans connexion.

## Fichiers
- `index.html` : le jeu, assemblé. Ne pas le modifier à la main.
- `src/main.js` : le code de la bataille.
- `src/page.html` : la page et l'interface.
- `src/heights.js` : le relief, tiré des deux images de `donnees/`.
- `modeles/` : les modèles Meshy d'origine (.glb).
- `outils/convertir_modele.py` : prépare un soldat animé pour la foule, avec son fusil (`python3 outils/convertir_modele.py modeles/fantassin-francais-anime.glb fr --fusil modeles/fusil-1777.glb`), résultat dans `src/modeles/`. Demande Python avec numpy et Pillow.
- `outils/meshy/` : génère les modèles avec l'API Meshy à partir d'une liste d'unités (`npm run meshy`), voir `outils/meshy/LISEZ-MOI.md`.
- `outils/assembler.js` : refait `index.html` (`npm install`, puis `npm run assembler`).

## À vérifier
- L'ordre de bataille et les positions de départ sont provisoires.
- Les noms de villages sont placés approximativement.
- Le relief vertical est grossi 2,5 fois pour que les pentes se lisent.
