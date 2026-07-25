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
