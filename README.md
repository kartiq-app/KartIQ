# Velocity V7.2.1786 — Identité Spotter par ligne Apex

## V7.2.1786

Le Spotter identifie désormais une équipe par son `apex_row` stable au lieu du libellé affiché par Apex. Un changement d'affichage entre nom d'équipe et nom du pilote ne peut donc plus créer deux Quick Changes ni réserver deux karts pour la même équipe. Les états locaux hérités sont normalisés au premier flux live : doublons entrants fusionnés et doubles réservations libérées.

## Historique précédent

# Velocity V7.2.1785 — Spotter sortie pits autoritaire

## V7.2.1785

- Une transition Apex `pit -> track` retire toujours l'équipe de **Karts entrants**.
- Si un kart est réservé, le Quick Change est finalisé normalement.
- Si aucun kart n'a été validé, l'équipe quitte simplement les entrants et repasse en piste sans modifier les files.

## V7.2.1784

Cette version empêche une mise à jour Velocity de réinitialiser une course Spotter en cours. Les files et affectations compatibles sont migrées localement vers la nouvelle release. Les transitions live Apex piste → stands restent détectées même si le statut global de session est momentanément ambigu.


## V7.2.1783

Dans Analyzer, la carte **ÉQUIPE SUIVIE** classe désormais le dernier chrono de l'équipe suivie par rapport aux chronos réalisés par le reste de la grille sur le **même numéro de tour**. Une équipe déjà passée au tour suivant reste donc prise en compte grâce à un historique léger côté navigateur. Les équipes qui n'ont pas encore réalisé ce tour ne sont intégrées qu'une fois leur chrono disponible.

## V7.2.1782

Analyzer exploite directement les STATS Apex déjà récupérés côté serveur par Score Relais pour alimenter les meilleurs secteurs du relais, les meilleurs secteurs équipe, le théorique relais et le Classement secteurs. Le relais courant est remis à zéro après un passage aux stands ; les records équipe restent conservés. Aucune requête Apex supplémentaire n'est ajoutée côté navigateur.

# Velocity V7.2.1781 — Cache STATS partagé pour les secteurs

## Correction V7.2.1781

Le cache STATS déjà chargé par SCORE RELAIS alimente désormais directement les records secteurs d’Analyzer (`MEILLEUR DU RELAIS`, `MEILLEUR ÉQUIPE`, `THÉORIQUE RELAIS`, `CLASSEMENT SECTEURS`) sans lancer un second pipeline de requêtes Apex. Le tour en cours reste alimenté par les cellules chrono S1/S2/S3 live.

## Correction V7.2.1780

- Analyzer lit les chronos S1/S2/S3 depuis les cellules Apex `data-type=s1/s2/s3`.
- Le mapping de colonnes reste dynamique à chaque GRID.
- Les événements `* / *i1 / *i2` restent réservés au tracking TRAFIC / Heat Map et ne servent plus de chronos.
- TOUR EN COURS, MEILLEUR DU RELAIS, MEILLEUR ÉQUIPE et CLASSEMENT SECTEURS partagent la même source timing live.
- Le state backend `sector_1/2/3` sert de secours après reconnexion.

Analyzer reconstruit désormais à chaque `grid||` le mapping réel des colonnes Apex à partir des attributs `data-type` (`s1`, `s2`, `s3`, `llp`, `blp`, etc.). Les numéros `c7`, `c8`, `c9`… ne sont plus supposés fixes entre deux sessions.

Les mises à jour incrémentales `rXXXXXcY|...|...` des cellules S1/S2/S3 alimentent directement le même cache LIVE que les impulsions `*`, `*i1`, `*i2`. Le TOUR EN COURS et le CLASSEMENT SECTEURS restent donc mis à jour au passage de chaque secteur, sans attendre la fin du tour.

# Velocity V7.2.1778 — Cache secteurs LIVE autonome

## Correction V7.2.1778

Le **Classement secteurs** utilise directement les impulsions Apex `*`, `*i1`, `*i2`, exactement comme la ligne **TOUR EN COURS** de la carte ÉQUIPE SUIVIE. S1, S2 et S3 apparaissent et peuvent modifier le classement immédiatement au passage de chaque secteur, sans attendre la fin du tour et sans relancer l’ancien pipeline STATS.

# Velocity V7.2.1768 — Delta Focus Sprint aligné sur Focus Endurance

## Correction V7.2.1768

Le **delta du Focus Sprint** reprend désormais exactement les mêmes tailles que le **Focus Endurance**, y compris sur smartphone et sur iPhone en paysage virtuel. Aucun autre élément du layout Sprint, Qualification ou Endurance n'est modifié.

## Version précédente V7.2.1767 — Correction header Focus Sprint & Qualification

## Correction V7.2.1767

Sur iPhone en paysage virtuel, les barres de titre **Sprint** et **Qualifications** restent désormais en haut de l'écran, comme le Focus Endurance. La règle qui étirait par erreur ces headers sur toute la hauteur a été supprimée.


## Évolution V7.2.1766

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