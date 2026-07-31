# KartIQ V6.0.4 — Endurance aligné sur Qualification

Le mode Endurance réutilise désormais directement l’écran `#qualification`.

## Objectif

Garantir une correspondance stricte entre Qualification et Endurance pour :

- le contenu ;
- le desktop ;
- le smartphone portrait ;
- le smartphone paysage ;
- le mode Focus.

Le mode métier reste `endurance` (`data-app-mode="endurance"` et appel API `/api/mode`), tandis que la couche visuelle est celle de Qualification. L’accent orange est appliqué uniquement par des sélecteurs ciblés sur `data-app-mode="endurance"`.
