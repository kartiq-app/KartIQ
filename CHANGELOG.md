# V7.2.1773 — SCORE RELAIS serveur pour longues endurances

- Base : V7.2.1772.
- Aucun changement de la formule Velocity / Score Relais.
- Nouvelle architecture pour les 12H / 24H :
  - le navigateur ne récupère plus et ne calcule plus 40 000 à 70 000 tours ;
  - le backend Python récupère les STATS Apex ;
  - le backend découpe les tours avec les PITS ;
  - le backend applique la logique Score Relais ;
  - Chrome reçoit uniquement une matrice compacte R1 / R2 / R3...
- Reconstruction lancée comme job serveur en arrière-plan avec progression pollée par Analyzer.
- Jusqu'à 4 équipes Apex récupérées en parallèle côté serveur.
- 1500 tours par équipe par défaut ; passage à 3000 uniquement si Apex prouve que l'historique est tronqué.
- Qualification historique non recherchée automatiquement : R1 fonctionne sans qualification et cette donnée facultative ne peut plus bloquer une 24H.
- Changement de circuit/session :
  - annulation immédiate du job côté navigateur ;
  - demande d'annulation envoyée au serveur ;
  - une réponse d'un ancien circuit ne peut pas contaminer le circuit courant.
- Le relais courant reste calculé en Live dans le navigateur, tour après tour.
- Aucun fallback vers le calcul massif navigateur si le serveur échoue : priorité à la stabilité de la page.
- Velocity Lab / Data Recorder inchangés.

# V7.2.1772 — SCORE RELAIS : fenêtre STATS 1500 par défaut

- Base : V7.2.1771.
- Aucun changement de l'algorithme Velocity / Score Relais.
- Suppression de l'heuristique qui choisissait 3000 tours à partir du nombre d'arrêts.
- Une endurance sans nombre de tours Live connu démarre désormais directement avec une fenêtre de 1500 tours.
- La fenêtre 3000 n'est utilisée que si une réponse 1500 valide prouve réellement que l'historique est tronqué (`oldestLap > 1`).
- Une requête STATS qui timeout/échoue n'est plus répétée une seconde fois avec la même grosse fenêtre.
- Timeout standard du moteur SCORE RELAIS réduit à 8 secondes par équipe.
- Les logs indiquent maintenant `oldestLap`, `newestLap`, fenêtre, taille de réponse et durée.
- La qualification reste optionnelle/non bloquante comme en V7.2.1771.
- L'annulation au changement de circuit/session reste inchangée.
- Le calcul Live du relais courant et la formule Velocity restent inchangés.

# V7.2.1771 — Qualification non bloquante pour SCORE RELAIS

- Base : V7.2.1770 Clean Engine.
- Aucun changement de l'algorithme Velocity / Score Relais.
- La qualification devient strictement optionnelle et ne peut plus bloquer une reconstruction d'endurance.
- Timeout navigateur ajouté aux requêtes Apex History / Sessions.
- Recherche de qualification : timeout 2,5 s.
- Test unique du snapshot de la qualification avant toute requête équipe.
- Si la session est listée mais son snapshot est vide, inaccessible ou expiré :
  - abandon immédiat de la qualification ;
  - aucune requête qualification par équipe ;
  - calcul des Scores Relais directement avec `qualification = null`.
- Si le snapshot existe mais les détails d'une première équipe sont inaccessibles :
  - arrêt immédiat de la phase qualification pour éviter des dizaines de timeouts identiques.
- Budget global qualification : 8 s maximum ; au-delà, Velocity calcule sans qualification.
- Changement circuit/session continue d'annuler immédiatement le job en cours.
- Le Live et l'algo Velocity restent inchangés.

# V7.2.1770 — SCORE RELAIS : moteur STATS propre

- Base : V7.2.1769.
- Algorithme Velocity / notation des karts et relais STRICTEMENT inchangé.
- Suppression de la plomberie accumulée autour de SCORE RELAIS :
  - plus de double lancement caché dans `renderAnalyzer`;
  - plus de second pipeline STATS pour hydrater le relais ;
  - plus de cascade systématique 30 → 100 → 300 → 750 → 1500 → 3000.
- Nouvelle collecte simple par équipe :
  1. `row Apex`;
  2. UNE requête combinée STATS `.L + .P + .INF`;
  3. parsing des tours et des passages aux stands depuis la même réponse;
  4. découpage R1 / R2 / R3... avec la logique existante;
  5. passage dans `analyzerRelayScoreCompute()` inchangé.
- Fenêtre choisie directement selon la profondeur de la course :
  - petite course : 750 tours;
  - endurance normale : 1500;
  - longue endurance / beaucoup de PITS : 3000.
- Une seule montée de fenêtre possible uniquement si Apex prouve que l'historique retourné est tronqué.
- Reconstruction séquentielle équipe par équipe pour préserver le Live.
- Isolation stricte par circuit/session :
  - changement de circuit/session = annulation immédiate du job précédent;
  - vidage du cache et des résultats SCORE RELAIS de l'ancien circuit;
  - toute réponse STATS tardive de l'ancien circuit est rejetée.
- Correction du bug observé : Kartland ne peut plus continuer la reconstruction `3/44 · BSE RACING` d'Alain Prost A.
- La qualification R1 utilise elle aussi la nouvelle requête combinée propre.
- Le Score du relais en cours reste calculé en Live tour après tour.
- Velocity Lab / Data Recorder non modifiés.

# V7.2.1769 — Score Relais : retour au Live progressif + historique STATS en arrière-plan

- Base STRICTE : V7.2.1768. Velocity Lab / Data Recorder / design Lab conservés.
- Audit V7.2.162 vs V7.2.1768 :
  - `analyzerLearnFromState()` est strictement identique ;
  - `analyzerRelayMetrics()` est strictement identique.
  Le moteur historique sait donc toujours calculer le Score du relais courant tour après tour.
- La surcouche STATS a été introduite en V7.2.107 pour unifier SCORE RELAIS, classement VELOCITY et Velocity Lab.
- V7.2.1769 sépare clairement les responsabilités :
  - RELAIS ACTUEL : Score Live progressif, mis à jour à chaque tour ;
  - RELAIS TERMINÉS / historique : reconstruction canonique depuis STATS Apex.
- Une seule chaîne STATS en arrière-plan ; suppression du second pipeline d'hydratation automatique concurrent.
- Reconstruction automatique de l'historique dès la connexion, sans interrompre le WebSocket Live.
- Après un nouvel arrêt, consolidation STATS du nouvel historique ; les équipes inchangées utilisent le cache.
- Fenêtre STATS choisie directement selon les tours / arrêts connus (ex. 1379 tours → 1500 ; 31 PITS → 100).
- Retries conservés sur les réponses PITS Apex temporairement vides.
- Optimisation des références temporelles du Score Relais par index de tours : même formule, mêmes cohortes, beaucoup moins de rescans.
- Yield navigateur entre les équipes pour laisser le Live, le classement et l'UI respirer.
- Aucun changement de formule du Score Relais.
- Aucun fichier spécifique Velocity Lab / Data Recorder modifié.

# V7.2.1768 — Focus Sprint : delta identique au Focus Endurance

- Le delta avant/arrière du **Focus Sprint** utilise désormais exactement les mêmes dimensions que le **Focus Endurance**.
- Même comportement responsive sur smartphone.
- Même taille dédiée sur iPhone en paysage virtuel.
- Aucun changement sur les calculs de delta, les couleurs, les chronos, les pénalités ou les autres modes Focus.

# V7.2.1767 — Focus Sprint / Qualification : header en haut

- Correction ciblée du paysage virtuel iPhone : les headers **Sprint** et **Qualifications** ne sont plus étirés sur toute la surface du Focus.
- Le titre, le filet coloré et le bouton de fermeture restent désormais dans une barre fixe en haut, avec le même positionnement que **Focus Endurance**.
- Aucun changement métier sur Sprint, Qualification, Endurance, pénalités, chronos ou Analyzer.

# V7.2.1766 — Focus Sprint & Focus Qualification

- Focus Sprint aligné sur la structure du Focus Endurance.
- Bas gauche Sprint : temps restant de la session (ou progression en tours).
- En-tête Sprint avec filet bleu.
- Nouvelle pénalité du pilote/équipe suivi : plein écran noir 4 secondes, nom puis pénalité, depuis la même source PÉNALITÉS ET INFORMATIONS qu’Analyzer.
- Focus Qualification : titre Qualifications + filet rouge.
- Bloc temps restant réduit de 50 % en largeur (25 %), bloc meilleur temps porté à 75 %.
- Correction du nom du détenteur du meilleur temps : calcul direct depuis le GRID live au lieu de dépendre de l’identifiant DOM Apex.
- Chrono du meilleur temps fortement agrandi pour exploiter toute la case.

# V7.2.1765 — Classement Live : purge des rows Apex obsolètes

- Un nouveau `grid||` Apex complet devient la liste autoritaire des concurrents actuellement présents dans le classement général live.
- Purge ciblée des rows absentes du nouveau GRID dans `ApexTable`, `ApexInterpreter` et `ProtocolEngine`.
- Analyzer, Qualification, Sprint et Endurance ne conservent plus les anciens karts sortis de la grille et ne dupliquent plus un kart réapparu avec une nouvelle row Apex.
- Un GRID vide peut désormais vider le classement live précédent.
- Historique, Recorder/Postgres, Velocity Score, classement virtuel, classement secteurs et Spotter restent inchangés.

# V7.2.1764 — Data Recorder : STOP durable et verrou Render

- Correction du Recorder qui pouvait repasser en **REC** après un arrêt/export : l’ordre utilisateur est désormais stocké dans Postgres via `desired_status` et devient la source de vérité.
- Ajout d’un **lease Postgres** avec propriétaire et heartbeat : pendant un déploiement Render avec chevauchement d’instances, une seule instance peut posséder le WebSocket d’un Recorder.
- Ajout d’un superviseur de reprise : si la nouvelle instance Render démarre avant l’expiration du lease de l’ancienne, elle retente automatiquement l’adoption toutes les 3 secondes au lieu d’abandonner le Recorder.
- `ARRÊTER` écrit d’abord l’état **stopped** dans Postgres puis ferme le worker local ; tout worker concurrent perd automatiquement son lease et se coupe.
- Un Recorder stoppé n’est plus repris par `resume_active()` après redémarrage ou redéploiement, même si un ancien worker tente encore d’écrire un statut runtime actif.
- L’interface se base sur l’état durable : une course terminée reste dans **COURSES ENREGISTRÉES** avec **EXPORT COMPLET ZIP** et **SUPPRIMER**.
- Les compteurs sont réalignés sur les lignes réellement présentes en base lors du STOP et avant chaque export, notamment pour éviter l’écart entre tours tentés et tours uniques Postgres.
- Migration Postgres/SQLite automatique : aucune manipulation de base n’est requise au déploiement.
- Aucun changement sur le backfill historique Apex, Velocity Score, secteurs, pits ou les trois modes de Velocity Lab.

# V7.2.1763 — Data Recorder : rattrapage historique Apex

- Au démarrage d’un REC, le Recorder ouvre immédiatement le WebSocket live puis lance en parallèle une **synchronisation historique Apex** pour chaque équipe déjà présente sur la grille.
- Récupération rétroactive des **tours depuis le début de la session active**, avec S1/S2/S3 et arrêts stands disponibles via l’historique Apex, même si le REC est lancé plusieurs heures après le départ.
- Fenêtres historiques adaptatives jusqu’à 3000 tours par équipe afin de retrouver le tour 1 sans charger inutilement Apex sur les sessions courtes.
- Déduplication : un tour/pit/secteur déjà capté en live n’est pas compté deux fois lorsque le backfill le retrouve.
- Réconciliation automatique toutes les 5 minutes et immédiatement après une reconnexion WebSocket afin de réparer les éventuels trous de collecte.
- Le calcul Velocity Score est suspendu pendant la synchronisation initiale puis recalculé sur l’ensemble des tours récupérés avant de reprendre les snapshots live habituels.
- Le Data Recorder affiche désormais l’état **HISTORIQUE APEX** et le nombre d’anciens tours/événements stands récupérés.
- Le Recorder reste volontairement **manuel à l’arrêt** : une absence de données Apex ne termine jamais automatiquement un REC.
- Les trames WebSocket brutes antérieures au démarrage du REC ne peuvent pas être reconstituées ; seuls les historiques structurés qu’Apex expose encore sont rattrapés.

# V7.2.1762 — Identité Velocity Lab : Erlenmeyer

- Remplacement de l’éprouvette du header Velocity Lab par un **Erlenmeyer rouge** en SVG, dessiné dans la même direction artistique que les icônes rouges de la Home.
- Suppression du filet vertical entre **VELOCITY** et **LAB**.
- **LAB** utilise désormais le même wordmark, la même taille et le même poids visuel que **VELOCITY**.
- L’Erlenmeyer est dimensionné à la hauteur du wordmark et reste aligné sur la même ligne.
- Les trois modes **Comparaison**, **Score Sprint — Expérimental** et **Data Recorder** restent inchangés et opérationnels.
- Aucun changement sur les algorithmes, le Data Recorder ou Render Postgres.

# V7.2.1761 — Refonte visuelle Velocity Lab

- Refonte du shell CSS de **Velocity Lab** sur une base dédiée et isolée du header global de Velocity.
- Le header du Lab n’utilise plus la balise globale `header` : suppression définitive du conflit avec la hauteur fixe de l’application.
- Nouvelle identité **Velocity Lab** reprenant le logo Velocity de la Home avec une éprouvette rouge stylisée.
- Navigation des trois modes conservée : **Comparaison**, **Score Sprint — Expérimental** et **Data Recorder**.
- Mise en page desktop/mobile reconstruite : titre, sous-titre et onglets sont désormais dans un flux vertical sans chevauchement.
- Aucun changement sur les algorithmes Velocity, Score Sprint, Data Recorder ou le stockage Render Postgres.

# V7.2.1760 — Correction CSS Velocity Lab

- Correction du chevauchement entre le sous-titre de **Velocity Lab** et les onglets `COMPARAISON / SCORE SPRINT / DATA RECORDER`.
- Le problème venait du sélecteur global `header` qui imposait une hauteur fixe de `72px` au header interne de Velocity Lab.
- Le header du Lab utilise désormais une hauteur automatique, un line-height explicite et une structure verticale stable.
- Renforcement de l’affichage du header Velocity Lab sur smartphone malgré la règle Analyzer qui masque le header principal.
- Aucun changement du Data Recorder, de Postgres, d’Analyzer ou des algorithmes Velocity.

# V7.2.1759 — Velocity Lab Data Recorder autonome

- Home épurée : retrait du bloc de gestion **Session Velocity** et ajout d’un bouton discret **DÉCONNEXION** qui ferme la session mail Velocity sur l’ordinateur.
- Gestion des **Sessions Velocity** déplacée dans Analyzer avec un bouton dédié ; ajout de **SUPPRIMER** pour le propriétaire et **QUITTER** pour un membre.
- Ajout de l’onglet **DATA RECORDER** dans Velocity Lab, indépendant de l’Analyzer et de la Session Velocity affichée.
- Le Recorder ouvre son propre WebSocket Apex côté serveur Render : plusieurs courses peuvent être enregistrées simultanément et la collecte continue navigateur fermé.
- Reconnexion Apex automatique et reprise des Recorders actifs après redémarrage du service ; l’historique tours/pits est rechargé pour conserver le contexte des snapshots Velocity Score.
- Stockage persistant via **Render Postgres** lorsque `DATABASE_URL` est défini ; fallback SQLite local clairement signalé comme non persistant sur Render.
- Collecte des trames Apex brutes, tours, secteurs, pits/relais, événements, snapshots de classement et snapshots Velocity Score.
- Export complet ZIP depuis Velocity Lab : `01_TOURS.csv`, `02_SECTEURS.csv`, `03_VELOCITY_SCORES.csv`, `04_PITS_RELAIS.csv`, `05_CLASSEMENT_SNAPSHOTS.jsonl`, `06_EQUIPES_KARTS.csv`, `07_EVENEMENTS_APEX.csv`, `08_RAW_APEX.jsonl` et `course.json`.
- `render.yaml` aligné sur l’instance **Starter** utilisée pour Velocity et ajout du pilote Postgres `psycopg`.

# V7.2.1758 — Sessions Velocity multi-utilisateurs

