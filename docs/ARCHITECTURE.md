# Architecture KartIQ V5.1.2

## Objectif

La V5.1.2 introduit une organisation JavaScript par domaines fonctionnels, sans modification volontaire du comportement, des calculs ni de l’interface.

## Arborescence principale

```text
static/
├── css/
│   └── kartiq.css
└── js/
    ├── core/
    │   ├── core.js
    │   └── bootstrap.js
    ├── sprint/
    │   └── sprint.js
    ├── qualification/
    │   └── qualification.js
    ├── endurance/
    │   └── queues.js
    └── ui/
        └── race-ui.js
```

## Principe de sécurité

Le contenu des six scripts de la V5.0.2 a uniquement été déplacé et renommé. Leur ordre de chargement reste identique. Les dépendances globales existantes sont donc conservées.

Voir `docs/MODULES.md` pour la responsabilité et l’ordre de chargement de chaque fichier.
