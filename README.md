## Météo dynamique (V6.9.1)

La carte météo de l’Analyzer utilise les coordonnées enregistrées du circuit ou, à défaut, la recherche géographique Open-Meteo. Les données sont actualisées automatiquement toutes les cinq minutes et affichent l’état du ciel, la température, le vent, les précipitations et la prochaine période pluvieuse détectée.

# KartIQ V6.3.3 — Analyzer Relais — compteur Apex

Cette version corrige le décodage des tours Apex et conserve la page Analyzer avec deux nouvelles fonctions :

- un bouton **TOURS** sur chaque équipe pour consulter ses chronos depuis le début de la session ;
- un menu **HISTORIQUE APEX** pour afficher les anciennes sessions et consulter les tours d’une équipe dans celles-ci.

La consultation des anciennes sessions fonctionne en lecture seule et ne coupe pas la connexion live de la course.

## Déploiement

Déposez le contenu de ce dossier à la racine du dépôt GitHub puis redéployez le dernier commit sur Render.
