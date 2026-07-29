# KartIQ V4.5.5

- Affiche le suffixe ordinal « er/ème » en exposant et dans une graisse plus fine dans le Focus Sprint.
- Ajuste la taille de la mention de classement pour garantir son maintien intégral dans la case.
- Supprime le titre « PÉNALITÉS » et le filet rouge du bloc de pénalités du Focus Sprint.
- Conserve un affichage sur une seule colonne, trié de la pénalité la plus récente à la plus ancienne.
- Conserve l’heure en petit et le défilement vertical tactile lorsque la liste dépasse la hauteur disponible.

# KartIQ V4.5.4

- Affichage du meilleur dernier tour du Focus Sprint sur une seule ligne : pilote et chrono.
- Suppression du séparateur « : » entre le pilote et son chrono.
- Largeur de la mention de classement portée à 100 % dans la colonne du pilote suivi.
- Taille adaptative avec `clamp()` pour éviter la coupure de « 2ÈME TEMPS », « 10ÈME TEMPS », etc.

# KartIQ V4.5.3

- Supprime le bandeau supérieur sur les pages Qualification et Sprint.
- Ajoute un bouton Home dans la carte du pilote suivi, sans modifier la structure de la ligne 1.
- Conserve la carte Focus et fait de la carte Delta la zone la plus large.
- Remplace « Écart avec » par « vs ».
- Ne modifie ni l’Endurance ni les modes Focus.

## V4.4.4 — Classement du dernier tour en Focus Sprint

- Ajout du classement du dernier chrono du pilote suivi par rapport à la grille.
- Mise à jour automatique de l’indication (« 1er temps », « 7ème temps », etc.) à chaque tour.
- Gestion des égalités de chronos au même rang.
- Ajout, au-dessus des pénalités, du pilote le plus rapide sur le dernier tour et de son chrono.
- Conservation du panneau des pénalités avec défilement.

## V4.4.3 — Meilleur temps violet Qualification

- Le bloc « Meilleur temps » du Focus Qualification lit désormais la cellule violette du classement.
- Affichage du nom du pilote associé et de son chrono en violet.
- Conservation d'un fallback numérique uniquement si le tableau n'est pas encore rendu.

## V4.4.2 — Correction du meilleur temps Qualification

- Dans le Mode Focus Qualification, la zone inférieure droite affiche désormais uniquement le **meilleur temps absolu de la séance en cours**, directement sous le titre « Meilleur temps ».
- Suppression du nom du pilote dans ce bloc afin de respecter la présentation demandée.
- Conservation d’un calcul de repli depuis le classement si `session_best` n’est pas fourni par Apex.

## V4.4.1 — Focus Sprint et Qualifications

- Mode Focus Sprint : filet supérieur bleu porté à 8 px.
- Mode Focus Qualifications : nouvel en-tête « Qualifications » avec filet supérieur rouge de 8 px.
- Mode Focus Qualifications : la zone inférieure droite affiche désormais « Meilleur temps », le nom du pilote détenteur du meilleur chrono absolu et son temps.

## V4.4.0 — Mode Focus Sprint et pénalités horodatées

- Ajout d’un bouton **Focus** sur la page Sprint, à gauche du delta.
- Nouveau plein écran Sprint sans navigation, avec fermeture par la croix **×**.
- Affichage de la position et du nom du pilote suivi.
- Affichage vertical du delta avec le pilote devant (orange) et de l’avance sur le pilote derrière (vert).
- Affichage du temps restant et du nombre de tours ; le temps passe en orange sous 2 minutes.
- Centre de gestion des pénalités dans le Focus Sprint.
- Pénalités triées de la plus récente à la plus ancienne, avec heure de première détection.
- Défilement automatique au-delà de six pénalités.
- Les libellés de pénalité restent ceux fournis par Apex Timing.

## V4.3.8 — Informations enrichies du mode Focus Qualification

- Affichage du **nom du pilote suivi sous sa position**.
- Affichage simultané du **temps restant** et du **nombre de tours** lorsqu'ils sont disponibles.
- Le nombre de tours est placé **sous le temps restant** dans la case inférieure gauche.
- Le temps restant conserve son passage à l'orange à **2 minutes ou moins**.
- La grille reste inchangée : ligne 1 en **30/70**, ligne 2 en **50/50**.

# KartIQ V4.3.5 — Pénalités stables Sprint et Endurance

- Retour au moteur de pénalités de la V4.3.3 : lecture directe de la colonne Apex « Péna. » sans historique.
- Suppression des doublons pilote/équipe introduits par l’historique de la V4.3.4.
- Conservation du panneau PÉNALITÉS en Sprint.
- Ajout du panneau PÉNALITÉS sous le Top 8 en Endurance.
- Ajout de la colonne PÉNA. dans le classement général Endurance.
- Le Top 8 affiche aussi la position de l’équipe au classement général.

## V4.3.4 — Pénalités Sprint et Endurance