- Ajout d'une vraie **Session Velocity** indépendante de l'adresse mail : le mail autorise l'accès, la session isole le travail de course.
- Un compte autorisé reçoit automatiquement une première session personnelle afin de préserver un démarrage immédiat après connexion.
- Depuis la Home, ajout d'un gestionnaire permettant de **créer**, **ouvrir** ou **rejoindre** une session grâce à un code `VK-XXXXXX`.
- Deux mails connectés peuvent désormais travailler sur **deux circuits / deux courses différents** sans mélanger circuit, live Apex, équipe suivie, Analyzer, Spotter, stratégie, messages ou secteurs.
- Deux mails peuvent au contraire rejoindre le **même code de session** et partager le même état Velocity.
- Isolation serveur par session de `STATE`, `RaceStateService`, `ApexTable`, `ProtocolEngine` et `ApexEventStore`.
- Déduplication courte des trames Apex identiques lorsqu'au moins deux appareils sont connectés à la même session, afin de ne pas comptabiliser deux fois le même événement.
- Les Sessions Course / rôles Team Management sont désormais rattachés à la Session Velocity courante : plusieurs Sessions Course peuvent exister simultanément dans des espaces Velocity différents.
- Un appareil Pilote / Spotter associé à une Session Course rejoint automatiquement la même Session Velocity que son Team Manager.
- Changement de circuit verrouillé uniquement par la Session Course du même espace Velocity ; une autre session peut utiliser un autre circuit simultanément.
- Aucun changement de calcul dans Analyzer, Velocity Score, secteurs ou Spotter.

# V7.2.1757 — Synchronisation Spotter ↔ Analyzer

- Correction du canal de synchronisation entre le **mode Spotter** et la carte **Spotter dans Analyzer** sur plusieurs appareils / onglets.
- Suppression du numéro Spotter obsolète `7.2.1749` codé en dur dans `spotter.js`.
- Spotter utilise désormais automatiquement la **même release que Velocity**, injectée par le template (`window.VELOCITY_APP_VERSION`).
- Secours automatique : si la variable globale n'est pas disponible, Spotter récupère la release depuis le paramètre `?v=` de son propre script.
- Les POST `/api/spotter-state` portent donc la release attendue par le backend et ne sont plus rejetés en `409 Version Spotter obsolète`.
- Les snapshots distants de même version sont de nouveau acceptés puis publiés via `velocitySharedSpotterState` / `velocity:spotter-state`, ce qui rafraîchit Analyzer en temps réel.
- Aucun changement sur la logique FIFO, les files, les karts entrants, la maintenance, Auto ou les scores Velocity.

# V7.2.1756 — Analyzer : classement secteurs

- Ajout de **CLASSEMENT SECTEURS** à côté de CLASSEMENT LIVE et CLASSEMENT VIRTUEL.
- Une ligne par équipe, basée uniquement sur le **relais en cours** : kart actuel, numéro de relais, meilleurs S1/S2/S3 et théorique relais.
- Sous chaque meilleur secteur du relais, affichage en plus petit du **meilleur secteur de l’équipe depuis le début de la course**.
- Tri par **S1**, **S2**, **S3** ou **Théorique relais** ; le classement va du plus rapide au moins rapide.
- La colonne Δ suit le critère de tri sélectionné et affiche l’écart avec la meilleure valeur du plateau.
- Gestion dynamique Apex : **aucun secteur**, **2 secteurs** ou **3 secteurs**. S3 et son tri disparaissent automatiquement lorsqu’une session est confirmée à 2 secteurs.
- Aucun nouvel archivage des anciens relais n’est ajouté pour cette vue ; elle réutilise les données déjà apprises par Analyzer.
- Les équipes sans valeur sur le critère choisi restent visibles en bas du tableau avec un rang « — ».

# V7.2.1755 — Analyzer : nombre de secteurs Apex dynamique

- Détection du nombre de secteurs sur les tours TERMINÉS, et non depuis le header S1/S2/S3 de la grille Apex.
- Validation par cohérence : la somme des secteurs disponibles doit reconstituer le temps au tour (tolérance protocolaire serrée).
- Piste à 2 secteurs : `THÉORIQUE RELAIS = meilleur S1 + meilleur S2`, même si les deux meilleurs secteurs viennent de tours différents.
- Piste à 3 secteurs : logique inchangée, `S1 + S2 + S3`.
- Un seul secteur exploitable : pas de temps théorique affiché.
- La colonne S3 est automatiquement masquée lorsqu'un tour terminé confirme une configuration à 2 secteurs.
- Avant cette confirmation, les trois colonnes restent visibles afin de ne pas confondre un S3 encore à venir avec une piste à 2 secteurs.
- `TOUR EN COURS` reste alimenté en direct par les impulsions Apex `*`, `*i1`, `*i2`.

# V7.2.1754 — Analyzer : TOUR EN COURS sur les impulsions secteurs Apex
- Correction de la source de **TOUR EN COURS** : Analyzer lit désormais directement les impulsions de tracking déjà décodées dans `window.velocityApexMap`, conformément au JavaScript Apex Timing.
- Protocole live utilisé : `*` → **S1** via le 4e champ `t[3]`, `*i1` → **S2** via `t[2]`, `*i2` → **S3** via `t[2]`.
- À chaque nouvelle impulsion `*`, Velocity réinitialise le tour secteur courant : S1 est affiché immédiatement, S2/S3 repassent à `—`, puis se remplissent au fur et à mesure de `*i1` et `*i2`.
- Les secteurs utilisés pour l'animation **TRAFIC / Heat Map** restent conservés séparément afin de ne pas dégrader l'interpolation déjà en place.
- Entrée/sortie des stands (`*in` / `*out`) : remise à zéro des secteurs du **TOUR EN COURS**.
- Couleur du **TOUR EN COURS** : violet si meilleur absolu de grille connu, vert si nouveau meilleur du relais, orange sinon.
- Les calculs historiques **MEILLEUR DU RELAIS**, **MEILLEUR ÉQUIPE**, **MEILLEUR EN COURS** et **THÉORIQUE RELAIS** restent alimentés par l'historique Apex `.L`.
- Aucun changement dans **Focus Endurance**.

# V7.2.1753 — Analyzer : secteurs Apex en direct
- Carte **ÉQUIPE SUIVIE** : ajout du bloc **SECTEURS** entre « Position du chrono » et **TRAFIC**, sans modifier le gabarit desktop de la carte.
- **TOUR EN COURS** : S1 / S2 / S3 sont remis à zéro à chaque nouveau tour puis affichés au fur et à mesure des cellules live Apex `s1`, `s2`, `s3`.
- **MEILLEUR DU RELAIS** : meilleurs secteurs du relais actif, même s’ils proviennent de tours différents.
- **MEILLEUR ÉQUIPE** : meilleurs secteurs de l’équipe depuis le début de la course.
- **MEILLEUR EN COURS** : meilleur tour complet du relais actif.
- **THÉORIQUE RELAIS** : somme des meilleurs S1 + S2 + S3 du relais actif.
- **MEILLEUR ÉQUIPE** (chrono) : meilleur tour complet de l’équipe.
- Les historiques `.L` Apex déjà utilisés par Analyzer alimentent les meilleurs secteurs ; le module reste masqué si aucune donnée secteur n’est disponible.
- Couleurs secteurs : violet = meilleur absolu de la grille connu par Velocity, vert = meilleur équipe/relais, orange = secteur live normal.
- **Focus Endurance inchangé** : cette première intégration concerne uniquement Analyzer.

# V7.2.1752 — Focus Endurance : violet = meilleur absolu de la grille

- Restauration de la règle automobile du violet en Focus Endurance.
- Violet : dernier tour égal au meilleur temps absolu de toute la grille.
- Vert / orange inchangés : comparaison avec le meilleur du pilote sur le relais courant.
- Réinitialisation vert / orange toujours effectuée à chaque sortie des stands.

# V7.2.1751 — Focus Endurance : couleur du dernier tour par pilote/relais

- À chaque sortie des stands, le traitement vert/orange du dernier tour est réinitialisé pour le nouveau relais.
- Vert : le pilote actuellement en relais vient d'améliorer son meilleur chrono de ce relais.
- Orange : le pilote actuellement en relais n'améliore pas son meilleur chrono de ce relais.
- Le premier nouveau tour chronométré du relais devient la référence et s'affiche en vert, sauf s'il est violet.
- Violet : le pilote bat ou égale le meilleur temps historique de son équipe depuis le début de la course.
- Le violet n'est plus comparé au meilleur temps absolu de toute la grille en Focus Endurance.
- Aucun changement sur les couleurs Sprint / Qualification.

# V7.2.1750 — Focus Endurance : messages automatiques stands

- Sortie des stands : durée affichée au format `MM:SS.mmm` (ex. `02:34.295`).
- Entrée aux stands : chrono en bas à droite au même format `MM:SS.mmm`.
- Entrée aux stands : taille du chrono augmentée de 50 %, y compris sur l’affichage iPhone Focus.
- Messages automatiques de pénalité désactivés uniquement en Focus Endurance.
- Les pénalités restent disponibles dans les autres vues de Velocity.

# V7.2.1749 — Synchronisation Spotter Desktop / Smartphone / Analyzer

- Corrige l'absence de réplication du Quick Change préparé sur Desktop vers le Spotter smartphone.
- Cause : à l'ouverture du Spotter smartphone, l'écran local `mode` était considéré comme interactif et bloquait précisément le snapshot serveur que `spotterEnterMode()` venait chercher.
- `spotterEnterMode()` force désormais une lecture serveur prioritaire à l'ouverture.
- Les protections anti-écrasement restent actives pendant une vraie édition utilisateur ; seule l'entrée dans le mode force la synchronisation.
- Après un push structurel réussi, l'état partagé local est republié avec le timestamp serveur.
- Analyzer privilégie maintenant l'état Spotter partagé ; le backend reste responsable du reset lors d'un changement de circuit.
- Aucun changement FIFO / Quick Change / Zone Méca / registre KV.

# V7.2.1748 — Correctif réinsertion ZONE MECA

- Corrige le kart remis dans une file qui revenait ensuite en ZONE MECA.
- Cause identifiée : une synchronisation structurelle ancienne pouvait réappliquer l'état précédent après la réinsertion.
- Une réinsertion Méca est maintenant poussée immédiatement au serveur.
- Les anciens snapshots différés sont invalidés lors de la réinsertion.
- Protection de 10 secondes : un snapshot distant obsolète ne peut ni remettre le kart en Méca ni le retirer de la file juste après sa réinsertion.
- Les rafraîchissements Score / Confiance toutes les 2 secondes ne republient plus l'intégralité des files / Méca / entrants : ils restent locaux, ce qui évite les écrasements entre smartphone et desktop.
- Aucun changement au FIFO, Quick Change, Ajouter un kart, registre KV ou Analyzer métier.

# V7.2.1747 — Spotter stable rebuild + corrections synchronisation

- Repart de la V7.2.1742 fournie et fonctionnelle.
- Correction du conflit de synchronisation qui faisait disparaître les menus Spotter.
- Les écrans Mode Quick Change / préparation des files / Ajouter un kart ne sont plus remplacés par le polling distant.
- Protection contre les snapshots distants plus anciens qu'une mutation locale.
- Les entrants DEV sont préservés contre un snapshot distant obsolète.
- Zone Méca smartphone : zone tactile agrandie virtuellement sans augmenter la hauteur physique de la page.
- Numéro affiché au-dessus du nom d'équipe.
- Score / Confiance / identifiant KV sur la même zone ; affichage `KV03` sans préfixe supplémentaire `KV :`.
- MAINTENANCE renommée ZONE MECA.
- MODIFIER LA FILE remplacé par AJOUTER UN KART.
- Ajouter un kart reprend la logique par files du Quick Change, accepte plusieurs karts et les ajoute en dernière position.
- Anti-doublon des karts physiques.
- SUIVI KARTS opt-in avec registre KV → équipe → Score Velocity.
- Registre séparé du polling 750 ms.
- Undo restaure aussi nextKvNumber et le registre.
- Registre borné à 250 KV / 80 passages.

# V7.2.1742 — Correctif icône iPhone / PWA

- Base stricte V7.2.1741 minimal.
- Cause identifiée : la page Google/login ne déclarait aucune apple-touch-icon.
- Les icônes et le manifest PWA étaient aussi protégés par le garde OAuth, ce qui pouvait empêcher iOS de les récupérer.
- `/static/icons/*` et `/static/manifest.json` deviennent publics ; aucun JS/CSS/API Velocity n'est exposé.
- Ajout de l'icône Velocity et du manifest sur la page de connexion.
- Cache-busting `?v=7.2.1742` sur manifest et apple-touch-icon.
- Cache Service Worker porté de `velocity-v7-2-172` à `velocity-v7-2-1742` afin d'évacuer l'ancien cache d'icône.
- Aucun changement Analyzer / Spotter / Focus / OAuth / accès membres / algorithmes.
- Version numérique : 7.2.1742.

# V7.2.1741 — Accès membres sans Google + login Velocity rouge

- Base stricte V7.2.1739.
- L'accès principal / Team Manager reste protégé par Google OAuth + VELOCITY_ALLOWED_EMAILS.
- Les liens et QR Codes `Associer l'appareil` peuvent désormais fonctionner sans compte Google.
- Un token d'invitation valide crée une autorisation temporaire limitée au processus d'association.
- Après association, le cookie/header d'appareil Velocity devient l'autorisation du membre.
- Un appareil membre reconnu peut ouvrir Velocity sans authentification Google.
- Les rôles existants continuent à diriger automatiquement :
  - PILOTE → Focus Endurance ;
  - SPOTTER → Spotter ;
  - TEAM MANAGER associé → Analyzer.
- Un visiteur anonyme sans Google, sans token valide et sans appareil associé reste bloqué.
- `/api/*` et `/static/*` restent refusés aux visiteurs anonymes.
- Protection supplémentaire : une session d'invitation ne peut utiliser qu'un token correspondant.
- Page de connexion : filet et V passent de l'orange au rouge Velocity.
- Aucun changement Analyzer / Spotter / Focus / Mode Performance / algorithmes.
- Version numérique : 7.2.1741.

# V7.2.1741 — PRIVATE ACCESS / Google Authentication

