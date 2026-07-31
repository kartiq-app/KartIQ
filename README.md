# KartIQ V5.0.1 Foundation JavaScript

Cette version inaugure la refactorisation progressive du projet. Le CSS est désormais externalisé dans `static/css/kartiq.css`, sans modification fonctionnelle attendue. Consultez `docs/ARCHITECTURE.md` et `docs/VALIDATION_V5.md`.

# KartIQ V4.5.5

## Nouveautés

- Focus Sprint : le meilleur dernier tour est affiché sur une seule ligne, sans deux-points : `🔥 Martin Guerard 1:18.345`.
- Focus Sprint : la zone de classement du dernier tour utilise désormais 100 % de la largeur utile de la colonne du pilote suivi.
- La taille de `2ÈME TEMPS`, `10ÈME TEMPS`, etc. s’adapte avec `clamp()` tout en restant centrée et non tronquée.
- Les évolutions de navigation des pages Qualification et Sprint de la V4.5.3 sont conservées.


## V5.0.1

Le JavaScript applicatif a été extrait de `index.html` vers `static/js/kartiq.js` sans modification de logique ni d’ordre d’exécution.
