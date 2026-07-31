# Architecture KartIQ V5.0.2

## Objectif

La V5.0.2 découpe le JavaScript en fichiers thématiques sans modifier la logique métier ni l’interface attendue.

## Arborescence actuelle

```text
KartIQ/
├── app.py                     # Serveur Flask, API locale et connexion Apex
├── templates/index.html       # Structure HTML et JavaScript historique
├── static/css/kartiq.css      # Tous les styles extraits de index.html
├── static/assets/             # Images de l’interface
├── static/fonts/              # Polices
├── static/icons/              # Icônes PWA
├── static/manifest.json       # Manifest PWA
├── static/sw.js               # Service worker servi par Flask
├── config/circuits.json       # Configuration des circuits
├── apex_*.py                  # Décodage et interprétation Apex
├── protocol_engine.py         # Traitement du protocole
└── event_store.py             # Historique des événements
```

## Étape réalisée

- Extraction intégrale du bloc `<style>` vers `static/css/kartiq.css`.
- Conservation stricte de l’ordre des règles CSS pour éviter les régressions de cascade.
- Aucun sélecteur supprimé, renommé ou réorganisé.
- Aucun JavaScript déplacé dans cette étape.
- Mise à jour du cache PWA pour charger la feuille externe.

## Prochaine étape recommandée

Après validation visuelle et fonctionnelle, séparer progressivement le JavaScript par domaine sans réécrire les fonctions : connexion Apex, interface commune, Qualification, Sprint et Endurance.


## JavaScript

- `static/js/00-core.js` : état global, compte à rebours, connexion Apex et navigation.
- `static/js/10-sprint.js` : mode Focus et calculs Sprint.
- `static/js/20-qualification.js` : mode Focus et calculs Qualification.
- `static/js/30-race-ui.js` : rendu commun, classements, suivi pilote et actions UI.
- `static/js/40-endurance-queues.js` : gestion locale des files de karts.
- `static/js/50-pwa-bootstrap.js` : plein écran, PWA et initialisation finale.
- Les fonctions, variables globales et l’ordre d’exécution sont conservés à l’identique.
- La modularisation par fonctionnalité sera réalisée dans une étape ultérieure, après validation de cette extraction.