- Ajout du bloc PÉNALITÉS sous le Top 8 en mode Endurance.
- Conservation de l'historique des pénalités détectées dans la colonne Apex « Péna. ».
- Affichage des pénalités de la plus récente à la plus ancienne en Sprint et en Endurance.
- Ajout de la colonne « PÉNA. » au classement général Endurance.
- Le Top 8 affiche désormais le rang de rythme et la position au classement général (P1, P2, etc.).

## V4.3.3 — Pénalités Apex fiabilisées

- Correction du parseur de grille Apex : les libellés de colonnes sont désormais conservés même lorsque `data-type` est vide.
- Reconnaissance de la colonne officielle `Péna.` (colonne `c12` sur la grille observée).
- Affichage dans le panneau Sprint du nom de l’équipe/pilote et de la valeur exacte transmise par Apex, par exemple `PACIFIC E-RACING — 1 Tr`.
- Les mises à jour WebSocket ultérieures de la cellule de pénalité restent prises en compte.
- Conservation du défilement desktop Qualification/Sprint et de toutes les fonctionnalités validées.

## V4.3.2 — Pénalités Apex et défilement desktop

- Sprint : lecture directe de la colonne Apex « Péna. » et affichage du nom de l'équipe/pilote avec la valeur exacte de la pénalité dans le panneau de droite.
- Qualification desktop : classement général défilable verticalement.
- Sprint desktop : classement général défilable verticalement.
- Aucun changement de largeur des colonnes ni de l'affichage mobile.

# KartIQ v4.3.1

- Desktop uniquement : noms rapprochés de la position en Qualification et Sprint, sans modifier les autres colonnes ni le mobile.
- Sprint : affichage automatique des pénalités Apex dans le panneau de droite (équipe/pilote + sanction).
- Aucun autre changement fonctionnel ou visuel.

# KartIQ v4.3.0 — Desktop polish

- Qualification et Sprint desktop : colonne POS resserrée et noms rapprochés de la position.
- Endurance : ajout de la colonne STANDS avec le nombre d'arrêts effectués.
- Détection robuste de la colonne d'arrêts à partir du type ou du libellé Apex.
- Numéro de version visible sur la page d'accueil et dans l'en-tête.
- Aucun changement de la logique AUTO/LOCK ni du calcul des deltas validé en v4.2.11.

# KartIQ V4.2.11

## Calcul du delta selon le mode

- Qualification :
  - pilote suivi P1 : avance sur le P2, en vert ;
  - pilote suivi hors P1 : écart avec le P1, en orange.
- Sprint :
  - pilote suivi P1 : avance sur le P2, en vert ;
  - pilote suivi hors P1 : intervalle avec le pilote immédiatement devant au classement, en orange.
- Le pilote suivi reste verrouillé jusqu’au clic sur un autre pilote.
- Aucun changement de design ou d’informations dans la ligne 1.

# KartIQ V4.2.10

- Correction du suivi pilote persistant.
- Une trame Apex partielle ne vide plus la position ni le delta de la ligne 1.
- En mode AUTO, la ligne 1 suit le P1.
- Après sélection d’un pilote, le verrouillage reste actif jusqu’au clic sur un autre pilote.
- Aucun changement de design.

# KartIQ V4.2.8 — Contrôles plein écran mobile

- Le bouton ☰ reste accessible en plein écran.
- Ajout d’un bouton ✕ flottant pour quitter immédiatement le plein écran.
- Positionnement adapté à l’encoche et à la Dynamic Island grâce aux marges de sécurité iPhone.
- Compatibilité avec les événements Fullscreen standards et WebKit.

# KartIQ V4.2.5 Beta — Popup Qualification

- Lorsqu’un pilote suivi signe le meilleur temps absolu : affichage P1, « 🥇 MEILLEUR TEMPS ! » et avance verte sur le deuxième pilote.
- Dans les autres cas : affichage de la position et du retard rouge sur le détenteur du meilleur temps absolu.
- Le nom et le prénom du pilote de référence sont affichés après « vs ».
- Durée du popup conservée à 6 secondes.

# KartIQ V4.2.3 — Temps restant Endurance

- Ajout du temps restant en direct dans l’en-tête du classement général du mode Endurance.
- Synchronisation avec le compteur Apex `dyn1|countdown|...`.
- Passage en rouge sous les 2 minutes restantes.

## V4.1.5

- Ajout du circuit Circuito Internazionale Triscina (Italie).
- Live Apex : https://live.apex-timing.com/circuito-internazionale-triscina/
- WebSocket : wss://live-data.apex-timing.com:10293/

## V4.1.4
- Sprint desktop : flamme et nom du pilote affichés au-dessus du meilleur temps.
- Delta du pilote P1 affiché en vert dans le bloc central.

# KartIQ V4.1.1 Beta Real Live

- Qualification : lorsqu'on sélectionne le P1, son delta affiche désormais son avance réelle sur le P2.
- Le delta du P1 est affiché en vert et n'est plus forcé à 0.000.
- Le libellé « Écart avec » indique le pilote P2 lorsque le leader est sélectionné.

# V4.1.0 Beta Real Live

