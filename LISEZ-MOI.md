# The Eagle Rises

Batailles des guerres napoléoniennes en 3D, pour jouer entre amis.

Première démo : le plateau de Pratzen (Austerlitz, 2 décembre 1805), sur le relief réel.
Pour l'instant : terrain, caméra, bataillons à sélectionner et à faire marcher, en ligne ou en colonne.
Pas encore de combat, de moral ni de multijoueur.

## Jouer
Ouvrir `index.html` dans Chrome, Edge ou Firefox. La page contient tout, sans connexion.

## Fichiers
- `index.html` : le jeu, assemblé. Ne pas le modifier à la main.
- `src/main.js` : le code de la bataille.
- `src/page.html` : la page et l'interface.
- `src/heights.js` : le relief, tiré des deux images de `donnees/`.
- `modeles/` : les modèles Meshy d'origine (.glb).
- `outils/convertir_modele.py` : prépare un modèle pour la foule (`python3 outils/convertir_modele.py modeles/fantassin-francais.glb fr`), résultat dans `src/modeles/`.
- `outils/assembler.js` : refait `index.html` (`npm install`, puis `npm run assembler`).

## À vérifier
- L'ordre de bataille et les positions de départ sont provisoires.
- Les noms de villages sont placés approximativement.
- Le relief vertical est grossi 2,5 fois pour que les pentes se lisent.
