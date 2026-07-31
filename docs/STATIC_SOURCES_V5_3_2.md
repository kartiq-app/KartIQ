# Sources statiques unifiées — KartIQ V5.3.2

## Objectif

Éliminer les copies identiques qui pouvaient diverger lors d’une future modification, sans changer le comportement de l’application.

## Sources de vérité

- HTML : `templates/index.html`
- CSS, JavaScript, manifest, service worker, images, polices et icônes : `static/`

## Éléments supprimés à la racine

- `index.html`
- `manifest.json`
- `sw.js`
- `assets/`
- `fonts/`
- `icons/`

Ces éléments étaient des copies des fichiers réellement utilisés par Flask ou par le navigateur.

## PWA

Le service worker réellement enregistré est `static/sw.js`. Sa liste de précache comprend désormais `kartiq.css` et les six modules CSS qu’il importe, afin que le mode hors connexion ne dépende pas d’un ancien service worker inutilisé à la racine.

## Impact attendu

Aucun changement d’interface, de calcul ou de connexion Apex. Cette version réduit seulement le risque qu’une modification soit appliquée à une mauvaise copie.
