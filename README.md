# KartIQ V5.4.0 — Fondations backend modulaires

Application web d’analyse du live timing Apex Timing pour les modes Qualification, Sprint et Endurance.

## V5.4.0

Cette version commence le nettoyage interne du backend sans modifier le comportement de l'application :

- création du package `backend/` ;
- centralisation de la version, du nom de release et du catalogue des circuits dans `backend/config.py` ;
- centralisation des journaux Apex et de la boîte noire dans `backend/logging_tools.py` ;
- déplacement de l'utilitaire d'adresse réseau dans `backend/network.py` ;
- réduction des responsabilités techniques de `app.py` ;
- routes, réponses JSON, connexion Apex et interface inchangées.

La documentation détaillée se trouve dans `docs/BACKEND_FOUNDATIONS_V5_4_0.md`.

## Lancement local

```bash
python3 app.py
```

KartIQ est ensuite disponible sur `http://127.0.0.1:8200`.

## Structure

- `app.py` : serveur Flask, état métier, connexion Apex et routes ;
- `backend/` : configuration, journaux et utilitaires techniques ;
- `templates/index.html` : interface principale ;
- `static/css/` : feuilles de style modulaires ;
- `static/js/` : modules JavaScript par domaine ;
- `static/sw.js` : service worker PWA ;
- `config/circuits.json` : catalogue des circuits ;
- `docs/` : documentation technique et historique des refactorisations.
