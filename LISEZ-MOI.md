# The Eagle Rises

Batailles des guerres napoléoniennes en 3D, pour jouer entre amis.

Première démo : le plateau de Pratzen (Austerlitz, 2 décembre 1805), sur le relief réel.
Pour l'instant : terrain, caméra, bataillons à sélectionner et à faire marcher, en ligne ou en colonne.
Premier combat : feu de salve, pertes, moral, déroute, IA alliée minimale. Artillerie : mise en batterie, boulet et mitraille, ligne de vue sur le relief. Pas encore de mêlée, de cavalerie ni de multijoueur.

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
- `src/heights.js` : le relief, tiré des deux images de `donnees/`.
- `src/carte.js` : la carte : sol, ruisseaux, étangs gelés, routes, villages, faisanderie, et `solAt(x, z)` qui donne la nature du sol (champ, route, eau, glace, village, bois).
- `src/heights.js` : le relief et les ruisseaux, fabriqués par `python3 outils/relief.py` à partir des images de `donnees/` (les tuiles manquantes sont téléchargées).
- `modeles/` : les modèles Meshy d'origine (.glb).
- `outils/convertir_modele.py` : prépare un soldat animé pour la foule, avec son fusil (`python3 outils/convertir_modele.py modeles/fantassin-francais-anime.glb fr --fusil modeles/fusil-1777.glb`), résultat dans `src/modeles/`. Demande Python avec numpy et Pillow.
- `outils/meshy/` : génère les modèles avec l'API Meshy à partir d'une liste d'unités (`npm run meshy`), voir `outils/meshy/LISEZ-MOI.md`.
- `outils/assembler.js` : refait `index.html` (`npm install`, puis `npm run assembler`).

## À vérifier
- L'ordre de bataille et les positions de départ sont provisoires.
- Les villages, les routes, la faisanderie de Sokolnitz et les étangs de Satschan et de Menitz sont placés approximativement, à vérifier sur une carte d'époque.
- Le relief vertical est grossi 2,5 fois pour que les pentes se lisent.