- Chronomètre Apex fondé sur une heure de fin absolue côté serveur.
- Décompte navigateur fondé sur `performance.now()` pour éviter toute dérive.
- Priorité donnée à la trame WebSocket Apex reçue directement dans le navigateur.
- Ajout du circuit RKO Anthoine Hubert (`crkart`, port 7803).

KartIQ V4.0.9
- Synchronisation directe du temps restant sur dyn1|countdown|<millisecondes>.
- Suppression de la compensation fixe de 2 secondes.
- Mise à jour immédiate côté navigateur à réception de chaque trame Apex.

# V4.0.8 Beta Real Live

- Le meilleur temps de session est déterminé à partir de tous les meilleurs tours valides affichés, sans dépendre du champ global Apex.
- Le compte à rebours applique une compensation de synchronisation de 2 secondes pour s’aligner sur l’écran Apex officiel.

# KartIQ V4.0.6 Beta Real Live

- Qualification : le temps restant s’écoule désormais seconde par seconde entre deux mises à jour Apex.
- Le compteur se recale automatiquement dès qu’Apex transmet une nouvelle valeur.
- Le passage en rouge sous 2 minutes est conservé.

# Changelog — KartIQ V4.0.6 Beta Real Live

- Qualification : delta du bandeau basé sur le meilleur tour du pilote suivi contre le meilleur absolu.
- Passage du pilote suivi : position et delta du dernier tour affichés pendant 6 secondes.
- Temps restant en rouge sous 2 minutes.
- Meilleur chrono absolu violet dans la colonne Meilleur.
- Clignotement de la ligne complète à chaque nouveau tour.
- Animation fluide des lignes lors des changements de position.
- Alerte Top 8 aux stands limitée au mode Endurance.
- Top 8 rythme actuel : moyenne glissante des 5 derniers tours.

## V4.0.6 Beta Real Live
- Un clic sur une ligne sélectionne immédiatement ce pilote comme pilote suivi.
- Le delta Qualification est recalculé à partir du meilleur tour du pilote sélectionné et du meilleur tour absolu du classement courant.
- Le calcul est réalisé côté interface immédiatement puis confirmé par le serveur afin d'éviter les valeurs en cache.


## V4.0.7
- Reset complet lors du changement de circuit.
- Rejet des trames tardives provenant de l’ancienne piste.
- Nettoyage immédiat de l’interface avant la reconnexion.

## V4.2.0 Beta Real Live
- Mode Endurance desktop : 20 premières équipes visibles dans le classement général.
- Défilement vertical pour consulter toutes les équipes suivantes.
- Clignotement d'une ligne lorsqu'une équipe franchit la ligne de chronométrage.
- Animation dynamique lorsqu'une équipe gagne ou perd des positions.


## V4.2.1 Beta Real Live

- Mode Endurance uniquement : badge rouge `IN` affiché après la position pendant toute la présence aux stands.
- À la transition Apex `*out`, badge vert `OUT` affiché pendant 3 secondes.
- Aucun changement dans les modes Qualification et Sprint.

## V4.2.2 Beta Real Live
- Ajout d'une boîte noire Apex activable depuis les outils développeur.
- Enregistrement horodaté des trames entrantes dans `logs/apex_in.log`.
- Enregistrement des messages envoyés dans `logs/apex_out.log`.
- Export direct des journaux dans une archive ZIP avec métadonnées de capture.

## V4.2.4 — Brignoles Karting Loisir
- Ajout du circuit **Brignoles Karting Loisir**.
- Live timing : `https://www.apex-timing.com/live-timing/brignoles-karting-loisir/`
- WebSocket : `wss://live-data.apex-timing.com:8603/`
- Statut initial : à valider pendant un live actif.


## V4.2.7 — Mobile plein écran
- Interface adaptée aux iPhone en portrait et paysage.
- Bouton ⛶ de plein écran dans l’en-tête.
- Installation PWA depuis l’écran d’accueil iOS.
- Gestion des zones sûres autour de l’encoche et de la barre d’accueil.

## V4.3.7 — Correction du bouton Focus Qualification

- Le bouton **Focus** est désormais placé à gauche du delta dans la case centrale.
- Répartition de la case centrale : **Focus 25 % / Delta 75 %**.
- Le bouton n'est plus affiché sous le delta.
- Le mode Focus plein écran et sa grille 30/70 puis 50/50 restent inchangés.

## V4.3.6 — Mode Focus Qualification
- Ajout du bouton **Focus** dans la case Delta du mode Qualification, sans modifier la structure Position | Delta | Temps/Tours.
- Écran Focus plein écran en deux lignes :
  - Ligne 1 : Position 30 % | Delta 70 %.
  - Ligne 2 : Temps restant ou tours 50 % | meilleur pilote de la séance 50 %.
- Delta limité aux couleurs vert et orange.
- Temps restant orange à 2 minutes ou moins.
- Bouton × en haut à droite pour revenir au mode Qualification classique.
- Tentative automatique d’affichage plein écran, orientation paysage et maintien de l’écran allumé lorsque le navigateur le permet.
