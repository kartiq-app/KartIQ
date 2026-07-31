# V5.5.13 — Rafraîchissement live

## Objectif

Réduire le décalage visuel constaté entre Apex Timing et KartIQ, qui pouvait atteindre environ une seconde.

## Modification

- Fréquence de lecture de `/api/state` : **1000 ms → 250 ms**.
- Une seule requête d'état peut être active à la fois.
- Les réponses ne sont pas servies depuis le cache du navigateur (`cache: 'no-store'`).
- Une erreur ponctuelle ne remplace pas le dernier état valide affiché.

## Périmètre

Cette mise à jour ne modifie ni le design, ni les classements, ni la logique des modes Qualification, Sprint et Endurance.
