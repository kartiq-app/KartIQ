# KartIQ V5.5.9 — Centrage Temps/Tours smartphone paysage

## Problème corrigé

Les règles iPhone historiques conservaient `position:absolute` sur les valeurs. Elles restaient donc collées au haut de la case malgré l’ajout d’un conteneur Flex.

## Correction

- réinitialisation explicite de `position`, `top`, `bottom`, `left` et `right` ;
- groupe Temps/Tours centré avec Flexbox ;
- temps affiché à 160 % de la taille de base ;
- tours affichés à 82 % de la même taille de base ;
- calcul dynamique commun selon la largeur et la hauteur disponibles ;
- marge de sécurité pour éviter tout débordement.

La règle cible uniquement les appareils tactiles en paysage dont la hauteur de viewport est inférieure ou égale à 500 px.
