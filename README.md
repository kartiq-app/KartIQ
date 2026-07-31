# KartIQ V5.4.1 — Modularisation métier du backend

Application web d’analyse du live timing Apex Timing pour les modes Qualification, Sprint et Endurance.

## V5.4.1

Cette version extrait de `app.py` le cœur métier qui transforme les données Apex en état KartIQ :

- création de `backend/services/race_state.py` ;
- centralisation des historiques de tours et des marqueurs de passage ;
- extraction des calculs Qualification, Sprint et Endurance ;
- extraction de la construction du payload envoyé à l’interface ;
- centralisation de la remise à zéro lors d’un changement de circuit ;
- réduction de `app.py` de 904 à 558 lignes ;
- conservation des mêmes routes, réponses JSON et comportements visibles.

La documentation détaillée se trouve dans `docs/BACKEND_BUSINESS_V5_4_1.md`.

## Lancement local

```bash
python3 app.py
```

KartIQ est ensuite disponible sur `http://127.0.0.1:8200`.

## Structure

- `app.py` : serveur Flask, connexion Apex et routes HTTP ;
- `backend/services/race_state.py` : état métier et calculs Qualification, Sprint et Endurance ;
- `backend/config.py` : version, nom de release et catalogue des circuits ;
- `backend/logging_tools.py` : journaux Apex et boîte noire ;
- `backend/network.py` : utilitaires réseau ;
- `templates/index.html` : interface principale ;
- `static/css/` : feuilles de style modulaires ;
- `static/js/` : modules JavaScript par domaine ;
- `static/sw.js` : service worker PWA ;
- `config/circuits.json` : catalogue des circuits ;
- `docs/` : documentation technique et historique des refactorisations.
