# Modules JavaScript — KartIQ V5.2.1

La V5.2.1 organise les scripts par domaine fonctionnel, sans réécriture de la logique.

## Ordre de chargement

1. `static/js/core/core.js` — état global, configuration et fonctions communes.
2. `static/js/sprint/sprint.js` — affichage et logique Sprint.
3. `static/js/qualification/qualification.js` — affichage et logique Qualification.
4. `static/js/ui/race-ui.js` — accueil, sélection du circuit, navigation et interface de course.
5. `static/js/endurance/queues.js` — gestion locale des files de karts.
6. `static/js/core/bootstrap.js` — initialisation finale et PWA.

Cet ordre doit être conservé tant que les modules partagent encore des fonctions globales.
