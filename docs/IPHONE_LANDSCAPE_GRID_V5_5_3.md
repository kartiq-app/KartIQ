# KartIQ V5.5.3 — Grille iPhone en paysage

## Problème observé

Sur certains iPhone en paysage, la somme des largeurs minimales de la ligne supérieure dépassait la largeur réelle du viewport CSS. La cinquième colonne était donc repoussée vers la droite : le temps était centré dans sa colonne, mais une partie de cette colonne se trouvait hors écran.

## Correction

Pour les écrans en paysage jusqu’à 950 px CSS :

- la ligne supérieure utilise cinq colonnes proportionnelles : `9% 23% 14% 34% 20%` ;
- toutes les cellules peuvent se réduire avec `min-width: 0` ;
- la colonne Temps/Tours reste explicitement en colonne 5 ;
- les deux valeurs conservent leur positionnement sur deux moitiés égales ;
- tout débordement horizontal est bloqué.

## Portée

La correction concerne uniquement Qualification et Sprint sur les petits écrans en paysage. Desktop, portrait, vues Focus et Endurance ne sont pas modifiés.
