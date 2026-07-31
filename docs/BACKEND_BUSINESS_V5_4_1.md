# Modularisation métier du backend — KartIQ V5.4.1

## Objectif

La V5.4.1 sépare le serveur HTTP du cœur métier de KartIQ sans modifier les fonctionnalités visibles.

Avant cette version, `app.py` assurait simultanément la connexion Apex, les routes Flask, le suivi des tours, les calculs Qualification et Sprint, la gestion des pénalités et la préparation de l’état envoyé au navigateur.

## Nouveau service métier

```text
backend/
└── services/
    ├── __init__.py
    └── race_state.py
```

`RaceStateService` possède désormais les responsabilités suivantes :

- convertir les chronos Apex en secondes et les reformater ;
- conserver l’historique récent des tours ;
- déterminer l’amélioration personnelle du dernier tour ;
- calculer le meilleur pilote du tour précédent en Sprint ;
- calculer le meilleur temps absolu de session ;
- produire les données du popup de passage Qualification ;
- maintenir l’état courant des pénalités Apex ;
- construire le payload complet envoyé par `/api/state` ;
- remettre à zéro l’état métier lors d’un changement de circuit.

## Responsabilités conservées par `app.py`

`app.py` reste le point d’entrée et continue de gérer :

- l’application Flask et ses routes ;
- la connexion WebSocket Apex ;
- le décodage initial des trames ;
- l’enregistrement des événements ;
- les outils développeur et l’export des journaux ;
- le démarrage local du serveur.

## Compatibilité

Des fonctions relais courtes restent dans `app.py` (`payload`, `sync_state_from_race`, `driver_by_name`, etc.). Elles conservent les appels existants tout en déléguant le travail au service métier. Cette stratégie réduit le risque de régression pendant la transition.

Les éléments suivants restent inchangés :

- URLs des routes ;
- méthodes HTTP ;
- structure des réponses JSON ;
- logique de suivi d’un pilote ;
- calculs Qualification et Sprint ;
- pénalités et Quick Change ;
- connexion et protocole Apex ;
- interface utilisateur.

## Mesure

```text
app.py avant : 904 lignes
app.py après : 558 lignes
service métier : 386 lignes
```

Le volume total change peu : le bénéfice recherché est la séparation claire des responsabilités et la facilité de modification future.
