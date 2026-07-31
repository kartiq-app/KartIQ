# Consolidation CSS sûre — KartIQ V5.3.2

Cette étape poursuit le nettoyage sans modifier le rendu attendu.

## Suppressions effectuées

Six règles strictement identiques ont été supprimées en conservant leur dernière occurrence :

- une règle mobile commune aux positions Qualification et Sprint dans `00-foundations.css` ;
- quatre règles de largeur des colonnes Sprint paysage dans `40-landscape-overrides.css` ;
- une règle `qual-delta-focus-cell` en Qualification portrait dans `40-landscape-overrides.css`.

Ces suppressions sont sûres : le sélecteur, le contexte de media query et les déclarations étaient identiques.

## Nettoyage de l’archive

Les répertoires `__pycache__` et fichiers `.pyc` générés localement ne sont plus inclus dans l’archive GitHub.

## Hors périmètre

Aucune règle seulement supposée obsolète n’a été supprimée. Aucun regroupement de media queries et aucune réécriture de sélecteur n’ont été réalisés.
