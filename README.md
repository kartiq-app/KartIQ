# KartIQ V5.2.2 — Modularisation CSS

Cette version inaugure la refactorisation progressive du projet. Le CSS est désormais externalisé et découpé en modules séquentiels chargés par `static/css/kartiq.css`, sans modification fonctionnelle attendue. Consultez `docs/ARCHITECTURE.md` et `docs/VALIDATION_V5.md`.

# KartIQ V4.5.5

## Nouveautés

- Focus Sprint : le meilleur dernier tour est affiché sur une seule ligne, sans deux-points : `🔥 Martin Guerard 1:18.345`.
- Focus Sprint : la zone de classement du dernier tour utilise désormais 100 % de la largeur utile de la colonne du pilote suivi.
- La taille de `2ÈME TEMPS`, `10ÈME TEMPS`, etc. s’adapte avec `clamp()` tout en restant centrée et non tronquée.
- Les évolutions de navigation des pages Qualification et Sprint de la V4.5.3 sont conservées.


## V5.2.2

La case 🔥 du mode Sprint utilise désormais trois couleurs : orange sans amélioration personnelle, vert en cas de nouveau meilleur temps personnel et violet pour le meilleur temps absolu de la session.

Cette version organise le JavaScript par domaines fonctionnels (`core`, `sprint`, `qualification`, `ui`, `endurance`) sans modifier la logique métier ni l’interface.

## V5.0.2

Le fichier JavaScript unique a été découpé en six fichiers classiques, chargés dans le même ordre que le code d’origine :

```text
static/js/
├── 00-core.js
├── 10-sprint.js
├── 20-qualification.js
├── 30-race-ui.js
├── 40-endurance-queues.js
└── 50-pwa-bootstrap.js
```

Aucune fonction n’a été renommée ou réécrite dans cette version.
