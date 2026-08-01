# KartIQ V6.0.26 — Deltas classement Apex

Cette version corrige les deltas Sprint et Endurance après la refactorisation.

## Source des deltas

Les écarts directs sont calculés exclusivement à partir de la colonne **Écart** fournie par Apex Timing :

- écart avec le pilote devant = écart cumulé du pilote suivi moins écart cumulé du pilote devant ;
- écart avec le pilote derrière = écart cumulé du pilote derrière moins écart cumulé du pilote suivi ;
- pour le leader, l'avance sur P2 correspond à l'écart cumulé de P2.

La colonne `interval` n'est utilisée qu'en secours lorsqu'un écart cumulé n'est pas exploitable.

## Écrans concernés

- Sprint
- Focus Sprint
- Endurance
- Focus Endurance

Les modes Qualifications et Focus Qualifications sont inchangés.
