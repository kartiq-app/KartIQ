# KartIQ V5.5.1 — Centrage temps et tours en paysage

## Objectif

Centrer parfaitement les deux informations de la dernière case de la première ligne dans les modes Qualification et Sprint lorsque l’écran est en orientation paysage.

## Modification

Une surcharge CSS finale et strictement ciblée a été ajoutée dans `static/css/40-landscape-overrides.css`.

Elle impose à chaque moitié de la case :

- une occupation complète de sa cellule de grille ;
- un centrage horizontal ;
- un centrage vertical ;
- l’absence de marge ou de padding susceptible de décaler visuellement la valeur.

## Périmètre

Sélecteurs concernés :

- `body.current-qualification .landscape-session-clock` ;
- `body.current-sprint .landscape-session-clock` ;
- leurs enfants `.landscape-clock-value`.

La règle est active uniquement sous `@media (orientation: landscape)` et hors aperçu iPhone intégré.

## Non-régression attendue

Aucun changement n’est apporté :

- au mode portrait ;
- aux vues Focus ;
- au mode Endurance ;
- au HTML ;
- au JavaScript ;
- au backend et aux calculs métier.
