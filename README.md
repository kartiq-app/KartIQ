# KartIQ V5.3.3 — Cohérence des versions

Application web d’analyse du live timing Apex Timing pour les modes Qualification, Sprint et Endurance.

## V5.3.3

Cette version réduit les risques d’oubli lors des futures mises à jour :

- la version applicative est définie une seule fois dans `app.py` avec `APP_VERSION` ;
- le titre, le bandeau, la page d’accueil et les paramètres de cache des ressources HTML utilisent cette valeur via Jinja ;
- `STATE["version"]` utilise la même constante ;
- le message de démarrage utilise également cette source unique ;
- ajout d’un `.gitignore` pour exclure les caches Python, journaux, captures et fichiers système ;
- correction de l’intitulé V5.3.1 dans le changelog.

Le cache PWA conserve sa propre clé explicite dans `static/sw.js`, car ce fichier est exécuté côté navigateur.

## Lancement local

```bash
python3 app.py
```

KartIQ est ensuite disponible sur `http://127.0.0.1:8200`.

## Structure

- `app.py` : serveur Flask et état de l’application ;
- `templates/index.html` : interface principale ;
- `static/css/` : feuilles de style modulaires ;
- `static/js/` : modules JavaScript par domaine ;
- `static/sw.js` : service worker PWA ;
- `config/circuits.json` : catalogue des circuits ;
- `docs/` : documentation technique et historique des refactorisations.
