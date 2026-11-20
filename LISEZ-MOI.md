# The Eagle Rises

Batailles des guerres napoléoniennes en 3D, pour jouer entre amis.

Première démo : le plateau de Pratzen (Austerlitz, 2 décembre 1805), sur le relief réel.
Pour l'instant : terrain, caméra, bataillons à sélectionner et à faire marcher, en ligne ou en colonne.
Premier combat : feu de salve, pertes, moral, déroute, IA alliée minimale. Artillerie : mise en batterie, boulet et mitraille, ligne de vue sur le relief. Pas encore de mêlée, de cavalerie ni de multijoueur.

## Jouer
Ouvrir `index.html` dans Chrome, Edge ou Firefox. La page contient tout, sans connexion.

## Fichiers
- `index.html` : le jeu, assemblé. Ne pas le modifier à la main.
- `src/main.js` : le code de la bataille.
- `src/page.html` : la page et l'interface.
- `src/heights.js` : le relief, tiré des deux images de `donnees/`.
- `src/unites.js` : les modèles des soldats et des objets fixes (canon), partagés par le jeu et la galerie.
- `galerie.html` : les soldats des trois camps et les canons en gros plan, avec leurs animations (assemblée, comme `index.html`).
- `modeles/` : les modèles Meshy d'origine (.glb).
- `outils/convertir_modele.py` : prépare un soldat animé pour la foule, résultat dans `src/modeles/`. Demande Python avec numpy et Pillow. Le fusil est tenu au port d'arme : bras gauche figé dans toutes les animations, fusil vertical contre l'épaule gauche, crosse dans la main.
  - soldat animé par Meshy : `python3 outils/convertir_modele.py modeles/fantassin-francais-anime.glb fr --fusil modeles/fusil-1777.glb`
  - soldat Meshy sans squelette, en pose A : il reprend squelette et animations du Français (`python3 outils/convertir_modele.py modeles/fantassin-russe.glb ru --squelette modeles/fantassin-francais-anime.glb --fusil modeles/fusil-1777.glb`, idem `fantassin-autrichien.glb au`)
- `outils/convertir_objet.py` : prépare un objet fixe (canon, bâtiment) en mètres, l'avant vers -z (`python3 outils/convertir_objet.py modeles/canon-gribeauval.glb canon --longueur 4.0 --avant=-x --teinte au:vert-ocre`).
- `outils/assembler.js` : refait `index.html` et `galerie.html` (`npm install`, puis `npm run assembler`).

## À vérifier
- L'ordre de bataille et les positions de départ sont provisoires.
- Les noms de villages sont placés approximativement.
- Le relief vertical est grossi 2,5 fois pour que les pentes se lisent.
