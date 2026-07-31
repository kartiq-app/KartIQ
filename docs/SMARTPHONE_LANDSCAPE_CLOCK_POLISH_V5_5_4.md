# KartIQ V5.5.4 — Polish Temps/Tours smartphone paysage

## Objectif

Améliorer la lisibilité et l’esthétique de la dernière case de la ligne supérieure dans les modes Qualification et Sprint sur smartphone en paysage.

## Modifications

- Suppression du séparateur horizontal entre le temps restant et le nombre de tours.
- Augmentation exacte de 30 % de la taille des deux valeurs : de 18 px à 23,4 px.
- Conservation de la taille actuelle des libellés et du centrage validé en V5.5.3.

## Périmètre

La règle est limitée à :

```css
@media (orientation: landscape) and (max-width: 950px) and (hover: none) and (pointer: coarse)
```

Elle cible les smartphones tactiles en paysage et ne modifie pas le rendu Desktop. Les modes portrait, Focus et Endurance restent inchangés.
