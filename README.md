# KartIQ V5.5.1 — Centrage temps et tours en paysage

Application web d’analyse du live timing Apex Timing pour les modes Qualification, Sprint et Endurance.


## V5.5.1

Cette version apporte un ajustement visuel ciblé aux modes Qualification et Sprint en orientation paysage :

- centrage horizontal et vertical strict du temps restant ;
- centrage horizontal et vertical strict du nombre de tours ;
- ciblage limité à la dernière case de la première ligne ;
- aucun changement en mode portrait, Focus, Endurance ou dans la logique métier.

Le détail de la modification se trouve dans `docs/LANDSCAPE_CLOCK_CENTERING_V5_5_1.md`.

## V5.5.0

Cette version clôt la refactorisation V5 avec une validation technique reproductible :

- audit Python, JavaScript, JSON, CSS et PWA ;
- suppression d’un import Python devenu inutilisé ;
- tests unitaires des conversions fondamentales du service métier ;
- ajout de `scripts/quality_check.py` ;
- nettoyage des fichiers générés de l’archive GitHub ;
- synchronisation de la version et du cache PWA ;
- aucun changement visuel ou métier attendu.

Le rapport complet se trouve dans `docs/QUALITY_AUDIT_V5_5_0.md`.

## Lancement local

```bash
python3 app.py
```

KartIQ est ensuite disponible sur `http://127.0.0.1:8200`.

## Validation technique

```bash
python3 scripts/quality_check.py
python3 -m unittest discover -s tests -v
```

Le contrôle JavaScript est effectué automatiquement lorsque Node.js est installé.

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
- `scripts/quality_check.py` : validation statique du dépôt ;
- `tests/` : tests unitaires sans réseau ;
- `docs/` : documentation technique et historique des refactorisations.
