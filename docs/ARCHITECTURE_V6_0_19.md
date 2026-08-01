# KartIQ V6.0.20 — Focus Endurance : stands IN / OUT

Le Focus Endurance réagit au statut Apex de l'entité suivie :

- `pit` / `*in` : écran noir, compteur de stands bleu en haut à droite.
- transition `pit` vers `track` / `*out` : écran noir « Sortie Stands » avec la durée totale pendant 5 secondes.
- retour automatique au Focus Endurance normal.

Le champ Apex `timer` est exposé au front sous `pit_timer`.
Les outils développeur permettent de simuler IN, OUT et de réinitialiser la séquence.
