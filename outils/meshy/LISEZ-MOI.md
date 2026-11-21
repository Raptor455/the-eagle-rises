# Générer les modèles avec Meshy

`npm run meshy` lit `outils/meshy/unites.json`, demande chaque modèle à Meshy (forme, texture, squelette, animations), attend la fin et range les fichiers dans `modeles/`.

## 1. La clé (une seule fois)
1. Il faut un abonnement Meshy payant (Pro ou plus) : le compte gratuit ne peut pas créer de clé API.
2. Sur https://www.meshy.ai/developers/keys, créer une clé. Elle commence par `msy_`.
3. À la racine du dépôt, créer un fichier `.env` qui contient une seule ligne :
   ```
   MESHY_API_KEY=msy_ta_cle
   ```
   Ce fichier est ignoré par git : il ne part jamais sur GitHub. Ne colle la clé nulle part ailleurs.
   (Autre possibilité : la variable d'environnement `MESHY_API_KEY`.)

## 2. Lancer
- `npm run meshy -- --essai` : montre ce qui serait fait et le coût estimé en crédits, sans rien dépenser.
- `npm run meshy` : génère tout ce qui manque dans `modeles/`.
- `npm run meshy -- fantassin-russe` : une seule unité.
- `npm run meshy -- --refaire fantassin-russe` : recommence cette unité de zéro.
- `npm run meshy -- --refaire-animations fantassin-russe` : refait seulement les animations (environ 12 crédits).
- `npm run meshy -- --animations shoot` : liste les animations Meshy qui contiennent « shoot » (gratuit), pour choisir.

Compter 5 à 10 minutes par unité. Si le script s'arrête (coupure, erreur), relancer la même commande : il reprend où il en était, sans repayer ce qui est déjà fait. Meshy garde les résultats 3 jours.

## 3. Ce qui sort, pour une unité `nom`
- `modeles/nom.glb` : le modèle texturé.
- `modeles/nom-rig.glb` : avec squelette (os au format Mixamo, comme le fantassin français).
- `modeles/nom-anime.glb` : squelette et animations, nommées `walking`, `running`, `idle`, `shooting`, prêtes pour
  `python3 outils/convertir_modele.py modeles/nom-anime.glb ru --fusil modeles/fusil-1777.glb`.

## 4. Ajouter une unité
Ajouter un bloc dans `unites.json` :
- `nom` : nom des fichiers.
- `prompt` : description en anglais (meilleurs résultats), ou `image` : chemin d'une image (jpg, png, webp) à la place.
- `texture_prompt` : facultatif, précise les couleurs et matières.
- `squelette` : `true` pour un personnage debout (bipède). Laisser `false` pour un canon, un objet.
- `quadrupede` : `true` (avec `squelette`) pour un cheval ou un autre animal à quatre pattes : squelette quadrupède et animations de la bibliothèque cheval (Horse-Walk, Horse-Canter…).
- `animations` : nom dans le jeu → nom exact d'une animation Meshy (voir `--animations`), ou numéro `action_id`. Pour un fantassin : Casual Walk, Run 2, Idle 12, Walk Forward While Shooting (les deux derniers sont ceux du Français).
- `taille_m`, `pose_mode` (`a-pose` conseillé pour le squelette), et dans `defauts` : `ai_model`, `target_polycount`, `texture_resolution`.

## Coût indicatif (crédits Meshy)
Texte → 3D avec texture : ~30. Image → 3D : ~30. Squelette : 5. Animation : 3 par animation.
Une unité de soldat complète : ~47 crédits. Les tâches qui échouent sont remboursées par Meshy.
