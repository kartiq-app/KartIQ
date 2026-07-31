# Fondations backend modulaires — KartIQ V5.4.0

## Objectif

Réduire progressivement la taille et les responsabilités de `app.py` sans modifier les routes, les calculs métier ni le comportement du live Apex.

## Nouveaux modules

```text
backend/
├── __init__.py
├── config.py
├── logging_tools.py
└── network.py
```

### `backend/config.py`

Centralise :

- `APP_DIR` ;
- `APP_VERSION` ;
- `APP_RELEASE_NAME` ;
- le chargement et le tri du catalogue `config/circuits.json`.

### `backend/logging_tools.py`

Le gestionnaire `ApexLogManager` centralise :

- les chemins des journaux ;
- l'écriture du journal live ;
- la capture des trames entrantes et sortantes ;
- la remise à zéro d'une nouvelle capture.

Les noms historiques utilisés par `app.py` restent disponibles afin de préserver le comportement des routes d'export et de diagnostic.

### `backend/network.py`

Contient l'utilitaire pur `local_ip()` utilisé au démarrage de l'application.

## Garantie de compatibilité

Cette version ne change volontairement aucun contrat externe :

- mêmes URL et mêmes méthodes HTTP ;
- mêmes clés JSON ;
- mêmes fichiers de logs ;
- même port 8200 ;
- même connexion Apex ;
- aucun changement visuel attendu.

Cette extraction constitue la première étape du nettoyage backend. Les routes et la logique de synchronisation resteront séparées dans des versions ultérieures, après validation de cette fondation.
