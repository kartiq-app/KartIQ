# KartIQ V5.5.2 — Centrage iPhone en paysage

## Objectif

Corriger le centrage vertical et horizontal du temps restant et du nombre de tours dans la dernière case de la première ligne des modes Qualification et Sprint sur Safari iOS en orientation paysage.

## Correction

Pour les écrans paysage jusqu’à 950 px de largeur :

- la case Temps/Tours devient un conteneur positionné ;
- le temps occupe explicitement la moitié supérieure ;
- le nombre de tours occupe explicitement la moitié inférieure ;
- chaque valeur est centrée avec Flexbox ;
- le séparateur central est conservé.

Cette approche évite une différence d’interprétation de l’alignement CSS Grid observée sur Safari iPhone.

## Périmètre

- Qualification paysage : corrigé ;
- Sprint paysage : corrigé ;
- Desktop : comportement précédent conservé ;
- Portrait, Focus et Endurance : aucun changement.
