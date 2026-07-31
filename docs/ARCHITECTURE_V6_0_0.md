# KartIQ V6.0.0 — Architecture quatre modes

## Modes

- `qualification` : module Qualification stable.
- `sprint` : module Sprint stable.
- `endurance` : nouvelle vue initialement identique à Qualification.
- `analyzer` : ancien dashboard Endurance et ses outils d’analyse.

Le mode visuel Endurance réutilise volontairement les composants et styles Qualification, mais possède ses propres identifiants DOM afin de pouvoir évoluer indépendamment.
