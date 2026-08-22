# Velocity V7.2.1765 — Classement Live synchronisé au GRID Apex

## Correction V7.2.1765

- Le `grid||` HTML complet reçu d'Apex devient la source de vérité pour les concurrents actuellement affichés dans le **classement général live**.
- Les anciennes rows Apex absentes du nouveau GRID sont purgées de l'état live afin d'éviter les karts fantômes et les doublons.
- La correction s'applique aux vues **Analyzer, Qualification, Sprint et Endurance** qui consomment `state.drivers`.
- Aucun historique, tour enregistré, Data Recorder, Velocity Score, classement virtuel, classement secteurs ou Spotter n'est supprimé/modifié.

Cette version sécurise le cycle **REC → ARRÊTER → EXPORTER** du Data Recorder. L’arrêt devient durable dans Render Postgres et un verrou/lease empêche deux instances Render de piloter simultanément le même Recorder pendant un déploiement. Le rattrapage historique Apex de la V7.2.1763 est conservé.

Une réconciliation courte est relancée toutes les 5 minutes et après chaque reconnexion Apex. Le REC ne s’arrête jamais automatiquement sur silence ou coupure Apex : l’arrêt reste manuel depuis Velocity Lab.


Cette version conserve le **Data Recorder autonome Render/Postgres** et finalise l’identité visuelle de Velocity Lab : wordmark **VELOCITY LAB** unifié et Erlenmeyer rouge dans la même direction artistique que les icônes de la Home.

Pour un enregistrement longue durée sur Render, configurez impérativement `DATABASE_URL` vers une base **Render Postgres** et vérifiez le badge de stockage persistant dans Velocity Lab avant de lancer REC.

La Home est à nouveau épurée : la gestion des Sessions Velocity est déplacée dans Analyzer et un bouton **DÉCONNEXION** retire l’accès Velocity de l’ordinateur.

# Velocity V7.2.29 — Cartes Spotter dans Analyzer

Cette version corrige le décodage des courses Apex au nombre de tours à partir de `dyn1|text|Giro X/Y`.

- Synchronisation serveur de la file FIFO entre Spotter et Analyzer.
- Score et confiance affichés dans Spotter depuis le moteur Velocity existant, sans nouvel algorithme.
- Dernière équipe utilisatrice et identifiant KV partagés.
- Analyzer affiche l’ordre, la disponibilité, les attributions et la maintenance en temps réel.

## V7.1.9 — Mode Auto et messagerie pilote

- Le glisser-déposer conserve désormais l’écran **RECALER LA FILE**.
- Le suivi Apex est suspendu durant le recalage.
- **VALIDER LE RECALAGE** reste visible au-dessus de **Karts entrants**.

Le module Spotter peut poursuivre les attributions FIFO en mode estimé pendant une absence, puis imposer un recalage manuel de la file avant le retour au suivi confirmé.

# Velocity V7.0.0 — Spotter Foundation

Cette version ajoute la fondation portrait du module Spotter Quick Change à une file FIFO.

# Velocity V6.13.6

## Diagnostic du décodeur Apex

Le footer de l’Analyzer contient un bouton `🐞 DIAGNOSTIC DÉCODEUR` qui exporte les dernières trames Apex et le détail de la dernière erreur de décodage.


Cette version agrandit le radar de 25 %, ajoute une ligne de chronométrage en damier et améliore la lisibilité du menu des rythmes.


## Météo

Les prévisions sont fournies par **MET Norway Locationforecast 2.0** à partir des coordonnées GPS du circuit. Le service exige un User-Agent identifiable. Pour un déploiement public, vous pouvez définir la variable d’environnement `MET_NO_USER_AGENT` avec un contact valide, par exemple `Velocity/6.10.0 contact@example.com`.

# Velocity V6.9.3

## Prévisions météo horaires locales

La carte météo affiche 6 créneaux horaires issus directement de l’API Open-Meteo, sans interpolation. Avant la demi-heure, le premier créneau est l’heure locale en cours ; à partir de la demi-heure, le premier créneau est l’heure suivante.


### Frise météo locale sur 6 heures (V6.9.2)

La carte météo affiche les 12 prochains créneaux de 30 minutes sur une seule ligne. Chaque créneau utilise l’heure locale du circuit et présente l’état du ciel, la probabilité de pluie et la température.
## Météo dynamique (V6.9.2)

La carte météo de l’Analyzer utilise les coordonnées enregistrées du circuit ou, à défaut, la recherche géographique Open-Meteo. Les données sont actualisées automatiquement toutes les cinq minutes et affichent l’état du ciel, la température, le vent, les précipitations et la prochaine période pluvieuse détectée.

# Velocity V6.3.3 — Analyzer Relais — compteur Apex

Cette version corrige le décodage des tours Apex et conserve la page Analyzer avec deux nouvelles fonctions :

- un bouton **TOURS** sur chaque équipe pour consulter ses chronos depuis le début de la session ;
- un menu **HISTORIQUE APEX** pour afficher les anciennes sessions et consulter les tours d’une équipe dans celles-ci.

La consultation des anciennes sessions fonctionne en lecture seule et ne coupe pas la connexion live de la course.

## Déploiement

Déposez le contenu de ce dossier à la racine du dépôt GitHub puis redéployez le dernier commit sur Render.