- Base stricte V7.2.1738.
- Nouvelle page de connexion autonome et minimale.
- Authentification Google OAuth 2.0 / OpenID Connect côté serveur.
- Whitelist lue depuis VELOCITY_ALLOWED_EMAILS sur Render.
- Un visiteur non authentifié ne reçoit pas l'application Velocity.
- /api/* et /static/* sont refusés (403) avant authentification.
- Les fichiers JS/CSS Velocity ne sont chargés qu'après autorisation.
- Cookie de session HttpOnly, SameSite=Lax et Secure sur Render.
- Déconnexion via /logout.
- Aucun changement Analyzer / Spotter / Focus / Mode Performance / algorithmes.
- Variables Render requises :
  VELOCITY_ALLOWED_EMAILS
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  VELOCITY_SESSION_SECRET
- VELOCITY_PUBLIC_URL est facultative (Render fournit RENDER_EXTERNAL_URL).
- Version numérique : 7.2.1741.

# V7.2.1741 — Suppression membre simplifiée + équipe orange

- Base stricte V7.2.1737.
- Suppression d'un membre : box dédiée sans champ de confirmation du nom de l'équipe.
- La box contient uniquement ANNULER et SUPPRIMER.
- La ligne contenant le nom de l'équipe sélectionnée reçoit un fond orange.
- Les trois boutons membre restent sur une seule ligne.
- Aucun autre changement fonctionnel.
- Version numérique : 7.2.1741.

# V7.2.1741 — Boutons membres sur une seule ligne

- Base stricte V7.2.1736.
- Correction CSS ciblée uniquement.
- ASSOCIER L'APPAREIL | ÉDITER | SUPPRIMER restent désormais strictement côte à côte sur une seule ligne.
- Suppression du comportement responsive V1736 qui autorisait le retour à la ligne sous 760 px.
- Sur smartphone, réduction légère des espacements/paddings pour conserver les trois boutons sur la même ligne.
- Aucun changement fonctionnel.
- Aucun changement Session Course / association appareil / rôles / Analyzer / Focus / Spotter / Performance.
- Version numérique : 7.2.1741.

# V7.2.1741 — Sélection équipe : édition, suppression, association appareils

- Base stricte V7.2.1735.
- Dans CRÉER UNE SESSION > SÉLECTIONNER UNE ÉQUIPE :
  - ÉDITER et SUPPRIMER ajoutés à droite du nom de l'équipe.
  - renommage équipe avec ANNULER / OK orange.
- Pour chaque membre :
  - ASSOCIER L'APPAREIL
  - ÉDITER
  - SUPPRIMER
  sur la même ligne lorsque la largeur le permet.
- ASSOCIER L'APPAREIL réutilise le flux existant d'invitation :
  - PARTAGER
  - COPIER LE LIEN
  - QR CODE
- Taille du texte des rôles : +50 %.
- Statut appareil associé / non associé conservé.
- + AJOUTER UN MEMBRE conservé sous la liste.
- Ajout d'une route PATCH équipe pour renommer proprement la Team et synchroniser appareils/invitations/session active.
- Aucun changement Mode Performance / Analyzer / Focus / Spotter.
- Version numérique : 7.2.1741.

# V7.2.1741 — Gestion membres équipe existante

- Base stricte V7.2.1734.
- Dans CRÉER UNE SESSION > SÉLECTIONNER UNE ÉQUIPE :
  - chaque membre conserve le bouton ÉDITER ;
  - ajout d'un bouton SUPPRIMER à côté de ÉDITER ;
  - ajout d'un bouton + AJOUTER UN MEMBRE sous le dernier membre.
- AJOUTER UN MEMBRE ouvre un formulaire inline :
  - nom ;
  - rôles PILOTE / SPOTTER / TEAM MANAGER ;
  - ANNULER / OK.
- Les suppressions réutilisent la confirmation existante.
- Les ajouts et modifications mettent à jour la sauvegarde locale du navigateur TM.
- Aucun changement Session Active / Mode Performance / Focus / Spotter / Analyzer.
- Version numérique : 7.2.1741.

# V7.2.1741 — Correctifs Session Course UX

- Base stricte V7.2.1733.
- Correction du bouton Session Active qui apparaissait puis disparaissait :
  - un navigateur Team Manager non associé ne peut plus écraser l'état de session chargé par Team Management.
  - le nom de session + point vert restent affichés après création.
- Fin de session :
  - suppression de l'ancienne box générique avec champ NOM DE LA TEAM.
  - nouvelle confirmation dédiée : ANNULER / TERMINER LA SESSION uniquement.
- Sélection d'une équipe existante :
  - bouton ÉDITER ajouté sur chaque membre.
  - édition du nom et des rôles directement dans la fiche membre.
  - validation par bouton OK orange.
  - sauvegarde navigateur Team Manager actualisée après modification.
- Mode Performance, Focus pilote lié au nom d'équipe et sauvegarde profils conservés.
- Version numérique : 7.2.1741.

# V7.2.1741 — Session Course UX + équipe source du Focus pilote

- Base stricte V7.2.1732.
- Premier écran : SÉLECTIONNER UNE ÉQUIPE / CRÉER UNE ÉQUIPE.
- Suppression de l'ancien onglet SESSION COURSE.
- Sélection d'équipe via menu déroulant.
- Création d'équipe : nom + membres + rôles, puis CRÉER UNE SESSION.
- Création de session : Circuit → Équipe → Nom de session → rôles → DÉMARRER LA SESSION.
- Le Focus pilote suit automatiquement le nom de l'équipe de la Session Course.
- Aucune vérification Apex lors de la création.
- SESSION ACTIVE : ÉDITER / OK pour nom d'équipe et nom de session.
- OK orange pendant l'édition.
- Bas d'écran : VALIDER LES CHANGEMENTS / TERMINER LA SESSION.
- Mode Performance et sauvegarde navigateur V1732 conservés.
- Version numérique 7.2.1741.

# V7.2.1741 — Session Course Performance + profils persistants navigateur

- Base stricte V7.2.1731.
- Nouveau bouton Session Course en haut à droite d'Analyzer.
- Avant course : `CRÉER UNE SESSION`.
- Session active : point vert + nom de session + `SESSION ACTIVE`.
- Le bouton du footer reste disponible comme accès de secours et reflète le même état.
- Sauvegarde gratuite des Teams / membres / rôles / appareils associés dans le localStorage du navigateur Team Manager.
- Si Render redémarre après une MAJ avec une base Team vide, le navigateur TM restaure automatiquement les profils avec leurs IDs et associations appareils.
- Une ancienne Session Course n'est jamais restaurée automatiquement après un redéploiement.
- Mode Performance Session Course :
  - PILOTE : rendu Focus Endurance + messages + stands uniquement ; Analyzer/Qualification/Sprint/Map/Filets non rendus en arrière-plan.
  - SPOTTER : moteur Spotter conservé ; Analyzer/Qualification/Sprint non rendus en arrière-plan.
  - TEAM MANAGER : comportement Analyzer complet conservé pour ne sacrifier aucun calcul stratégique.
- Polling `/api/state` et moteur Apex inchangés dans cette première passe.
- Aucun changement des algorithmes Velocity / stratégie / Spotter.
- Version numérique 7.2.1741.

# V7.2.1741 — Focus Endurance iPhone : stands en paysage virtuel

- Base stricte V7.2.1730.
- Le temps aux stands reste dans `#enduranceFocus` et hérite donc de la rotation paysage 90° existante.
- L'overlay IN stands est explicitement dimensionné sur tout le Focus paysage.
- Le message de sortie des stands est explicitement dimensionné sur tout le Focus paysage.
- Typographie et espacements IN/OUT recalibrés avec les unités du paysage virtuel.
- Message pilote V1730 conservé en paysage.
- Aucun changement de logique IN/OUT, chronométrage, détection stands ou auto-hide.
- Android inchangé.
- Aucun changement Analyzer / Spotter / timing / calculs.
- Version numérique 7.2.1741.

# V7.2.1741 — Messages pilote en paysage Focus iPhone

- Base stricte V7.2.1729 stable.
- Le conteneur global `driverMessageOverlay` rejoint la règle source existante du paysage virtuel iPhone.
- Tous les messages pilote affichés pendant un Focus utilisent désormais la même rotation 90° et les mêmes dimensions que le Focus.
- Messages urgents et messages différés concernés, puisqu'ils utilisent le même overlay.
- Animation d'entrée/sortie et auto-fit du texte conservés.
- Android inchangé : verrouillage paysage natif conservé.
- Aucun changement Analyzer, Spotter, timing, calculs ou logique de messagerie.
- Aucune nouvelle surcouche CSS : extension de la règle paysage existante.
- Version numérique 7.2.1741.

# V7.2.1741 — Spotter smartphone : hitbox Maintenance

- Base stricte V7.2.1728.
- Correction ciblée du drag & drop tactile vers Maintenance.
- Desktop inchangé.
- Sur smartphone/touch, la hitbox Maintenance est élargie :
  - +24 px horizontalement ;
  - +70 px au-dessus ;
  - +90 px au-dessous.
- La détection précise existante reste utilisée en complément.
- Aucun changement CSS.
- Aucun changement de logique de transfert kart/équipe/temps d'arrêt.
- Aucun changement Focus Endurance / Analyzer / timing / Velocity.
- Version numérique : 7.2.1741.

# V7.2.1741 — Focus Endurance smartphone : Delta -15 %

- Base stricte V7.2.1727.
- Géométrie 65/35 conservée.
- Grille Delta avec lignes dédiées aux noms conservée.
- Taille des noms équipes/pilotes conservée à la valeur V1727.
- Réduction uniquement des deux valeurs Delta actives de 15 %.
- Aucune autre modification CSS.
- Aucune nouvelle surcouche.
- Desktop et autres modes Focus inchangés.
- Version numérique : 7.2.1741.

# V7.2.1741 — Focus Endurance smartphone : noms équipes +20 %

- Base stricte V7.2.1726.
- Géométrie 65/35 conservée.
- Grille Delta avec lignes dédiées aux noms conservée.
- Taille des valeurs Delta strictement inchangée.
- Noms des équipes voisines : +20 % sur smartphone.
- Noms des équipes voisines : +20 % sur iPhone en paysage virtuel.
- Modification directe des deux règles actives existantes.
- Aucune nouvelle surcouche CSS.
- Aucun changement desktop / autres Focus / logique métier.
- Version numérique : 7.2.1741.

# V7.2.1741 — Focus Endurance smartphone 65/35 + Delta grid

- Base stricte V7.2.1722 stable.
- Focus Endurance smartphone : répartition principale 60/40 -> 65/35.
- La zone haute gagne 5 points de hauteur ; la zone Temps en piste / Dernier temps passe à 35 %.
- Correction de la géométrie interne de la case Delta :
  - nom équipe devant = ligne dédiée ;
  - Delta devant = zone flexible ;
  - filet = 1 px ;
  - Delta derrière = zone flexible ;
  - nom équipe derrière = ligne dédiée.
- Les noms ne dépendent plus de l'espace résiduel laissé par les grandes valeurs Delta.
- Aucune modification de taille de police dans cette passe.
- Aucun nouveau bloc CSS ajouté en fin de fichier.
- Desktop et autres modes Focus inchangés.
- Version numérique : 7.2.1741.

# V7.2.1741 — FULL REINTEGRATION FIX

- Base stricte V7.2.172N.
- Toutes les fonctions récentes de V172N sont conservées.
- Correction de l'erreur V1721 : `analyzerApplySharedRulesFromState()` est conservée.
- `analyzerRulesDesktopLeader()` et `analyzerRulesConfigured()` sont également conservées.
- Retrait uniquement du bootstrap automatique V166 et de son rappel récursif de `renderAnalyzer()`.
- Version numérique : 7.2.1741.

# V7.2.1741 — Normal Mode / Spotter + Focus + Session

- Base stricte : V7.2.172 d'origine.
- Réintégration du Spotter récent de V196.
- Maintenance STANDS dans Analyzer déclarée comme vraie zone de drop.
- Focus Endurance mobile/portrait : dernier rendu récent réintégré.
- Classement Live : le libellé « Temps restant » est remplacé par le nom de session Apex (`title2`, puis `title1`) quand il est disponible.
- Taille du libellé Classement Live inchangée.
- Aucun moteur DYN1 générique V173+ réinjecté.
- Cette version est destinée aux essais en usage normal, sans Mode Test Endurance.

# Velocity V7.2.1741N — Focus Endurance mobile + pilotage Team Manager

- Focus Endurance smartphone : valeurs Delta +30 %.
- Noms équipe/pilote +10 %.
- Dernier temps agrandi dynamiquement au maximum de sa case avec marge de sécurité.
- Le Focus Endurance Pilote possède désormais une équipe cible indépendante de « Équipe suivie » Analyzer.
- Le Team Manager peut changer l'équipe affichée sur le téléphone du pilote pendant une session active.
- La cible Focus Pilote est synchronisée vers les appareils autorisés sans modifier l'équipe suivie du Team Manager.

# V7.2.171 — SYNC STRATÉGIE RELAIS DESKTOP / MOBILE

- Desktop devient source de vérité pour la carte Stratégie Relais.
- Synchronisation serveur du score, confiance, temps en piste, delta/tour, impact/relais, capital stratégique, recommandation et fenêtre conseillée.
- Smartphone consomme le snapshot Desktop quand il est récent et correspond au même circuit / à la même équipe suivie.
- Repli automatique sur le calcul local si le snapshot partagé est absent ou périmé.
- Aucun changement de logique métier du moteur de stratégie.

# V7.2.170 — FOCUS IPHONE PAYSAGE VIRTUEL

- iPhone uniquement : les modes Focus Qualification, Sprint et Endurance restent techniquement en portrait et leur interface est pivotée de 90° en CSS.
- Le pilote peut verrouiller l’iPhone en portrait puis tourner physiquement le téléphone : aucun basculement iOS n’est nécessaire.
- Android conserve strictement son verrouillage paysage natif existant.
- Les titres Qualifications, Sprint et Endurance sont décalés pour laisser la zone iPhone libre et gardent un espace de sécurité avec le filet coloré.
- La persistance Focus de la V7.2.169 est conservée.

# V7.2.169 — FOCUS PERSISTANT

- Les modes Focus Qualification, Sprint et Endurance restent actifs tant que le pilote ne les ferme pas explicitement.
- Suppression de la fermeture involontaire du Focus Endurance lors d'un rafraîchissement des droits/appareils.
- Mémorisation temporaire du Focus actif dans la session du navigateur et restauration automatique après un retour au premier plan ou un rafraîchissement UI.
- Watchdog léger : si un rerender ou une transition interne masque un Focus actif, Velocity le rouvre automatiquement.
- La fin réelle d'une session de course continue à fermer le Focus et efface sa mémorisation.
- Aucun changement apporté aux données, deltas ou au rendu métier des modes Focus.

# V7.2.168 — FIRST KART 'INN + LISIBILITÉ CONFORMITÉ

- Ajout du circuit belge First Kart 'Inn (Apex Timing 8113), Machelen.
- Les valeurs Relais, Temps/pilote et Temps en piste exploitent maintenant toute la largeur de leur case sans être artificiellement plus petites que les autres valeurs.
- Le panneau de détail ouvert depuis Fenêtre conseillée gagne 50 % de taille de texte sur Desktop.
- Aucune modification de la ligne Trafic.

# V7.2.167 — POLISH ANALYZER DESKTOP

- ÉQUIPE SUIVIE : centrage emoji + libellé + badge dans la notification orange, sans modification de la ligne TRAFIC / dead zone / graduations.
- CONFORMITÉ : valeurs RELAIS et TEMPS/PILOTE adaptatives à la largeur de leur case.
- STRATÉGIE : TEMPS EN PISTE adaptatif, CAPITAL STRATÉGIQUE valeur + pourcentage sur une même ligne et même taille.
- RECOMMANDATION / FENÊTRE CONSEILLÉE : typographies renforcées ; résultat/détail de fenêtre agrandi.
- MÉTÉO : « Ciel | Vent | Pluie » regroupés sous la température, taille homogène ; nom du circuit +50 %.
- ENTÊTES : alignement vertical et blanc tournant harmonisés entre ÉQUIPE SUIVIE / COMPTE RENDU, CONFORMITÉ / RÈGLEMENT et MÉTÉO.

# V7.2.166 — SYNCHRO AUTOMATIQUE RÈGLEMENT ANALYZER

- Le règlement actif du desktop est désormais publié automatiquement dès l’ouverture d’Analyzer.
- Il n’est plus nécessaire d’ouvrir « Règlement » puis de cliquer sur ENREGISTRER pour synchroniser le smartphone.
- Pendant l’initialisation, un ancien snapshot serveur ne peut plus écraser les valeurs restaurées sur le desktop.
- Le smartphone reste consommateur du règlement partagé et ne republie pas automatiquement son ancien état local.

# V7.2.165 — SOURCE DE VÉRITÉ RÈGLEMENT ANALYZER
- Correction de l’ordre de restauration : la session locale smartphone est chargée avant le règlement partagé serveur.
- Le règlement partagé devient prioritaire sur les anciens snapshots locaux de chaque appareil.
- Une règle reçue du serveur met à jour le snapshot local actif pour empêcher toute réinjection ultérieure d’une ancienne valeur (ex. Temps pilote 3h30 au lieu de 5h00).
- Conformité réglementaire, Stratégie relais et Capital stratégique utilisent désormais la même configuration sur desktop et smartphone.

# V7.2.164 — SYNCHRONISATION ANALYZER SMARTPHONE
- Conformité réglementaire synchronisée côté serveur entre desktop et smartphone.
- Les paramètres de règlement ne dépendent plus uniquement du localStorage de chaque appareil.
- Stratégie Relais et Capital stratégique utilisent ainsi le même règlement partagé sur tous les appareils du circuit actif.
- Une modification du règlement est publiée au serveur puis récupérée via le flux d’état Analyzer.

# V7.2.163 — FENÊTRE CONSEILLÉE / RETOURS DE KARTS

- Stratégie Relais : la Fenêtre conseillée exploite désormais les karts disponibles et les fins de relais Velocity.
- Détection des karts réellement plus intéressants que le kart actuel (score + confiance).
- Recommandation enrichie : rentrer maintenant si un meilleur kart est disponible, ou prolonger jusqu’à une fenêtre favorable si un meilleur kart arrive bientôt.
- Clic sur Fenêtre conseillée : détail des karts cibles avec délai, numéro de kart, score et confiance.
- Aucun nouveau module : réutilisation des données Velocity / FIN RELAIS et Spotter.

# V7.2.162 — CAPITAL STRATÉGIQUE / LISIBILITÉ STRATÉGIE RELAIS
- Capital stratégique affiché sous la forme d’une seule valeur restante (ex. `398 min`) au lieu de `1710 min / 398 min`.
- Avant le départ, le capital est disponible immédiatement depuis le règlement et ne peut jamais dépasser son capital initial.
- Pendant la course, chaque relais validé plus court que le maximum réglementaire consomme la différence correspondante dans le capital.
- Titre STRATÉGIE RELAIS aligné sur la taille de CONFORMITÉ RÈGLEMENTAIRE.
- Libellés et valeurs Score / Confiance / Temps en piste / Delta/tour / Impact/relais agrandis ×2.
- Titre CAPITAL STRATÉGIQUE aligné sur STRATÉGIE RELAIS et barre de capital doublée en hauteur.
- Carte Météo : Vent + valeur et Pluie + valeur sur une seule ligne, textes agrandis ×2.
- Colonne Relais de Conformité élargie afin de conserver l’amplitude complète sur une seule ligne.

# V7.2.161 — STRATÉGIE RELAIS 100 % PARAMÉTRIQUE
- Suppression du bouton « Valeurs Fun & Race » et du préremplissage associé.
- Les nouvelles configurations réglementaires sont vierges : chaque valeur est saisie manuellement.
- Le moteur Stratégie Relais ne contient plus de valeurs Fun & Race de secours pour la durée, les arrêts, les relais, le temps de stand ou la fermeture.
- Durée de course, arrêts obligatoires, relais min/max, stand minimum, fermeture des stands et marge de sécurité sont lus exclusivement depuis Conformité réglementaire.
- Le Capital stratégique initial et restant est recalculé avec les paramètres de la course active.
- La fermeture des stands est intégrée directement au calcul du Capital stratégique.
- Modifier la durée de course (par exemple 10 h → 12 h) ou une autre règle recalcule automatiquement Capital, fenêtre et recommandation.
- Si le règlement n’est pas complètement configuré, Stratégie Relais affiche « CONFIGURER LE RÈGLEMENT » au lieu d’inventer des valeurs.

# V7.2.160 — STRATÉGIE RELAIS / CONFORMITÉ / TEMPS PILOTES
- Première zone Analyzer Desktop conservée : la carte Équipe suivie garde sa place et son gabarit.
- Conformité réglementaire compactée et complétée par la fermeture des stands (règle T-xx:xx + compte à rebours HH:MM).
- Nouvelle section STRATÉGIE RELAIS dans la carte Conformité : Score, Confiance, Temps en piste, Delta/tour, Impact/relais, Capital stratégique, Recommandation et Fenêtre conseillée.
- Capital stratégique calculé avec le temps restant, les arrêts obligatoires restants, le temps minimum de stand et la limite maximale de relais.
- Le moteur tient compte de la fermeture des stands pour la recommandation de fin de course.
- Carte Météo compactée sans supprimer les icônes, la température actuelle, l'heure locale ni le nom du circuit.
- Nouvelle carte TEMPS PILOTES entre Météo et Messagerie ; si aucun minimum pilote n'est configuré, seul le temps roulé est affiché.
- Notifications Pénalités/Informations déplacées sur le bouton COMPTE RENDU : elles le masquent temporairement et ouvrent la carte Pénalités au clic ; COMPTE RENDU réapparaît ensuite et reste cliquable.

# V7.2.160 — SCORE RELAIS ADAPTATIF AUX CONDITIONS
- Score Relais conserve la logique historique lorsque le rythme du plateau reste stable.
- Détection d'une évolution réelle de piste à l'intérieur d'un relais via une référence temporelle locale de la grille.
- En pluie / séchant / transition, chaque tour est normalisé par rapport au plateau au même moment avant d'alimenter PACE, potentiel et régularité.
- Une forte dispersion entre pilotes sous la pluie n'est pas assimilée à un changement de conditions : le déclencheur repose sur le déplacement de la référence de grille, pas sur l'écart premier / dernier.
- Correction pilote pluie appliquée uniquement lorsqu'un historique suffisant existe (au moins 12 tours répartis sur 2 relais) ; sinon Velocity conserve le score mais réduit la confiance d'attribution au kart lorsque la grille est très dispersée.
- Les tours pluie ne sont plus supprimés par le filtre global médiane +5 s pour Score Relais ; les anomalies restent filtrées localement sur piste stable.
- Un relais sec -> pluie peut désormais recevoir un seul Score Relais cohérent, construit à partir des performances relatives de ses différentes phases.
- Aucun changement des modes Qualification / Sprint ni des autres modules Analyzer.

# V7.2.158 — COMPATIBILITÉ APEX QUALIF / SPRINT / ENDURANCE

- Support complet de `dyn1|count`, `countdown` et `countdown_text`, y compris valeurs décimales Apex exprimées en secondes.
- Sprint : classement du dernier tour limité aux pilotes ayant terminé le même numéro de tour que le pilote suivi.
- Conservation diagnostique du type de session Apex (`race`, `best_time`, `no_live`) sans changement automatique du mode Velocity.

# V7.2.157 — ANALYZER PORTRAIT : FINITIONS UX
- Carte Équipe suivie descendue sous le menu fixe et lignes légèrement resserrées.
- Ligne TRAFIC allongée ; géométrie et espacement 0 / ±2 conservés via le moteur commun desktop.
- HEAT MAP / SIMULER UN ARRÊT / plein écran regroupés sur une seule ligne.
- PIT LANE repositionnée sous le radar et ensemble Radar + Pit Lane centré.
- Conformité : colonne Relais élargie et blocs Stand minimum / Temps mini. par pilote décalés vers la droite.
- Footer portrait simplifié : suppression des outils techniques demandés ; Velocity Lab et Session Course conservés.
- Velocity Lab : croix de fermeture fixée en haut à droite sur smartphone.
- Ajout d’identifiants stables aux cartes Analyzer pour fiabiliser les règles portrait et l’ordre mobile.
- Aucun changement des calculs Analyzer ni du desktop.

# V7.2.157 — ANALYZER PORTRAIT : MENU FIXE TYPE ENDURANCE
- Le menu Analyzer portrait reprend le traitement visuel du bandeau Endurance.
- Filet orange supérieur et filet orange inférieur.
- Bandeau fixé sous la zone système iPhone via `env(safe-area-inset-top)`.
- Le menu ne participe plus au scroll : il reste accessible en permanence.
- La zone Analyzer réserve la hauteur exacte du bandeau fixe afin que la première carte ne passe pas dessous.
- Les ancres des cartes tiennent compte du bandeau fixe.
- Aucun changement desktop, aucun changement des calculs Analyzer.

# V7.2.153 — HEAT MAP : SIMULATION D’ARRÊT TEMPORELLE
- La simulation d’arrêt utilise désormais la **position virtuelle live** commune aux Filets / Trafic / Radar.
- Au clic, la projection est figée : Velocity fait avancer virtuellement tous les concurrents pendant le temps nécessaire pour rejoindre les stands + le différentiel pit lane + la référence d’arrêt.
- La référence d’arrêt devient robuste : médiane des **3 meilleurs arrêts propres** disponibles après filtrage des valeurs aberrantes ; fallback règlementaire si aucun historique n’est disponible.
- Calcul de la **position de course projetée** après l’arrêt.
- Calcul du trafic physique à la réintégration : kart immédiatement devant, kart immédiatement derrière, densité dans **±5 s** et **±10 s**.
- Le Radar affiche un **repère fantôme SORTIE** pendant la projection.
- Les concurrents affichés sur le Radar utilisent exactement leur position projetée au même horizon temporel ; la projection ne dérive plus après le clic.
- La géométrie actuelle assimile l’entrée/sortie des stands à la ligne de chronométrage lorsque le circuit ne fournit pas de position de pit dédiée.
- Aucun changement sur Score Sprint, Score Relais, Trafic live ou Filets 60 FPS.

# V7.2.153 — FILETS LIVE 60 FPS
- Remplacement des animations `left` recréées à chaque rendu par un moteur persistant `requestAnimationFrame`.
- Mise à jour visuelle à chaque frame à partir de la phase live commune.
- Déplacement via `transform: translate3d(...)` pour profiter de la composition GPU et limiter les recalculs de layout.
- Les filets ne sont plus détruits/recréés à chaque rafraîchissement du Classement Live.
- Recalage automatique sur chaque nouvelle phase Apex, sans modifier les calculs de position.
- Trafic, Radar, Score Sprint et Score Relais inchangés.

# V7.2.153 — COMPTEUR APEX ADAPTATIF
- `dyn1|countdown|...` continue d’alimenter **TEMPS RESTANT**.
- `dyn1|count|...` alimente désormais **TEMPS ÉCOULÉ**.
- Le temps écoulé est interpolé localement entre deux trames Apex, exactement comme sur le Live Timing Campillos.
- Recalage automatique à chaque nouvelle valeur `count`.
- Le cartouche Analyzer bascule automatiquement entre **TEMPS RESTANT**, **TEMPS ÉCOULÉ** et **TOURS** selon le type de session détecté.
- Les vues Qualification / Sprint / Endurance utilisent le même compteur adaptatif.
- Radar, Trafic, filets, Score Sprint et Score Relais inchangés.

# V7.2.153 — LIVE INTERNATIONAL + POSITION UNIFIÉE
- `Vueltas / Vuelta`, `Giri / Giro`, `Runden / Runde`, `Voltas / Volta`, `Rondes / Ronde` et variantes polonaises sont reconnus comme nombre de tours même si `data-type` est vide.
- `dyn1|count|...` est reconnu comme **temps écoulé**, jamais comme temps restant.
- La course active n'est plus dépendante du seul `countdown` : fraîcheur de la grille sportive, chrono `count` frais ou tracking Apex frais peuvent activer le moteur live.
- Filets stylisés disponibles sur les courses sans countdown.
- **Radar / Heat Map, Trafic et Filets** utilisent le même moteur de position `analyzerLiveProgressPhase`.
- Le Radar accepte le fallback Velocity si le tracking Apex détaillé est absent.
- Le temps restant reste `—` quand Apex ne fournit aucune durée restante exploitable ; Velocity n'invente pas la durée.
- Score Relais et Score Sprint inchangés.

# V7.2.153 — TRAFIC COHÉRENT + FILETS VELOCITY
- **TRAFIC** et **CLASSEMENT LIVE** utilisent désormais strictement la même position virtuelle linéaire du kart.
- Suppression du repli automatique de phase à ±0,5 tour qui pouvait faire apparaître dans TRAFIC un kart « devant » alors que son filet était visuellement derrière.
- Le sens devant/derrière de TRAFIC est maintenant directement cohérent avec la position horizontale des filets.
- Filets redessinés façon **Velocity** : traînée progressive transparente → gris froid → blanc, extrémité nette et petit halo lumineux.
- Longueur et mécanique de déplacement restent inchangées ; seul le rendu visuel est enrichi.
- Aucun changement sur Score Relais ou Score Sprint.

# V7.2.153 — ANALYZER : FILETS LIVE + MOTEUR COMMUN TRAFIC
- Ajout de filets fins gris/blanc sous chaque ligne du **CLASSEMENT LIVE** Analyzer.
- Les filets ont une longueur fixe d’environ **13 %** de la largeur du classement ; c’est leur **position horizontale** qui évolue, comme le principe observé sur Apex Timing.
- Le leader possède lui aussi son filet afin de conserver une référence visuelle complète.
- L’extrémité du filet représente la progression virtuelle du kart entre deux passages de chronométrage.
- Animation linéaire continue jusqu’au passage suivant ; la position est recalée à chaque mise à jour live.
- Les filets et **TRAFIC** utilisent désormais le même moteur de phase virtuelle (`analyzerLiveProgressPhase`) : position Apex en priorité, puis fallback Velocity si le tracking détaillé n’est pas disponible.
- Aucun filet n’est affiché hors course, au stand ou dans le **Classement virtuel**.
- Aucun changement sur **Score Relais** ni sur **Score Sprint**.

# V7.2.153 — SCORE SPRINT : TRANSITIONS ENTRE GROUPES
- Modification **uniquement du Score Sprint**. Le Score Relais reste strictement inchangé.
- Détection des changements de niveau/groupe : `Espoir ↔ Elite`, `Groupe 2 ↔ Groupe 1`, `Groupe B ↔ Groupe A` et variantes équivalentes dans les noms de session.
- Lorsqu’un pilote change de groupe, son Δ personnel n’est plus corrigé par la simple différence de médiane entre son ancien groupe et son nouveau groupe.
- Velocity cherche le **groupe d’arrivée à la manche précédente** et mesure l’évolution médiane des pilotes restés dans ce groupe entre les deux manches.
- Exemple : `Course 2 Espoir → Course 3 Elite` est comparé à l’évolution `Course 2 Elite → Course 3 Elite` des pilotes Elite stables.
- La nouvelle référence exige au moins **5 pilotes stables** dans le groupe d’arrivée ; sinon Velocity conserve automatiquement l’ancienne référence Sprint.
- La normalisation médiane + MAD, le signal en σ et les poids adaptatifs Transition/Rythme restent inchangés.

# V7.2.153 — SCORE SPRINT : ORDRE CHRONOLOGIQUE DES SESSIONS
- Les imports CSV/ZIP ne conservent plus l’ordre arbitraire des fichiers dans l’archive.
- Tri automatique avant calcul : **QUALIF A → QUALIF B → COURSE 1 A → COURSE 1 B → COURSE 2 A → COURSE 2 B → …**.
- Reconnaissance des libellés Apex `QUALIF / QUALIFICATION / CHRONO` et `COURSE / RACE / MANCHE / HEAT / SPRINT`.
- Les numéros de manche sont utilisés pour ordonner Course 1, Course 2, Course 3, etc.
- Lorsqu’un groupe A/B est explicitement présent dans le nom Apex, A est placé avant B.
- Le même ordre est utilisé par le calcul Score Sprint, le PDF, **ÉVOLUTION PAR PILOTE** et **DÉTAIL DES TRANSITIONS**.
- L’ordre normalisé est conservé lors des imports cumulatifs suivants.

# V7.2.153 — VELOCITY LAB : IMPORT CSV / MULTI-CSV / ZIP
- Nouveau bouton **IMPORTER CSV / ZIP** dans Score Sprint.
- Accepte un CSV, plusieurs CSV sélectionnés en une fois ou un ZIP contenant plusieurs CSV.
- Les imports sont **cumulatifs** pendant la session Velocity Lab.
- Déduplication par `Session + Pilote + Tour` : une ligne déjà identique est ignorée, une ligne différente pour la même clé remplace l’ancienne, une nouvelle ligne est ajoutée.
- Les sessions nouvelles sont ajoutées à la suite des sessions déjà importées.
- Après import, Velocity reconstruit automatiquement les sessions, pilotes, karts et tours puis utilise exactement le moteur Score Sprint V2 existant.
- Les sessions importées apparaissent avec la source **CSV** et sont toutes sélectionnées par défaut.
- Compteur d’import : lignes lues, nouvelles, mises à jour, identiques et ignorées.
- Bouton **EFFACER L’IMPORT** pour repartir d’une base vide.
- Les données importées peuvent ensuite être réexportées avec **TÉLÉCHARGER TOUS LES TOURS** et utilisées pour le PDF complet.

# V7.2.153 — PDF SCORE SPRINT : RAPPORT COMPLET DE L’ÉVÉNEMENT
- Le PDF n’est plus centré uniquement sur la dernière course.
- Un tableau de résultats est généré pour **chaque session sélectionnée** : `QUALIF A`, `QUALIF B`, `COURSE 1 A`, `COURSE 1 B`, etc.
- Après chaque manche de course, ajout d’un **CLASSEMENT COURSE 1**, **CLASSEMENT COURSE 2**, etc., consolidant les groupes A+B.
- Le classement consolidé ne recalcule pas les scores ensemble : chaque pilote conserve le score calculé dans son propre plateau A ou B.
- Les tableaux **ÉVOLUTION PAR PILOTE** sont conservés.
- La matrice **STABILITÉ PAR KART** reste présente lorsque le suivi des numéros est activé.
- Le **DÉTAIL DES TRANSITIONS** est conservé et utilise les libellés explicites des sessions (QUALIF A/B, COURSE 1 A/B...).

# V7.2.153 — STATS APEX : RETRY + EXPORT DIAGNOSTIC
- Les réponses Apex vides ne sont plus considérées immédiatement comme définitives.
- Jusqu’à 3 tentatives sur la première fenêtre de tours, puis nouvelles tentatives sur les fenêtres suivantes.
- Score Sprint charge les pilotes historiques séquentiellement afin de limiter les réponses Apex manquantes lors des rafales de requêtes.
- « Télécharger tous les tours » utilise la même récupération robuste.
- Le CSV contient désormais une colonne **STATUS**.
- Tout pilote présent dans la grille est exporté même si Apex ne renvoie aucun tour : `AUCUN TOUR RETOURNÉ`.
- Le résumé indique le nombre de pilotes/session sans retour Apex.

# V7.2.153 — VELOCITY LAB : TÉLÉCHARGER TOUS LES TOURS
- Nouveau bouton **TÉLÉCHARGER TOUS LES TOURS** dans Score Sprint.
- L’export utilise toutes les sessions cochées dans Velocity Lab ; la session LIVE est ajoutée uniquement si l’option correspondante est cochée.
- Export CSV compatible Excel, une ligne par tour et par pilote.
- Colonnes : Session ID, Session, Type, Pilote, Kart, Apex Row, Tour, Temps brut ms + formaté, S1/S2/S3 bruts ms + formatés.
- Les données sont les **données Apex brutes** : aucun nettoyage, aucun retrait de tour de lancement, aucun filtre Velocity.
- L’export est indépendant du calcul Score Sprint et permet d’auditer précisément les données reçues par Velocity.

# V7.2.153 — SCORE SPRINT : RÉCUPÉRATION STATS HISTORIQUES
- Correction effective du double retrait du tour de lancement dans Score Sprint.
- Anthony Silik : 1:29.111 écarté, puis 1:00.227 / 1:00.014 / 1:00.200 conservés = 3 tours exploitables.
- Suppression robuste des fausses lignes d’en-tête Apex `Pilote / Kart`.
- Les matrices écran et PDF n’affichent plus jamais littéralement `null`.
- Un vrai manque de données est affiché `— / Données insuffisantes`.

# V7.2.153 — SCORE SPRINT : FIX TOURS EXPLOITABLES
- Correction du double retrait du tour de lancement dans Score Sprint.
- Si le tour de lancement a déjà été écarté par le filtre d’outlier, Velocity ne supprime plus le tour propre suivant.
- Cas de contrôle Anthony Silik : 1:29.111 écarté, puis 1:00.227 / 1:00.014 / 1:00.200 conservés = 3 tours exploitables, donc score calculable.
- Filtrage de la fausse ligne historique Apex `Pilote / Kart`.
- Aucun score insuffisant ne doit désormais apparaître littéralement sous forme `null` : affichage `— / Données insuffisantes`.

# V7.2.153 — SCORE SPRINT : 42 PILOTES A+B
- Le tableau **SCORE SPRINT EXPÉRIMENTAL** réunit désormais tous les pilotes des deux groupes de la dernière étape (ex. 21 Groupe A + 21 Groupe B = 42 pilotes).
- Les scores restent calculés séparément dans chaque groupe : le plateau A n’est pas mélangé au plateau B.
- La matrice **ÉVOLUTION PAR PILOTE** affiche explicitement `QUALIF A / QUALIF B`, puis `COURSE 1 A / COURSE 1 B`, etc.
- Les pilotes présents dans la grille mais avec trop peu de tours exploitables restent visibles avec `—` et la mention **Données insuffisantes**.
- Une session LIVE encore vide n’est plus considérée comme la dernière étape de résultats.
- L’export PDF reprend tous les pilotes de l’étape principale sur plusieurs pages si nécessaire.

# V7.2.138 — SCORE SPRINT : GROUPES A/B + EXPORT PDF
- Velocity Lab reconnaît désormais **Groupe A / Groupe B** comme deux sous-sessions d’une même étape.
- `Qualif A + Qualif B` produit une seule étape **QUALIF** regroupant tous les pilotes.
- Même logique pour `Course 1 A/B`, `Course 2 A/B`, etc.
- Chaque groupe conserve son **propre plateau statistique** pour le calcul du score : A n’est pas comparé artificiellement à B.
- La référence du pilote n’est mise à jour qu’après traitement complet de l’étape ; Qualif B n’est donc jamais considérée comme la session suivante de Qualif A.
- Le classement principal de l’étape réunit les résultats des deux groupes.
- Export PDF Score Sprint sécurisé et compatible avec les étapes multi-groupes.

# V7.2.138 — CLASSEMENT LIVE + SCORE SPRINT
- Classement Live : renforcement du décodeur Apex par libellé pour **Position, Kart, Tours, Dernier tour, Meilleur tour, Écart et Intervalle** lorsque le circuit utilise des `data-type` personnalisés.
- Classement Live : conservation de la dernière valeur valide d’une cellule pendant les mises à jour Apex partielles, au lieu d’afficher uniquement les noms.
- Courses au nombre de tours : aucune dépendance à un compte à rebours temps pour alimenter les colonnes du classement.
- Velocity Lab / Score Sprint : l’option **Suivre les numéros de kart** est désormais affichée dans un bloc dédié, toujours visible dès l’ouverture de Score Sprint.
- Décochée, les numéros restent affichés mais sont explicitement **non pris en compte** ; cochée, ils servent au suivi et à la matrice Karts.

# V7.2.138 — SCORE SPRINT : KARTS AFFICHÉS EN MODE RELAIS
- En **MODE RELAIS** (option « Suivre les numéros de kart » décochée), les numéros de kart restent visibles à titre informatif.
- Une mention explicite indique que les numéros de kart **ne sont pas pris en compte dans le calcul**.
- La matrice Pilotes conserve le numéro de kart sous le score, avec la mention « non pris en compte ».
- La matrice **Stabilité par kart** reste réservée au MODE SUIVI KARTS.
- L’export PDF conserve également les numéros de kart en MODE RELAIS et précise qu’ils ne participent pas à l’analyse.

# V7.2.138 — SCORE SPRINT : MODE RELAIS / SUIVI KARTS

- Ajout dans Velocity Lab / Score Sprint de l’option **Suivre les numéros de kart**, décochée par défaut.
- Option décochée : **MODE RELAIS**. Les numéros de kart sont ignorés dans la lecture des résultats ; l’analyse suit uniquement chaque pilote de session en session avec l’Algo V2 relatif au plateau.
- Option cochée : **MODE SUIVI KARTS**. Le numéro de kart est affiché sous le score pilote et la matrice **Stabilité par kart** est activée.
- Le tableau de classement et le détail des transitions masquent les colonnes Kart en mode Relais.
- L’export PDF indique explicitement le mode utilisé et supprime toutes les références aux numéros de kart en mode Relais.
- En mode Relais, la matrice Pilotes affiche sous le score le Δ corrigé et le signal σ à la place du numéro de kart.
- Home, pied de page PDF et User-Agent mis à jour en **Velocity V7.2.138**.

# V7.2.134 — ALGO V2 PLATEAU RELATIF

- Analyzer passe au moteur **Velocity V2** validé sur les jeux de données historiques Sprint et Endurance.
- Suppression des seuils absolus en secondes pour la composante Transition.
- Le Δ reste calculé comme `Δ pilote - Δ plateau`, puis sa force est normalisée par la dispersion robuste du plateau (médiane + MAD, exprimée en σ).
- Pondération adaptative : Transition varie progressivement de **25 à 45 %** selon la force statistique du signal ; Rythme varie de **45 à 25 %**.
- Sans transition exploitable, les autres facteurs sont renormalisés automatiquement.
- En Endurance, SCORE RELAIS compare chaque relais à une **fenêtre de tours comparable**, afin de tenir compte des changements de kart asynchrones entre équipes.
- La confiance affichée distingue mieux l’attribution au kart : même pilote avant/après = confiance renforcée ; changement de pilote ou pilote inconnu = confiance réduite.
- Velocity Lab / Score Sprint utilise désormais la même logique V2 relative au plateau.
- Home et User-Agent mis à jour en **Velocity V7.2.134**.

# V7.2.133 — VELOCITY LAB MATRICES + EXPORT PDF

- Ajout des matrices **ÉVOLUTION PAR PILOTE** : score par Qualif/Course avec numéro de kart sous le score.
- Ajout des matrices **STABILITÉ PAR KART** : score par Qualif/Course avec nom du pilote sous le score.
- Ajout du bouton **EXPORTER EN PDF** dans Score Sprint.
- Le PDF contient : classement de la dernière session, matrice Pilotes, matrice Karts et détail complet des transitions/Δ corrigés.
- Aucun changement du classement Velocity officiel ni du Score Relais.

# V7.2.133 — Velocity Lab : Score Sprint expérimental

- Ajout d’un mode **SCORE SPRINT** exclusivement dans Velocity Lab ; aucun changement du classement Velocity ni de SCORE RELAIS dans Analyzer.
- Détection des anciennes sessions Apex de type Qualification / Course avec sélection manuelle et réorganisation avant calcul.
- Prise en charge de deux groupes de qualification / course et ajout optionnel de la session LIVE comme dernière étape.
- Reconstruction de l’historique individuel de chaque pilote : dernière session pertinente → session suivante, quel que soit son groupe.
- Calcul expérimental du Δ corrigé : variation du temps moyen pilote moins variation médiane du plateau.
- Pondération adaptative : TRANSITION progresse de 25 à 45 % selon |Δ corrigé|, tandis que PACE diminue de 45 à 25 %.
- La règle est symétrique : amélioration forte = kart valorisé ; dégradation forte = kart sanctionné.
- Sans référence antérieure exploitable, Transition est absente et Pace / Potential / Consistency / Sample sont renormalisés.
- Le tableau Score Sprint affiche Score, temps moyen, Δ corrigé, poids Pace/Transition, session et kart précédents, plus le détail complet des transitions.

## V7.2.131 — Delta : gain de position vert

- Le Delta DEVANT passe en vert lorsque l'équipe suivie franchit la ligne en ayant gagné au moins une position.
- La règle est symétrique à la V7.2.130 : gain de place = vert, perte de place = orange.
- Le fait de course est prioritaire sur la réinitialisation normale provoquée par un changement de P-1.
- Le Delta DERRIÈRE reste totalement indépendant.
- Si la position ne change pas, la tendance normale basée sur l'intervalle Apex reste inchangée.

## V7.2.130 — Delta : perte de position orange

- Le Delta DEVANT passe en orange lorsque l'équipe suivie franchit la ligne en ayant perdu au moins une position.
- Cette règle de fait de course est prioritaire sur la réinitialisation normale provoquée par le changement de P-1.
- Le Delta DERRIÈRE reste totalement indépendant et conserve ses règles Velocity.
- Après ce passage, le Delta DEVANT reprend la tendance normale avec le nouveau concurrent devant.

# Velocity V7.2.129 — Delta devant / derrière indépendants

- Sépare complètement l’historique de tendance du Delta devant et du Delta derrière.
- Delta devant : échantillonné quand l’équipe suivie franchit la ligne, puisque la donnée native vient de `followed.interval`.
- Delta derrière : échantillonné quand le poursuivant P+1 franchit la ligne, puisque la donnée native vient de `behind.interval`.
- Règle Velocity devant : écart qui diminue = vert ; écart qui augmente = orange.
- Règle Velocity derrière : avance qui augmente = vert ; avance qui diminue = orange.
- Même comportement pour les écarts en secondes et en tours, avec remise à zéro indépendante si P-1 ou P+1 change.
- La logique commune reste utilisée par Équipe suivie, Focus Sprint et Focus Endurance.

# Velocity V7.2.128 — Delta Apex natif : écarts en tours

- Delta commun : prise en charge des intervalles Apex exprimés en tours, y compris les libellés localisés (`Ronde(s)`, `Vuelta(s)`, `Runde(n)`, `Giro/Giri`, `Volta(s)`).
- Empêche qu’un écart tel que `3 Rondes` soit interprété comme `3 secondes`.
- Équipe suivie, Focus Sprint et Focus Endurance utilisent la même logique temps/tours.
- La tendance vert/orange n’est comparée que si l’unité reste identique entre deux mesures ; un passage secondes ↔ tours repart neutre.

# Velocity V7.2.127 — Delta Apex natif

- Focus Sprint, Focus Endurance et Équipe suivie utilisent désormais une source Delta commune.
- `interval` (`data-type="int"`) Apex devient la source prioritaire pour l'écart au concurrent immédiatement devant.
- L'écart derrière utilise l'`interval` Apex du concurrent P+1, donc son retard direct sur l'équipe suivie.
- `gap` au leader n'est utilisé qu'en fallback si `interval` est indisponible.
- Suppression de la priorité donnée au recalcul par nombre de tours dans la carte Équipe suivie.
- Les couleurs vert/orange utilisent exactement les mêmes valeurs que les écarts affichés.
- L'historique Delta est réinitialisé séparément lorsque P-1 ou P+1 change, pour éviter de comparer deux adversaires différents.
- Le backend applique la même priorité Apex native pour rester cohérent avec l'interface.

# Velocity V7.2.126 — Notifications Analyzer Apex

- Analyzer : nouvelle notification orange en haut à droite, à l’opposé de **ENDURANCE**, pour les nouveaux événements Apex.
- Clic sur la notification : défilement direct vers **PÉNALITÉS ET INFORMATIONS** et remise à zéro des non-lus.
- Libellé dynamique : **Pénalité [équipe]**, **Informations**, **Pénalité & Informations** ou **Pénalités** selon les événements non lus.
- Badge numérique uniquement à partir de 2 événements non lus.
- Le premier `com||` reçu sert de base : l’historique antérieur à la connexion ne génère aucune fausse notification.
- Déduplication de la notification instantanée `msg|msgt` lorsque le même événement arrive ensuite dans `com||`.
- Aucun changement sur les blocs pénalités des autres modes.

# Velocity V7.2.125 — Événements Apex natifs

- Analyzer : `com||` devient la source de vérité structurée de **PÉNALITÉS ET INFORMATIONS**.
- Parsing natif de l'heure, `data-flag`, numéro de kart éventuel et texte complet.
- Typage Apex conservé : `penalty`, `warning`, `msg`, `msg_warning`, `green`.
- Les informations générales sans kart sont conservées.
- Association kart → équipe lorsqu'elle est disponible au moment de l'ingestion.
- `msg|msgt|...` sert de notification immédiate temporaire et est dédupliqué automatiquement dès que la même information apparaît dans `com||`.
- Aucun changement sur les blocs pénalités Qualification, Sprint ou Focus.

# V7.2.124 — Schéma Apex + sessions natives

- Le schéma fourni par le `grid` Apex via `data-type` devient explicitement la source de vérité dès qu’il est disponible ; aucun mapping relatif `cX` ne peut ensuite le remplacer.
- Le diagnostic protocolaire expose désormais `schema_source` et le `column_schema` réellement détecté pour faciliter les vérifications piste par piste.
- Ajout de `/api/apex/sessions` : Velocity interroge directement la commande Apex `S#`, structure les sessions et les classe (qualification, endurance, course, essais, autre).
- Score Relais privilégie les sessions Apex classées `qualification` pour retrouver le contexte R1, avec fallback sur l’ancien parsing brut si l’endpoint structuré n’est pas disponible.
- Reconnaissance étendue des noms de qualification : Qualif / Qualification / Qualifying / Tijdrijden / Chrono(s) / Time Trial / Time Attack.
- Le cache du Service Worker passe à V7.2.124 pour forcer le chargement des nouveaux fichiers.

# V7.2.123 — Données STATS Apex natives

- Alignement du parseur `.P` Velocity sur le JavaScript officiel Apex (`tzfji`) : durées, temps piste, temps stands et `driver_total_time` sont interprétés directement en millisecondes Apex, sans conversion heuristique.
- Lecture enrichie de `.INF` : numéro de kart courant, liste des pilotes et drapeau `current` (`is_current`) sont conservés dans le cache Analyzer.
- SCORE RELAIS rattache désormais chaque relais au pilote fourni par Apex dans `.P`; le relais en cours utilise le pilote `current` de `.INF`.
- Velocity / Velocity Lab utilisent le pilote courant officiel Apex pour la continuité 👤/👥 et privilégient le numéro de kart `.INF` lorsqu'il est disponible.
- Le moteur actuel reste en fallback lorsque `.P` ou `.INF` ne sont pas fournis par une installation Apex.

# V7.2.122 — Score Relais : largeur réellement fixe

- Les colonnes R1 à Rn utilisent désormais un `colgroup` commun et une largeur structurelle fixe de 56 px.
- La largeur totale du tableau des relais est calculée explicitement à partir du nombre de relais, ce qui empêche le navigateur de redistribuer l’espace entre les colonnes.
- Les valeurs à 1, 2 ou 3 chiffres, y compris 100, restent centrées dans des colonnes strictement identiques.
- Aucun changement du calcul des scores, des couleurs, des colonnes fixes ou du scroll horizontal.

# V7.2.121 — Score Relais : colonnes uniformes

- Toutes les colonnes R1 → Rn ont désormais strictement la même largeur.
- Largeur dimensionnée pour afficher confortablement une valeur à trois chiffres comme 100.
- Les scores à un ou deux chiffres restent centrés dans la même largeur.
- Aucun changement des calculs, couleurs, colonnes fixes ou navigation horizontale.

# V7.2.120 — Score Relais : R1 réellement accessible

- Séparation physique des colonnes fixes TOP / POS / KART / ÉQUIPE et de la zone horizontale R1 → Rn.
- R1 et R2 ne peuvent plus être masqués sous les colonnes fixes lorsque le scroll est déjà à zéro.
- Navigation horizontale libre de R1 au dernier relais, avec conservation de la position pendant les rafraîchissements.
- Aucun changement des calculs de Score Relais.

# V7.2.119 — Navigation complète Score Relais

- La vue SCORE RELAIS s’ouvre désormais systématiquement sur R1.
- Le défilement horizontal est indépendant de la vue VELOCITY et peut revenir complètement à gauche jusqu’à R1.
- La position de scroll est conservée pendant les rafraîchissements de SCORE RELAIS, sans être écrasée par les rerenders STATS.
- Les colonnes TOP | POS | KART | ÉQUIPE / PILOTE restent figées pendant la navigation horizontale.
- Amélioration du swipe horizontal sur mobile et trackpad.

# V7.2.118 — TRAFIC + Heat Map unifiés sur le tracking Apex

- Heat Map et TRAFIC utilisent désormais la même phase Apex par concurrent.
- Expiration des positions 5 s après la fin du segment, comme Apex.
- Les segments pit `in/out` ne sont plus projetés artificiellement sur le radar principal.
- Identité concurrent stable `rXXXXX` conservée.

# V7.2.117 — TRAFIC aligné sur le tracking Apex

- Analyzer — ligne **TRAFIC** : l’identité temporelle utilise désormais l’identifiant concurrent Apex stable `rXXXXX` (`apex_row`) et non le numéro de kart.
- Lorsque les impulsions Apex `*`, `*i1`, `*i2`, `*in`, `*out` sont disponibles, TRAFIC utilise exclusivement le moteur de position déjà alimenté par ces événements (`track/s1/s2/s3/in/out`) ; aucun mélange avec l’ancienne interpolation n’est effectué.
- La progression est calculée à partir de l’horodatage et de la durée de la portion Apex, sur le même principe que le Live Tracking Apex.
- Un état dépassé de plus de 5 s est ignoré, comme sur Apex, afin d’empêcher un ancien concurrent de réapparaître sous forme de « kart fantôme ».
- L’ancienne interpolation par passages de tours est conservée uniquement en fallback pour les circuits qui ne fournissent pas de tracking exploitable.
- Aucun changement de design de la ligne TRAFIC ni des autres modules Analyzer.

# V7.2.116

- Analyzer — carte **PÉNALITÉS ET INFORMATIONS** : numéro de kart, nom d’équipe et texte du message agrandis de 25 %.
- La taille de l’heure reste inchangée.
- Aucun changement sur les pénalités des autres modes.

# V7.2.115

- Analyzer uniquement : la carte PÉNALITÉS devient **PÉNALITÉS ET INFORMATIONS**.
- La carte reprend désormais l’intégralité du journal Apex `comments` : pénalités, avertissements et messages d’information.
- Les messages sans kart/équipe (ex. Start kartwissel) sont conservés tels quels, sans association artificielle.
- Les blocs pénalités Sprint, Qualif, Focus et autres modes restent inchangés.

# V7.2.114

- Analyzer : le Classement Live tient désormais intégralement dans la largeur de sa carte sur desktop, sans défilement horizontal.
- Conformité réglementaire : « Cadence requise » devient « Temps mini. par pilote » et reprend directement le paramètre règlementaire « Temps minimum par pilote (minutes) ».
- Pénalités : suppression de la colonne/en-tête PÉNALITÉS ; chaque ligne affiche désormais « ÉQUIPE : TEXTE DE LA PÉNALITÉ » après HEURE et KART.

# V7.2.113
- Météo horaire : textes et icônes réduits de 25 %, typographie affinée.
- Pénalités : hauteur des lignes réduite de 25 %.
- Classement LIVE : largeur et colonnes figées pour supprimer les variations lors de l’alternance Équipe/Pilote ; la carte Pénalités conserve les mêmes axes.

# V7.2.112 — Météo x3 & alignement Pénalités

- Dalles horaires Météo : textes et icônes agrandis x3.
- PÉNALITÉS : HEURE alignée sur POS du Classement LIVE.
- PÉNALITÉS : KART aligné sur la colonne KART du Classement LIVE, avec la même taille de numéro.
- PÉNALITÉS : conservation d’un espace invisible équivalent à la colonne IN pour garantir l’alignement.
- Texte des pénalités en blanc.

# V7.2.111 — Pénalités en colonnes & rééquilibrage Météo/Messagerie

- Carte PÉNALITÉS transformée en tableau à 4 colonnes : Heure | Kart | Équipe | Pénalités.
- Entêtes alignés sur la typographie du Classement Live ; numéro de kart seul ; équipe et pénalité alignées à gauche.
- Messagerie Pilote réduite de 40 % en hauteur sur desktop.
- Météo agrandie de l’espace libéré ; les dalles horaires occupent toute la hauteur disponible sous Vent / Pluie.
- La hauteur cumulée Météo + Messagerie reste identique à Équipe suivie / Conformité réglementaire.

# V7.2.110 — Layout Analyzer équilibré & Pénalités Apex

- **Conformité réglementaire** prend désormais toute la hauteur de la carte **Équipe suivie** afin d'agrandir les cartes pilotes.
- **Météo** est compactée et **Messagerie Pilote** est placée juste dessous ; les deux cartes cumulées ont la même hauteur qu'Équipe suivie / Conformité.
- Nouvelle carte **PÉNALITÉS** sous **Classement Live**, alimentée par le flux Apex.
- Historique complet des pénalités : fusion de la zone Commentaires Apex et de l'historique de la colonne Péna., tri du plus récent au plus ancien, heure et kart conservés lorsqu'ils sont fournis.
- La carte Pénalités est scrollable pour conserver toutes les sanctions sans agrandir excessivement la page.

# V7.2.109 — Temps pilotes officiels Apex

- Conformité réglementaire : temps pilotes alimentés par `driver_total_time` Apex, sans reconstruction locale des relais.
- Compte Rendu : nouvelle section TEMPS DE ROULAGE TOTAL basée sur les totaux Apex officiels.
- Association pilote/relais améliorée grâce à `driver_id` + bloc `INF` Apex.
- Cartes pilotes compactées : suppression de la silhouette, nom/prénom agrandis et temps total en gras.
- Les relais trop courts restent visibles dans le Compte Rendu mais n'affectent pas les totaux pilotes officiels.

# V7.2.107 — Velocity Lab unifié avec le moteur STATS / Score Relais

- Velocity Lab utilise désormais les mêmes relais reconstruits depuis STATS que SCORE RELAIS.
- Delta brut, Delta plateau et Delta corrigé sont strictement identiques entre SCORE RELAIS, le classement VELOCITY et Velocity Lab.
- La composante TRANSITION de Velocity Lab utilise le même Delta corrigé que SCORE RELAIS.
- Les cinq composantes du score affiché dans Velocity Lab reprennent le score du dernier relais reconstruit depuis STATS quand il est disponible.
- Le classement VELOCITY utilise également ce même score de relais reconstruit, avec fallback sur l'ancien moteur uniquement tant que les STATS ne sont pas encore chargées.
- Chargement des SCORE RELAIS lancé en arrière-plan depuis Analyzer pour éviter une divergence tant que l'utilisateur n'a pas ouvert manuellement la vue SCORE RELAIS.

# V7.2.105 — Delta Score Relais unifié & rendu Analyzer stabilisé

- La colonne Δ du classement Velocity utilise désormais exactement le Δ corrigé du dernier relais calculé par SCORE RELAIS lorsque les STATS sont disponibles.
- Le tri Delta utilise la même source de vérité.
- La reconstruction périodique SCORE RELAIS ne relance plus le rendu global Analyzer.
- Heat Map et Velocity ne sont plus démontés/réaffichés pendant le rafraîchissement des relais.
- SCORE RELAIS se rafraîchit de manière isolée et la vue Velocity met à jour uniquement ses cellules Delta.

## V7.2.103

- Delta voisinage harmonisé dans Analyzer, Focus Sprint et Focus Endurance.
- Équipe devant : écart affiché avec signe positif.
- Équipe derrière : écart affiché avec signe négatif.
- Couleurs calculées uniquement sur l’évolution de la magnitude de l’écart entre deux tours du pilote suivi.
- Devant : écart qui se réduit = vert ; qui augmente = orange.
- Derrière : écart qui augmente = vert ; qui se réduit = orange.
- Tolérance de comparaison ramenée à 0,001 s pour éviter de masquer les évolutions utiles.

## V7.2.102
- Spotter/STANDS : cartes en attente = fond sombre + filet orange uniquement.
- Spotter/STANDS : premier kart disponible = fond vert renforcé.
- Analyzer Trafic : détection de course active durcie pour supprimer les cercles adverses fantômes hors session.

# Velocity V7.2.102 — Correction multi-files Spotter

- La validation d’un kart entrant détermine désormais la file choisie avant de sélectionner le kart à attribuer.
- Velocity prend uniquement le premier kart `available` de la file sélectionnée (File 1, 2 ou 3).
- Le kart rendu par l’équipe entrante est ajouté au fond de cette même file via son `queueFile`.
- Les autres files restent totalement inchangées lors de la validation.
- Message explicite si la file choisie ne contient aucun kart disponible.
- La logique Maintenance existante reste inchangée.

# Velocity V7.2.99 — Reset Trafic hors course

- La ligne Trafic utilise désormais la même détection d’activité que la Heat Map avant d’afficher les adversaires.
- En l’absence de course active, les cercles adverses, phases mémorisées et positions interpolées sont purgés immédiatement.
- Un ancien classement Apex ou un état conservé d’une session précédente ne peut plus afficher de cercle fantôme au chargement d’Analyzer.
- Le kart de l’équipe suivie reste seul au centre de la ligne tant qu’aucune course n’est active.

# Velocity V7.2.97 — Identité unique des cartes Spotter

- Correction de la validation d’un kart entrant quand son libellé KV est identique à celui d’une autre carte déjà présente dans une autre file.
- La validation, le déplacement et la maintenance ciblent désormais une instance de carte via `cardId`, et non le seul libellé `KVxx`.
- Un kart entrant validé en File 1 ne peut plus supprimer par erreur une carte de File 2 portant le même libellé KV.
- Migration automatique des anciennes cartes/assignations sans `cardId`.

# Velocity V7.2.97 — Synchronisation STANDS / Spotter

- STANDS Analyzer consomme désormais le même état partagé que le mode Spotter, issu de `/api/spotter-state`.
- Ajout d'un cache navigateur `velocitySharedSpotterState` alimenté à la fois par les modifications locales et par le polling serveur Spotter.
- Mise à jour immédiate des cartes STANDS lorsqu'un autre appareil modifie les files, les entrants ou la maintenance.
- `state.spotter` du flux général reste uniquement un fallback de sécurité.
- Aucun changement des règles Quick Change, du moteur Velocity ou des droits Team.

# Velocity V7.2.95 — Team Management harmonisé

- Tous les boutons du module Team Management reprennent désormais la DA sombre des boutons Analyzer.
- Les actions **SUPPRIMER** utilisent une variante danger sombre à bordure rouge, sans rectangle blanc.
- **CRÉER UNE TEAM** ouvre une modale Velocity dédiée au lieu du `prompt()` du navigateur.
- Suppression d’une Team, suppression d’un membre et fin de Session Course utilisent des confirmations Velocity, sans `confirm()` natif.
- La zone QR Code reste entièrement masquée tant que l’utilisateur ne clique pas sur **QR CODE**.
- Le logo VELOCITY des deux écrans d’onboarding est resserré : V rouge et ELOCITY blanc forment un seul mot, comme sur la Home.

## V7.2.95 — Onboarding Team et partage invitation
- Fenêtre « Associer un appareil » simplifiée : Partager / Copier le lien / QR Code, sans URL affichée.
- QR Code chargé de façon contrôlée avec message de secours en cas d’indisponibilité.
- Écran membre : logo Velocity de la Home, icône d’accueil, texte « Vous rejoignez … en tant que : ».
- Écran installation : titre « Installer Velocity » agrandi de 20 %.

# Velocity V7.2.95 — Onboarding appareil premium

- Refonte complète de la page d'association d'un appareil membre.
- Parcours en deux écrans : association du téléphone, puis installation de Velocity.
- Le bouton **ASSOCIER CET APPAREIL** est désormais l'action principale du premier écran.
- Après association, transition automatique vers les instructions d'installation.
- Texte validé : « Appuyez sur le bouton ⬆️ Partager situé à côté de la barre d'adresse. »
- Étapes dédiées « Ajouter à l'écran d'accueil » puis ouverture via l'icône Velocity.
- Si l'appareil a déjà réclamé cette invitation, l'écran d'installation est affiché directement.
- Aucun changement sur les droits Team, les rôles actifs ou le moteur de Session Course.

# Velocity V7.2.91 — Fin de session : révocation Team Manager

- Un rôle **Team Manager autorisé** dans la fiche d’un membre ne donne plus aucun accès permanent à Velocity.
- Seul un rôle **Team Manager actif** dans une Session Course ouvre l’application complète.
- À la fin de la session, tous les membres invités — Pilote, Spotter ou Team Manager — reviennent à l’écran « En attente d’affectation… ».
- Le propriétaire / navigateur TM non associé à un membre invité conserve son accès normal à Velocity.
- Aucun changement sur les rôles autorisés permanents : ils restent disponibles pour une future affectation.

# Velocity V7.2.91 — Stabilité affichage Spotter

- Le polling des droits Team continue toutes les 3 secondes mais ne relance plus le rendu lorsque l’état d’accès est inchangé.
- Spotter n’est plus démonté/réaffiché à chaque réponse de `/api/device/session`.
- Une coupure serveur transitoire ne remplace plus un écran Spotter/Pilote déjà autorisé par l’écran de verrouillage.
- Le reroutage n’a lieu que si le rôle, la session, l’appareil ou les autorisations changent réellement.
- Suppression des fichiers `__pycache__`/`.pyc` parasites de l’archive GitHub.

# Velocity V7.2.89 — Verrouillage strict des rôles Team

- Un appareil associé à un membre Team est désormais verrouillé par défaut pendant la vérification serveur.
- Un membre sans rôle Team Manager n’accède jamais à Home, Analyzer, Qualification, Sprint, Endurance ou Velocity Lab hors affectation.
- Sans session active : écran « En attente d’affectation ».
- Rôle Spotter actif : seul Spotter est affiché.
- Rôle Pilote actif : seul le Focus Pilote est affiché.
- Rôle Team Manager actif/autorisé : accès complet conservé.
- En cas d’échec réseau lors de la vérification des droits, l’accès reste fermé au lieu de retomber sur l’application complète.
- Un rôle renvoyé par la session est vérifié une seconde fois contre les rôles autorisés du membre.

# Velocity V7.2.89 — Team Management fiabilisé

- Correction de la page noire des invitations `/invite/...` : l’écran d’enrôlement est désormais hors de la page Analyzer et reste visible quand les écrans normaux sont masqués.
- Ajout de la suppression d’une Team et d’un membre, avec confirmation et nettoyage des appareils/invitations associés.
- Session Course : plusieurs membres peuvent être cochés pour un même rôle (Pilote, Spotter, Team Manager).
- « Associer un appareil » ouvre désormais une fenêtre Velocity avec Copier le lien / Partager / QR Code, sans lancer automatiquement Mail.
- Ajout d’un QR Code d’invitation servi directement par Velocity.

# Velocity V7.2.86 — Session de course multi-appareils (prototype)

- Nouveau gestionnaire SESSION COURSE dans le footer Analyzer.
- Création d’une session à partir du circuit actif et de l’équipe suivie.
- Circuit verrouillé côté serveur pendant la session.
- Liens temporaires distincts Spotter et Pilote, avec boutons Copier, Partager et QR Code généré localement.
- Accès Spotter ouvrant uniquement le mode Spotter ; accès Pilote ouvrant le Focus Endurance.
- Le TM peut terminer la session, ce qui invalide immédiatement les deux accès temporaires.

# Velocity V7.2.85 — Alignements finaux Analyzer

- Suppression de la mention « Colonnes Apex Timing enrichies par Velocity ».
- Alignement vertical des en-têtes et des lignes Classement LIVE / Velocity.
- Harmonisation de la taille des titres de colonnes Velocity avec le Classement LIVE.
- Déplacement de COMPTE RENDU dans l’en-tête de la carte ÉQUIPE SUIVIE, à droite.
- Déplacement de RÈGLEMENT dans l’en-tête de la carte CONFORMITÉ RÈGLEMENTAIRE, à droite.

- ÉQUIPE SUIVIE : « Position/Chrono » devient « Position du chrono ».
- HEAT MAP : bouton OK après simulation pour effacer le résultat et revenir à l’état normal.
- MÉTÉO : titre harmonisé avec les autres cartes.
- CONFORMITÉ RÉGLEMENTAIRE : bouton RÈGLEMENT ramené au gabarit des boutons de classement.
- Classement Analyzer : « CLASSEMENT GÉNÉRAL » devient « CLASSEMENT LIVE ».
- STANDS : flèche du bouton retour réduite et recentrée.
- Barre Analyzer : « DÉBRIEF » devient « COMPTE RENDU » avec un style de bouton classique.

# Velocity V7.2.83 — Trafic : dead zone ajustée au kart

- Dead zone de la ligne Trafic calée sur la largeur réelle du visuel du kart avec seulement 1 px de marge.
- À 0,00 s, le bord du cercle adverse est placé juste derrière/devant le pare-chocs sans chevauchement.
- Suppression du double trait vertical aux extrémités : seul le terminateur de l’axe reste visible.
- Les graduations continuent d’utiliser la projection symétrique -10 s / +10 s autour de la dead zone.

7.2.83 — TRAFIC : RESET AU CHANGEMENT DE CIRCUIT
- Purge complète de l'état Trafic au changement de piste : phases/interpolations, cercles persistants et DOM.
- Nouveau circuit = ligne Trafic vierge avant réception des nouvelles données Apex.
- Aucun changement du calcul des écarts ni de la dead zone V7.2.81.

# Velocity V7.2.81 — Dead zone centrale de la ligne TRAFIC

- Le kart suivi occupe désormais une zone centrale infranchissable par les cercles adverses.
- À 0,00 s derrière, le cercle touche le bord gauche du kart ; à 0,00 s devant, il touche le bord droit.
- Les écarts de -10 s à 0 s et de 0 s à +10 s sont reprojetés séparément de part et d'autre de la dead zone.
- La largeur de la dead zone s'adapte automatiquement à la largeur réelle du visuel du kart et à celle des cercles.
- Les graduations 2 / 4 / 6 / 8 / 10 suivent la même nouvelle projection.
- Le calcul physique des écarts et les infobulles restent inchangés.

# Velocity V7.2.80 — Annulation Quick Change & bouton Analyzer

- Ajout d’un bouton **ANNULER** dès le choix du nombre de files et dans l’écran d’initialisation des karts.
- Annuler restaure la configuration précédente sans sauvegarde ni synchronisation d’un brouillon.
- Depuis Analyzer / STANDS, **PRÉPARER LA ZONE QUICK CHANGE** ouvre désormais le même workflow Spotter et revient dans Analyzer après validation ou annulation.
- L’icône Quick Change / paramètres de Spotter utilise le même comportement.

# Velocity V7.2.79 — STANDS / Spotter unifiés

- Une seule détection IN commune à Heat Map et Spotter : statut Apex, colonne `sta/si` et impulsion MAP `*in`.
- La colonne Apex `sta` est désormais interprétée : `si` = IN, `sf` = damier/terminé.
- Les non-partants marqués `si` sont filtrés de la Pit Lane tant qu’ils n’ont aucune donnée sportive.
- Configuration Quick Change réellement partagée entre Analyzer et Spotter sur tous les appareils.
- Si le TM configure les files depuis Analyzer, Spotter s’ouvre directement sur ces files, y compris au premier accès smartphone.
- Si Spotter configure ou modifie les files, STANDS Analyzer reprend automatiquement le même état.
- Le nombre de files et les karts de configuration sont inclus dans le snapshot partagé.
- Sélectionner le même circuit depuis un second appareil ne réinitialise plus le Quick Change déjà préparé.
- Un vrai changement de circuit réinitialise l’état STANDS/Spotter pour éviter toute contamination entre pistes.

# Velocity V7.2.78 — Spotter : filtrage des sessions terminées

## V7.2.78 — IN Apex vs entrée opérationnelle Spotter

- Heat Map inchangée : tous les karts signalés `IN` par Apex restent visibles dans la Pit Lane, y compris sur une session terminée.
- Spotter distingue désormais un état `IN` historique d'une entrée aux stands à traiter.
- Au démarrage de Spotter, les karts déjà `IN` ne sont injectés dans **Karts entrants** que si la session est encore active.
- Pendant une session active, toute transition piste → `IN` continue d'alimenter automatiquement **Karts entrants**.
- Une session terminée avec toute la grille laissée `IN` par Apex ne remplit plus artificiellement le workflow Quick Change.
- Détection d'activité compatible avec courses au temps et au nombre de tours, avec repli sur la présence de karts réellement en piste.

## V7.2.77 — Raccordement live Spotter / Apex

- Correction du flux live Spotter : le module lisait `window.state`, alors que l’état de course est déclaré en `let state` et n’est pas une propriété de `window`.
- Spotter lit désormais directement la même source de vérité que Heat Map via `spotterLiveState()`.
- Ajout d’un pont `window.velocityState` défensif pour les modules qui nécessitent l’état live.
- Lors de la validation de la configuration Spotter, les karts déjà présents dans la Pit Lane Apex sont injectés immédiatement dans **Karts entrants**.
- La détection `status = pit` + impulsion MAP `*in` reste commune à Heat Map et Spotter.


- Spotter utilise désormais la même détection de pit que la Heat Map : statut `pit` ou événement Apex brut `*in`.
- Un kart détecté aux stands est automatiquement ajouté à **Karts entrants**, dans l'ordre d'arrivée.
- Les karts déjà aux stands lors de l'ouverture/amorçage du Spotter sont également récupérés.
- En mode Auto, l'entrée est détectée automatiquement mais **n'est plus validée automatiquement** dans une file : le Spotter humain choisit File 1/2/3 ou Maintenance.
- Protection existante contre les doublons conservée.

# Velocity V7.2.75 — Animations live des classements généraux

- Qualification, Sprint, Endurance et Analyzer : animation de toute la ligne à chaque nouveau passage sur la ligne de chronométrage.
- Violet : meilleur temps absolu de la session.
- Vert : amélioration du meilleur temps personnel.
- Orange : tour non amélioré.
- Déplacement FLIP de la ligne vers le haut ou le bas lorsqu'une position est gagnée ou perdue.
- Animation basée sur une identité stable de l'équipe/pilote afin de ne pas se déclencher sur un simple rafraîchissement Apex.
- Aucun changement des calculs de classement, des chronos ou du moteur Velocity.

# V7.2.75 — Débrief des anciennes sessions Apex

- STATS > ANCIENNES SESSIONS : sélection d’une session historique Apex puis génération d’un Débrief complet.
- Le moteur de Débrief existant est réutilisé avec tous les tours et pits de toutes les équipes de la session sélectionnée.
- L’équipe choisie dans la session est analysée et comparée à l’intégralité du plateau historique.
- Export PDF du Débrief historique avec le nom de la session.

# V7.2.75 — Velocity complet, tri Delta et Mode Test suivi

- Classement Velocity : toutes les équipes évaluables sont désormais disponibles ; 10 lignes restent visibles et le reste est accessible par scroll vertical.
- Nouveau tri « Delta » : les meilleurs gains corrigés (valeurs les plus négatives) remontent en tête, sans modifier la colonne TOP qui reste le rang officiel par Score.
- Velocity Lab : toutes les équipes évaluables sont disponibles, avec défilement vertical et sélection de 2 à 5 karts parmi l’ensemble du plateau.
- Mode Test Endurance : l’équipe suivie peut être changée librement et reste sélectionnée pendant les rafraîchissements synthétiques ; aucun appel serveur réel n’est envoyé lors du suivi en Mode Test.
- Infobulles Velocity : suppression du curseur d’aide « ? » ; les infobulles restent accessibles directement au survol avec le design unifié.

# V7.2.71 — Fiabilisation du Δ Velocity

- Isolation complète de l’apprentissage du Mode Test Endurance : un test ne peut plus réutiliser les relais mémorisés d’une session réelle ou d’un test précédent.
- Clés d’apprentissage désormais scindées par circuit afin d’éviter les comparaisons de relais entre circuits différents partageant les mêmes identifiants Apex.
- Le Δ n’utilise un relais précédent que s’il contient au moins 3 tours exploitables.
- Convention conservée : Δ négatif = gain/plus rapide (vert), Δ positif = perte/plus lent (rouge), affichage au dixième.
- Aucun changement des pondérations du Velocity Engine V1.0.

## V7.2.70 — Δ course et continuité pilote Apex

- Convention du Δ corrigée : négatif = plus rapide (vert), positif = plus lent (rouge).
- Δ affiché au dixième de seconde (`-0,4`, `+0,5`).
- Le calcul Transition conserve le même classement mais utilise désormais explicitement la convention temps : delta relais - delta plateau.
- Détection d’une colonne PILOTE séparée lorsque la grille Apex la fournit.
- Mémorisation du pilote et du kart par relais.
- Colonne PIL. dans Velocity uniquement lorsqu’au moins un pilote Apex est disponible : 👤 pilote identique, 👥 changement pilote.
- Infobulles instantanées sur les emojis.
- Velocity Lab détaille pilotes/karts précédent et actuel, comparabilité et Δ brut / plateau / corrigé.

## V7.2.69 — Velocity Lab : comparatif figé au clic

- Le tableau détaillé n'est plus reconstruit par le rafraîchissement live toutes les ~800 ms.
- La comparaison devient un snapshot figé au moment du clic sur **COMPARER**, afin de préserver totalement le scroll et la lecture.
- Le classement Velocity situé au-dessus continue de se mettre à jour en live.
- Toute nouvelle sélection puis nouveau clic sur **COMPARER** génère un snapshot actualisé.
- Aucun changement du Velocity Engine V1.0 ni des pondérations officielles.

## V7.2.69 — Velocity Lab : scroll comparatif stabilisé

- Conservation de la position verticale et horizontale du tableau comparatif pendant les rafraîchissements live.
- Le tableau ne revient plus en haut lorsqu’on descend dans les facteurs et valeurs brutes.
- Aucun changement du Velocity Engine V1.0 ni des pondérations.

## V7.2.69 — Velocity Lab : comparaison compacte et lisible

- Colonnes du tableau comparatif fortement resserrées pour rapprocher les karts.
- Largeur fixe compacte des colonnes et réduction des paddings horizontaux.
- Taille des textes du comparatif fortement augmentée (environ ×3 selon les lignes).
- Valeurs brutes agrandies et noms d'équipe autorisés à revenir à la ligne dans l'en-tête.
- Aucun changement de l'algorithme Velocity Engine V1.0 ni des pondérations officielles.

## V7.2.69 — Velocity Lab

- Ajout de **Velocity Lab** dans le footer de l’Analyzer.
- Page plein écran fermable à tout moment avec la croix en haut à droite.
- Reprise du classement Velocity avec sélection de **2 à 5 karts**.
- Comparaison détaillée du score officiel du relais en cours.
- Décomposition des cinq facteurs : Rythme, Transition, Potentiel, Régularité et Échantillon.
- Affichage des notes /100, pondérations, contributions en points et valeurs brutes.
- Détail de la confiance et des populations de référence.
- Velocity Lab est strictement en lecture seule : aucune pondération ni aucun score de course n’est modifié.
- Version du moteur affichée : **Velocity Engine V1.0**.

## V7.2.65 — Ligne Trafic complète autour du pilote suivi

- Renommage de « TRAFIC DEVANT » en « TRAFIC ».
- Visuel de kart de profil fourni, utilisé uniquement pour le pilote suivi au centre.
- Karts situés de -10 s derrière à +10 s devant, sans filtre de tours ou de classement.
- Cercles colorés avec numéro conservés pour tous les autres karts.
- Graduations 2, 4, 6, 8 et 10 sous la ligne, de chaque côté.
- Suppression du libellé « PILOTE » pour utiliser toute la largeur disponible.
- Déplacement continu des mêmes cercles afin d’éviter les disparitions intempestives.

## V7.2.63 — Nettoyage et sécurisation du stockage local Analyzer

- Suppression automatique des anciennes sessions Analyzer lourdes.
- Les sessions ne dupliquent plus l’historique complet des relais.
- Apprentissage compacté et limité.
- Écriture localStorage protégée contre les dépassements de quota.
- La sélection d’un circuit ne peut plus être bloquée par une erreur de stockage.

## V7.2.62 — Trafic devant continu et indépendant des tours

- Conservation des cercles de trafic dans le DOM pour éviter les disparitions à chaque rafraîchissement.
- Déplacement fluide et immédiat selon l'écart estimé.
- Suppression des filtres de classement et de nombre de tours.
- Estimation de la position physique entre deux passages de ligne.
- Tolérance à 10,5 s pour éviter le clignotement à la limite des 10 secondes.

## V7.2.60 — Correctif sélection des circuits
- Verrouille le sélecteur pendant le changement de circuit.
- Ignore les anciens états serveur encore en transit.
- Empêche le retour automatique vers le circuit précédent.

## V7.2.59 — Radar et trafic devant
- Palette des cercles harmonisée entre Radar classique et plein écran.
- Ajout de la ligne Trafic devant sur 10 secondes avec numéro de kart et couleur de rythme.

## V7.2.59 — Verrouillage paysage Android uniquement

- Suppression complète du fallback de rotation CSS sur iPhone/iPad.
- Les modes Focus suivent de nouveau l’orientation native d’iOS.
- Verrouillage paysage natif activé uniquement sur Android via Screen Orientation API.
- Déverrouillage automatique à la fermeture des modes Focus Qualification, Sprint et Endurance.

## V7.2.57 — Verrouillage paysage des modes Focus sur iPhone

- Le layout paysage reste figé dans les modes Focus Qualification, Sprint et Endurance.
- Ajout d'un verrouillage visuel de secours lorsque Safari refuse l'API d'orientation.
- Les changements d'inclinaison du téléphone n'activent plus la mise en page portrait du Focus.
- Le comportement responsive normal est restauré à la fermeture du mode Focus.

## V7.2.57 — Mise à jour des circuits Apex Timing

- Suppression de RKC - Karting Paris et La Briqueterie Les Étards (entrées génériques).
- Ajout de RKC - Karting Paris 1200 m et 900 m.
- Ajout de La Briqueterie Les Étards 720 m et 600 m.
- Ajout de Goodwill Karting (Belgique), Solokart (France) et KartCenter Campillos (Espagne).
- Mise à jour des ports WebSocket, URLs live, pays et coordonnées météo.

## V7.2.57 — Mode Test Endurance : validation réseau

- Coupures automatiques basées sur le temps simulé.
- Fréquence et durée réglables.
- Bouton pour forcer une coupure immédiatement.
- État réseau et compteurs visibles en direct.
- Rapport JSON enrichi : coupures, réussites, échecs et durées d’indisponibilité.

## V7.2.57 — Mode Test Endurance dans Analyzer

- Ajout du simulateur longue durée isolé, métriques en direct et export du rapport JSON.
- Suspension du flux réel pendant le test et restauration automatique à l’arrêt.

## V7.2.57 — Nouveau traitement graphique du titre Velocity dans Analyzer

- Suppression du traitement spécial de l’ancien en-tête Velocity.
- Titre VELOCITY aligné graphiquement sur HEAT MAP, STANDS et CLASSEMENT GÉNÉRAL.
- Fonction de tri conservée à droite du titre.

## V7.2.52 — Nouvelle session Spotter vierge à chaque version

- Ignore le cache local Spotter d’une version précédente.
- Ignore les états distants Spotter provenant d’une ancienne version.
- Une nouvelle version démarre vide, puis se synchronise uniquement avec les appareils ouverts sur cette même version.


## V7.2.51 — Synchronisation Spotter smartphone / desktop
- Aligne la version de protocole Spotter sur la version réelle de l’application afin que les configurations créées sur smartphone soient acceptées par le serveur.
- Le Spotter desktop et la carte STANDS de l’Analyzer récupèrent désormais le nouvel état partagé au lieu de conserver l’ancien état.
- En cas de client obsolète, l’application recharge l’état serveur au lieu d’échouer silencieusement.
- Le bouton Retour de STANDS adopte la même hauteur que les autres boutons de la ligne d’actions.
## V7.2.49

- Correction de l’affichage des trois files Spotter dans la carte FILES de l’Analyzer.
- Le nombre de files utilise désormais `queue_mode`, avec détection de secours depuis `queueFile`.

## V7.2.47
- Correction du conflit de synchronisation Spotter entre appareils.
- Suppression des envois automatiques d’états locaux obsolètes.
- Conservation de la configuration lors des mises à jour.
- Rejet serveur des clients Spotter d’une ancienne version.

## V7.2.44
- Ajout d’un espacement supplémentaire entre le titre MESSAGE et les triangles rouges pour éviter tout chevauchement.

## V7.2.42
- Bandeau MESSAGE avec flèches rouges ► animées sur toute la largeur.
- Entrée du message depuis la gauche et sortie vers la droite après 15 secondes.

## V7.2.40 — Messages pilote sur 2 ou 3 lignes équilibrées

- Répartition automatique du message sur deux lignes pour les messages standards.
- Passage automatique sur trois lignes pour les messages longs.
- Conservation de la police F1 Torque et agrandissement maximal du texte.
- Affichage centré et équilibré pour une lecture immédiate en piste.

## V7.2.38 — Police F1 Torque pour la Messagerie Pilote

- Le message délivré au pilote utilise désormais la police F1 Torque.
- Le texte est automatiquement converti en capitales pour une lecture immédiate.
- La taille s'adapte à la longueur du message afin de rester lisible en plein écran.
- Le bandeau MESSAGE, la temporisation de 15 secondes et les règles urgent/non urgent sont conservés.

## V7.2.37 — Habillage du message pilote

- Ajout du bandeau « MESSAGE » inspiré du mode Focus Endurance.
- Ajout d’un filet orange sur toute la largeur disponible.
- Conservation de l’affichage plein écran, de la grande police et de la disparition après 15 secondes.

## V7.2.36 — Correctif Messagerie Pilote en mode Focus

- Message affiché en plein écran sur fond noir avec une très grande police en Qualification, Sprint et Endurance.
- Overlay partagé par les trois modes Focus et placé au-dessus de toute l’interface.
- Disparition automatique maintenue après 15 secondes.
- Message urgent délivré immédiatement.
- Message non urgent délivré au prochain passage du pilote suivi sur la ligne de chronométrage.

## V7.2.34 — Affichage version Home

- Correction de la version affichée sur la page d’accueil : Velocity v7.2.34.
- Alignement du cache et du module Spotter sur la version 7.2.34.

## V7.2.34 — Correctif blocage Home
- Correction de la référence JavaScript résiduelle vers la carte supprimée `analyzerForecast`.
- La sélection des circuits sur la Home n’est plus interrompue par l’Analyzer.
- Les cartes Spotter restent absentes de la page Analyzer.

# Velocity 7.2.33 — Retrait des cartes Spotter de l’Analyzer

- Suppression des cartes Analyzer « Files de karts », « Karts entrants » et « Maintenance ».
- Suppression du rendu JavaScript associé à ces trois cartes.
- Aucun changement apporté au mode Spotter lui-même.
- Version de cache/service worker mise à jour pour forcer le chargement des nouveaux fichiers.

# Velocity 7.2.32 — Nettoyage Analyzer et affichage Spotter

- Suppression de la carte « VAGUE DE QUICK CHANGE » de la page Analyzer.
- Suppression de la carte « OPPORTUNITÉS DE QUICK CHANGE » de la page Analyzer.
- Conservation de la carte singulière « OPPORTUNITÉ DE QUICK CHANGE ».
- Correction de l’intégration des cartes Spotter dans le template réellement utilisé par Flask.
- Affichage dans Analyzer de « FILES DE KARTS », « KARTS ENTRANTS » et « MAINTENANCE ».

# Velocity 7.2.31 — Suppression carte Quick Change

- Suppression de la carte « QUICK CHANGE — FILES DE KARTS » de la page Analyzer.
- Les nouvelles cartes synchronisées avec le mode Spotter restent inchangées.

# Velocity 7.2.30 — Correctif sélection circuit

- Restauration du bloc Analyzer supprimé accidentellement en 7.2.29.
- Correction de l’erreur JavaScript globale qui bloquait la sélection des circuits sur la Home.
- Conservation des nouvelles cartes Spotter : files, karts entrants et maintenance.
- Aucun fichier supplémentaire ajouté à l’archive.

# Changelog

## V7.2.29 — Cartes Spotter dans Analyzer

- Suppression de la carte Vague de Quick Change.
- Suppression de l’ancienne carte Spotter — File FIFO.
- Ajout de la vraie carte des files issue du mode Spotter.
- Ajout de la carte Karts entrants sous les files.
- Ajout de la carte Maintenance sous les karts entrants.
- Ajout des commandes ↶, Préparer la zone Quick Change, Auto/Reprendre, Modifier la file et Réinitialiser.
- Synchronisation avec le même état que Spotter Desktop et smartphone.
- La carte Opportunité de Quick Change est conservée et utilise désormais les vraies files Spotter pour évaluer les karts disponibles.

## V7.2.28 — Verrouillage du scroll mobile

- Le défilement de la page reste autorisé avant la validation de l’appui long.
- Dès que la carte est saisie, la position verticale de la page est mémorisée et verrouillée.
- Les gestes tactiles déplacent uniquement le kart pendant le drag actif.
- Le scroll et l’overscroll du navigateur sont bloqués jusqu’au relâchement.
- La position initiale de la page est restaurée proprement après le dépôt ou l’annulation.
- Le comportement Desktop reste inchangé.

## V7.2.27 — Aperçu drag corrigé

- Suppression du clone complet de la carte qui pouvait hériter du layout Spotter et s’étendre sur toute la largeur.
- Création d’un aperçu flottant isolé, sans les classes responsables de la mise en page.
- Largeur et hauteur verrouillées avec priorité CSS sur les dimensions exactes de la carte source.
- Positionnement par coordonnées fixes plutôt que par une transformation de translation héritée.
- L’aperçu est retiré systématiquement au relâchement ou à l’annulation du déplacement.
- Le fonctionnement Desktop et smartphone conserve le halo vert et le suivi du pointeur.

## V7.2.26 — Appui long mobile stable

- La carte ne grossit plus brièvement dès le premier contact.
- Après 450 ms, le halo vert et le léger agrandissement apparaissent et restent actifs jusqu’au relâchement.
- La carte source ne rétrécit plus lorsque le clone flottant est créé.
- Les synchronisations Desktop/serveur ne reconstruisent plus l’écran pendant un appui long ou un déplacement.
- Le clone reste visible et stable tant que le doigt demeure posé.
- Le fonctionnement Desktop reste inchangé.

## V7.2.25 — Clone mobile uniforme

- Le clone flottant reprend exactement la largeur et la hauteur mesurées sur la carte sélectionnée.
- Les dimensions minimale, maximale et le ratio sont verrouillés afin d’éviter tout redimensionnement responsive.
- Le clone ne dépend plus du contenu ou du type de carte.
- L’agrandissement mobile est uniformisé à 2 % pour toutes les cartes.
- Le comportement Desktop reste inchangé.

## V7.2.24 — Calibrage du déplacement mobile

- Le kart déplacé est affiché légèrement au-dessus du doigt sur smartphone afin de garder la destination visible.
- La détection des files ne dépend plus uniquement de l’élément situé exactement sous le doigt.
- Les colonnes disposent d’une zone d’accroche horizontale et verticale plus tolérante sur mobile.
- Lorsqu’une file ne contient qu’un seul kart, la moitié basse du kart et toute la zone située dessous sélectionnent immédiatement la fin de file.
- La zone libre sous le dernier kart est prolongée pour faciliter un dépôt en dernière position.
- Le fonctionnement Desktop reste inchangé.

## V7.2.23 — Drag & drop fluide Spotter

- Toute la carte de kart devient la zone de prise ; suppression de la petite poignée.
- Appui long de 450 ms avant activation afin de préserver le défilement tactile.
- Halo vert, léger agrandissement et vibration confirment que la carte est saisie.
- La carte mobile reste centrée sous le doigt ou la souris et suit le mouvement sans inertie.
- Les autres cartes s’écartent grâce à un emplacement dynamique de la même taille que la carte.
- Les colonnes s’illuminent lorsqu’elles deviennent la destination active.
- La zone Maintenance s’illumine en rouge lorsqu’elle peut recevoir le kart.
- Le bouton d’annulation ↶ reste disponible pour restaurer la dernière manipulation.

## V7.2.22 — Recaler la file Desktop

- Après Auto puis Reprendre, le panneau Recaler la file n’occupe plus toute la largeur sur Desktop.
- Le bloc de recalage reprend exactement la largeur de la carte des files du Spotter.
- Les Karts entrants et la Maintenance restent dans la colonne droite, comme dans la vue Spotter normale.
- La transition entre la vue normale et la vue de recalage conserve la même structure et le même centrage.

## V7.2.21 — Auto et Reprendre Spotter

- Sur Desktop, le bouton Auto devient un bouton orange « ▶ REPRENDRE » lorsque le mode Auto est actif.
- Le bouton Desktop reprend le même état visuel que sur smartphone.
- Sur smartphone, le libellé « ▶ REPRENDRE » est affiché entièrement sans être tronqué.

## V7.2.20 — Centrage Desktop Spotter

- La carte des files est réduite à la largeur exacte des trois files, sans modifier la taille des cartes de kart.
- L’ensemble Files + Karts entrants + Maintenance est centré dans la page Desktop.
- La barre Live | ↩ | Préparer la zone Quick Change | Auto | Modifier la file | Réinitialiser est centrée.
- La carte Maintenance reste systématiquement sous la carte Karts entrants.
- Le numéro de l’équipe est affiché au-dessus du nom de l’équipe dans les cartes de kart entrant, sur Desktop et smartphone.

## V7.2.19 — Correction Desktop Spotter

- Le titre Spotter retrouve exactement le style orange, le corps et la hauteur du libellé Endurance dans Analyzer.
- Suppression de la barre mobile dupliquée « Live | ↩ | Auto | ⚙ | Quick Change » en version Desktop.
- Conservation d’une seule barre de commandes Desktop.
- Suppression des anciens boutons Modifier la file et Réinitialiser placés en bas de la page Desktop.
- Fond supérieur conservé en noir comme dans Analyzer.

## V7.2.18 — Commandes Desktop Spotter

- Flèche d’annulation Desktop remplacée par une flèche de retour horizontale.
- Nouvelle barre : Live | ↩ | Préparer la zone Quick Change | Auto | Modifier la file | Réinitialiser.
- « Paramètres » devient « Préparer la zone Quick Change ».
- Ajout du bouton Modifier la file avec conservation des karts et adaptation à 1, 2 ou 3 files.
- Ajout du bouton Réinitialiser avec confirmation.
- Suppression du fond coloré en haut du Spotter Desktop au profit du fond noir de l’Analyzer.
- Le titre Spotter reprend exactement la typographie, le corps et la hauteur du titre Endurance de l’Analyzer.

## V7.2.17 — En-tête et cartes Desktop Spotter

- L’en-tête Desktop commence désormais par « Spotter », puis le filet orange.
- L’en-tête reprend la hauteur, le corps, la graisse, l’espacement et la couleur de « Endurance » dans Analyzer.
- La ligne Live | ↶ | Auto | Paramètres est déplacée sous le filet orange.
- Les commandes Desktop deviennent des boutons horizontaux et homogènes.
- Les cartes des files sont agrandies de 25 % sur Desktop.
- Le kart et les textes sont recentrés dans chaque carte.
- L’ensemble des files est centré dans la carte principale.

## V7.2.16 — Mise en page Desktop Spotter

- Les cartes de kart conservent exactement la même taille en mode 1, 2 ou 3 files.
- Le texte reste contenu et centré dans la partie droite de chaque carte, y compris avec 3 files.
- Nouveau titre Desktop « Spotter » à la même hauteur que le titre « Endurance » de l’Analyzer.
- Suppression de l’ancien filet Spotter et ajout du filet orange sous le nouveau titre.
- Les files sont rapprochées et occupent désormais environ 60 % de la largeur.
- La colonne Karts entrants et Maintenance est agrandie à environ 40 % de la largeur.

## V7.2.15 — Desktop Spotter, annulation et synchronisation

- Desktop Spotter sur toute la largeur avec une répartition 75 % pour les files et 25 % pour le panneau latéral.
- Cartes des files réduites de 25 % sur ordinateur et alignées à gauche.
- Karts entrants empilés dans la colonne droite, puis Maintenance juste en dessous.
- Suppression du bouton Menu interne au Spotter sur ordinateur pour éviter le doublon avec le menu général.
- Remplacement de « Sortie » par un grand bouton ↶ qui annule uniquement la dernière action après confirmation.
- L’annulation restaure également un déplacement en tête de file, un changement de file, une validation ou une mise en maintenance.
- Synchronisation serveur bidirectionnelle : les actions du mode développeur, du mobile et du Desktop sont répercutées entre les écrans.
- Préparation du même état partagé pour l’intégration future dans Analyzer.

## V7.2.14 — Maintenance et déplacement Spotter

- Bouton Maintenance rouge, réduit et remplacé par une icône d’avertissement.
- Halo vert autour de la carte saisie et de la carte mobile pendant le déplacement.
- La carte mobile suit directement le doigt ou la souris.
- Les karts en maintenance utilisent la même carte pleine largeur que les karts entrants.
- Sélection exclusive de la file avant remise en circulation.
- Confirmation obligatoire avant de remettre un kart en maintenance dans la file choisie.

## V7.2.13 — UX Spotter et validation par file

- Appui long de 500 ms sur la poignée avant d’autoriser le déplacement d’une carte.
- Le glissement avant l’appui long conserve le défilement normal de la page.
- Suppression de la case visuelle « Fin de file » ; la zone d’insertion reste visible sous la dernière carte.
- Nouvelle carte de kart entrant sur toute la largeur : informations sur 1/3, commandes sur 2/3.
- Sélection exclusive de la file avec de grands boutons circulaires 1, 2 et 3.
- Bouton Valider vert et principal ; bouton Maintenance plus petit sur la même ligne.
- Le kart validé est ajouté en dernière position de la file sélectionnée.

## V7.2.12 — Déplacement précis des cartes Spotter

- Suppression du préfixe « Kart » dans les noms affichés.
- Poignée intégrée au bord droit de la carte, sans fond.
- La carte déplacée suit exactement le doigt ou la souris, sans saut au démarrage.
- Zone d’insertion lumineuse entre deux cartes et après la dernière carte.

## V7.2.11 — Poignées et lisibilité Spotter

- Le déplacement d’un kart démarre uniquement depuis une poignée dédiée.
- Le glissement vertical sur le reste de la carte fait défiler la page sans déplacer le kart.
- Textes Score et Conf. agrandis de 50 %.
- Nom d’équipe agrandi de 50 %, limité à deux lignes puis tronqué.
- Identifiant KV masqué sur smartphone.
- Temps restant agrandi de 25 %.

## V7.2.10 — Files multiples Spotter

- Activation des modes 1, 2 et 3 files.
- Chaque file reste verticale, avec les karts les uns sous les autres.
- En mode 3 files : File 1 | File 2 | File 3 sur toute la largeur.
- Recentrage des textes dans la moitié droite de chaque carte, entre le kart et le bord.
- Conservation des cartes carrées et du demi-kart latéral fourni.


## V7.2.9 — File verticale Spotter

- Affichage de la file de karts en colonne verticale.
- Les karts d’une même file sont désormais placés les uns sous les autres.
- Conservation des cartes carrées avec le demi-kart à gauche et les informations à droite.
- Dimensionnement prévu pour accueillir jusqu’à trois files côte à côte.
- Mise à jour de la version, du cache et du service worker.

# Velocity V7.2.8 — Cartes Spotter carrées

- Cartes carrées conservant trois karts par rangée sur la largeur du Spotter.
- Demi-kart placé à gauche sur toute la hauteur de chaque carte.
- Informations regroupées et redimensionnées dans la moitié droite.
- Remplacement de l’ancien visuel du kart par le fichier fourni.
- Mise à jour de la version, du cache et du service worker.

# Velocity V7.2.7 — Demi-kart latéral du Spotter

- Remplace le kart placé en bas par une moitié de kart verticale sur le côté gauche de chaque carte.
- Réserve la partie droite aux informations afin d'améliorer la lisibilité.
- Transforme les cartes carrées en cartes horizontales plus adaptées au mode Spotter.
- Conserve les couleurs et les actions des états disponible, réservé, entrant et maintenance.
- Met à jour la version affichée sur la page d'accueil et le cache de l'application.

# Velocity V7.2.5 — Cartes-karts du Spotter

- Remplacement visuel des carrés du Spotter par des cartes sombres intégrant l’avant d’un kart en partie basse.
- Conservation des états fonctionnels avec contours dynamiques : vert disponible, rouge réservé/entrant, orange maintenance.
- Réorganisation des informations au-dessus du pare-chocs pour améliorer l’identification immédiate des karts.
- Visuel optimisé sur fond transparent pour les écrans mobiles.

# Velocity V7.2.4 — Couleurs dynamiques des deltas

- Rétablit les couleurs vert / orange des deltas dans Analyzer.
- Utilise la même logique dans les Focus Sprint et Endurance.
- Ajoute un suivi tour par tour robuste fondé sur le numéro de tour et le dernier chrono.
- Ajoute la tendance du delta dans le Focus Qualifications.
- Vert : évolution favorable ; orange : évolution défavorable ; blanc : neutre ou première mesure.
- Conserve une tolérance de 0,03 s pour éviter les changements de couleur parasites.

# Velocity V7.2.3 — Détection dyn1 des courses au nombre de tours

- Décode les trames Apex `dyn1|text|Giro X/Y`.
- Prend aussi en charge `Giri`, `Tour`, `Tours`, `Lap` et `Laps`.
- Utilise directement le tour courant et le total fournis par Apex.
- Supprime tout ancien compte à rebours lorsqu'une progression en tours est reçue.
- Met à jour l'affichage `X/Y tours` dans Sprint, Qualifications, Endurance, Focus et Analyzer.
- Conserve le moteur de course, la Heat Map et le classement général inchangés.

# Velocity V7.2.2 — Courses au nombre de tours

- détection d'une cible de tours Apex explicite ;
- affichage prioritaire sous la forme `7/8 tours` ;
- suppression de l'ancien temps restant lorsqu'une course est définie en tours ;
- correction appliquée aux écrans Sprint, Qualifications, Endurance, Focus et Analyzer.

# Velocity V7.2.1 — AUTO gris et messagerie agrandie

- Bouton AUTO gris, aligné sur le traitement du bouton Classement virtuel.
- Champ de messagerie pilote plus haut et texte agrandi.

# Velocity V7.2.1 — Connexion Velocity ↔ Spotter

- Synchronisation serveur de la file FIFO entre Spotter et Analyzer.
- Score et confiance affichés dans Spotter depuis le moteur Velocity existant, sans nouvel algorithme.
- Dernière équipe utilisatrice et identifiant KV partagés.
- Analyzer affiche l’ordre, la disponibilité, les attributions et la maintenance en temps réel.

# Velocity V7.1.10 — Configuration Spotter et messagerie pilote

- À la première ouverture du Spotter après chaque nouvelle version, le menu de configuration est affiché avant le lancement de la session.
- Le bouton AUTO reçoit un traitement visuel de bouton pour indiquer clairement qu'il est cliquable.
- Le titre MESSAGERIE PILOTE reprend exactement la taille et l'alignement de CONFORMITÉ RÈGLEMENTAIRE.
- L'emoji et le titre sont centrés sur la même ligne.
- Le champ de 25 caractères utilise toute la largeur disponible à côté du bouton ENVOYER.
- URGENT adopte la même taille visuelle que ENVOYER.

# Velocity V7.1.9 — Mode Auto et messagerie pilote

- Le mode FREE du Spotter devient le mode AUTO dans toute l’interface.
- Le suivi estimé et le recalage FIFO conservent leur fonctionnement.
- La carte Messagerie pilote de l’Analyzer est réorganisée sur deux lignes.
- Le titre MESSAGERIE PILOTE reprend la taille, la couleur et la police de CONFORMITÉ RÈGLEMENTAIRE.
- Le champ de 25 caractères est compacté avec compteur intégré pour libérer de la place aux commandes ENVOYER et URGENT.