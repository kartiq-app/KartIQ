# Cohérence des versions — KartIQ V5.3.3

## Objectif

Éviter qu’une future livraison affiche plusieurs numéros de version différents selon la page, l’API ou le terminal.

## Source principale

La version applicative est maintenant déclarée une seule fois dans `app.py` :

```python
APP_VERSION = "5.3.3"
```

Cette constante alimente :

- `STATE["version"]` et donc l’API ;
- le rendu de `templates/index.html` ;
- le titre de la page ;
- le numéro affiché dans le bandeau ;
- le numéro affiché sur l’accueil ;
- les paramètres `?v=` des fichiers CSS et JavaScript ;
- le message affiché au lancement local.

## Cache PWA

`static/sw.js` reste volontairement versionné explicitement avec :

```javascript
const CACHE = 'kartiq-v5-3-3';
```

Le service worker est un fichier statique exécuté directement par le navigateur et ne passe pas par le moteur de templates Flask.

## Hygiène Git

Le fichier `.gitignore` exclut désormais :

- `__pycache__/` et `*.pyc` ;
- les environnements virtuels ;
- les journaux et captures locales ;
- les fichiers macOS et d’éditeur ;
- les archives générées.

## Impact

Aucun calcul, sélecteur CSS ou comportement fonctionnel n’a été modifié.
