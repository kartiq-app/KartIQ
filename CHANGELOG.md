## V4.8.9 — Isolation complète des valeurs Temps / Tours

- Reprise de la V4.8.8 fonctionnelle.
- Suppression des anciennes classes `remaining-time` et `remaining-laps` sur les cases paysage Qualification et Sprint.
- Nouvelles classes dédiées `landscape-clock-time`, `landscape-clock-laps` et `landscape-clock-value`.
- Les anciennes règles CSS ne peuvent plus imposer leur taille, leur espacement ou leur alignement aux valeurs de cette case.
- Centrage horizontal et vertical assuré uniquement par le composant `landscape-session-clock`.
- Conservation des identifiants JavaScript et de la logique de sélection des circuits.
- Couleur rouge sous deux minutes conservée avec une règle dédiée.
- Cache PWA mis à jour en V4.8.9.

## V4.8.8 — Isolation définitive de la case Temps / Tours

- Reprise de la dernière version fonctionnelle V4.8.7.
- Qualification et Sprint utilisent désormais une classe dédiée `landscape-session-clock`.
- Les anciens sélecteurs `.status-values` et `.sprint-session-status` ne peuvent plus modifier cette case.
- Une seule définition CSS pilote le composant en paysage.
- Les deux valeurs occupent chacune exactement la moitié de la case et sont centrées horizontalement et verticalement.
- Les identifiants JavaScript et la sélection des circuits restent inchangés.
- Cache PWA mis à jour en V4.8.8.

# KartIQ — Journal des modifications

## V4.8.7 — Nettoyage ciblé de la case Temps / Tours
- Suppression des correctifs expérimentaux V4.8.4 et V4.8.6 qui se superposaient sur la dernière case de la ligne 1.
- Restauration du contenu Temps / Tours en Qualification paysage et Sprint paysage.
- Une seule règle CSS commune utilise une grille de deux moitiés strictement égales.
- Centrage horizontal et vertical assuré individuellement pour le temps et les tours, sans position absolue ni transformation.
- La sélection des circuits et toute la logique JavaScript restent inchangées.
- Cache PWA mis à jour en V4.8.7.

# V4.8.6

- Correction de la régression empêchant la sélection d’un circuit depuis l’accueil.
- Restauration de la base fonctionnelle V4.8.4 et de toutes les règles nécessaires aux listes de circuits et aux classements.
- En Qualification paysage et Sprint paysage, la dernière case de la ligne 1 reste présente mais son contenu est masqué.
- Les éléments Temps/Tours restent dans le DOM afin de préserver la logique JavaScript et les autres modes.
- Version de la home, version interne et cache PWA synchronisés en V4.8.6.

# V4.8.4

- Suppression des correctifs CSS superposés V4.8.1 à V4.8.3 pour la case **Temps restant / Tours**.
- Qualification et Sprint paysage utilisent désormais un composant Flex unique et simple, avec deux moitiés égales centrées horizontalement et verticalement.
- Le séparateur central et l’alerte rouge sous deux minutes sont conservés.
- Version de la home, version interne et cache PWA synchronisés en V4.8.4.

# V4.8.3

- Correction du centrage réel de la case **Temps restant / Tours** en Qualification paysage et Sprint paysage.
- Suppression de l’influence des anciennes règles de grille sur le contenu : chaque valeur est désormais positionnée et centrée dans sa demi-case.
- Conservation de la parité des cases et filets en Qualification et Sprint portrait.
- Version de la home, version interne et cache PWA synchronisés en V4.8.3.

# V4.8.2

- Qualification et Sprint paysage : centrage structurel du temps restant et des tours dans leur case, avec deux demi-hauteurs fixes de 44 px.
- Qualification portrait : grille, dimensions et case Temps/Tours rendues identiques à celles du Sprint portrait.
- Qualification portrait : chaque case des lignes 1 et 2 est désormais délimitée par un filet.
- Version de la home, version interne et cache PWA synchronisés en V4.8.2.

# V4.8.1

- Qualification et Sprint paysage : centrage horizontal et vertical renforcé du contenu Temps restant / Tours.
- Sprint portrait : chaque case des lignes 1 et 2 est désormais délimitée par un filet fin.
- Version de la home, version interne et cache PWA synchronisés en V4.8.1.

# V4.8.0

- Qualification paysage utilise désormais exactement la même grille à cinq cases que Sprint paysage.
- Largeurs identiques pour Menu, Pilote suivi, Focus, Delta et Temps / Tours dans les deux modes.
- Les cases Temps / Tours de Qualification et Sprint partagent la même structure sur deux lignes, le même séparateur et la même typographie.
- Version de la home, version interne et cache PWA synchronisés en V4.8.0.

# V4.7.9

- Sprint paysage : la case Temps restant / Tours est désormais présentée sur deux lignes centrées.
- Sprint paysage : ajout d’un filet séparateur entre le chrono et le nombre de tours, comme en Qualifications.
- Sprint paysage : le chrono passe en rouge sous la barre des deux minutes.
- Qualifications paysage : la ligne supérieure adopte exactement la même hauteur que celle du Sprint paysage.
- Version de la home, version interne et cache PWA synchronisés en V4.7.9.

# V4.7.8

- Sprint paysage : ligne supérieure complète et alignée avec la case Temps restant / Tours visible à droite.
- Sprint portrait : position et nom du pilote suivi toujours centrés dans leur case.
- Qualifications paysage : ajout d’un second filet rouge au-dessus du classement général.
- Version de la home, version interne et cache PWA synchronisés en V4.7.8.

# KartIQ V4.7.7

- Sprint portrait : la case Temps restant / Tours tient sur une seule ligne et reprend exactement la hauteur de la case Focus.
- Sprint paysage : première ligne reconstruite et alignée comme en Qualification : Menu, Pilote suivi, Focus, Delta, Temps restant / Tours.
- Sprint paysage : toutes les cases de la ligne supérieure ont la même hauteur et des séparations nettes.
- Bloc Meilleur dernier tour aligné sur le filet supérieur du classement général, avec la même épaisseur de filet.
- Version de la page d’accueil, version interne et cache PWA synchronisés en V4.7.7.

# KartIQ V4.7.6

- Sprint classique paysage : grille des colonnes recalée avec une largeur dédiée à Dernier et Intervalle.
- Largeur de la colonne Pilote conservée à l’identique.
- Chronos Dernier affichés intégralement et en-têtes alignés avec les valeurs.
- Espacement renforcé avant la colonne Intervalle sans superposition.
- Bloc du meilleur dernier tour aligné sous l’en-tête, au niveau de la première ligne du classement.
- Colonne latérale et bloc Pénalités compactés et alignés.
- Version de la page d’accueil, version interne et cache PWA synchronisés en V4.7.6.

# KartIQ V4.7.5

- Sprint classique paysage : décalage supplémentaire de la colonne **Intervalle** pour créer un espace net avec **Dernier**.
- La troisième case du bandeau supérieur affiche désormais le **temps restant** et/ou le **nombre de tours restants** transmis par Apex Timing.
- Le meilleur temps du dernier tour est déplacé dans une carte dédiée au-dessus des pénalités.
- La carte affiche sur deux lignes le nom du pilote puis son chrono du dernier tour.
- Version de la page d’accueil, version interne et cache PWA synchronisés en V4.7.5.

# KartIQ V4.7.4

- Sprint classique paysage : séparation renforcée entre les colonnes **Dernier** et **Intervalle**, sans superposition.
- Qualification classique : suppression du filet vertical rouge en haut à gauche pour isoler le menu hamburger.
- Sprint classique : suppression du filet vertical bleu en haut à gauche pour isoler le menu hamburger.
- Sprint portrait : centrage horizontal et vertical du pilote ayant réalisé le meilleur temps du dernier tour, aligné avec le chrono.
- Version de la page d’accueil, version interne et cache PWA synchronisés en V4.7.4.

# KartIQ V4.7.3

- Correction ciblée de la page Sprint classique en mode paysage.
- La colonne « Dernier » affiche désormais le chrono complet sans troncature ni points de suspension.
- Aucun changement sur le Sprint portrait, la Qualification ou les modes Focus.
- Numéro de version de la home, de l’en-tête, de l’état applicatif et du cache PWA mis à jour.

## KartIQ V4.7.2

- Qualification et Sprint : troncature renforcée du nom du pilote suivi, y compris lorsque le nom est composé de plusieurs éléments HTML.
- Le nom reste sur une seule ligne et affiche une ellipse lorsqu’il dépasse de sa carte.
- En mode paysage, le menu hamburger est désormais ancré complètement à gauche de l’écran, avec prise en compte de la zone sûre du téléphone.
- Cache PWA renouvelé pour forcer le chargement de la correction sur mobile.

# KartIQ V4.7.1

- Qualification et Sprint : le nom du pilote suivi est tronqué proprement lorsqu’il dépasse de sa carte.
- Le bouton Focus (icône et texte) reste centré en portrait comme en paysage, sur téléphone comme sur ordinateur.
- Les positions des classements généraux Qualification et Sprint sont affichées en orange.
- Le bouton de retour à l’accueil utilise désormais une icône à trois traits et se place dans le coin supérieur droit en paysage.
- Sprint portrait : ajout du titre rouge « Pénalités ».
- Sprint portrait : affichage des pénalités sur trois colonnes sans entêtes — heure, équipe/pilote et pénalité.
- Cache PWA renouvelé pour forcer le chargement de la version sur mobile.

# KartIQ V4.6.8

- Correction du classement portrait Qualification et Sprint.
- Le numéro de kart, lorsqu’il est disponible, reste strictement sur la même ligne que la position et le nom du pilote.
- Ordre garanti : position → kart → pilote.
- Le nom du pilote est tronqué avec une ellipse si la largeur disponible est insuffisante.
- Cache du service worker renouvelé pour forcer la mise à jour sur iPhone.

# V4.6.7 — Alignement portrait du numéro de kart

- En Qualification et Sprint portrait, la position, le numéro de kart et le nom du pilote restent sur une seule ligne.
- Le numéro de kart est placé immédiatement avant le nom.
- Les noms trop longs sont tronqués avec une ellipse sans provoquer de retour à la ligne.

# KartIQ V4.6.6 — Numéros de kart dans les classements

- Ajout du numéro de kart Apex dans le classement général des modes Qualification et Sprint.
- Le numéro provient directement du champ `KART` transmis par Apex Timing.
- Il est affiché entre la position et le nom du pilote, en gris clair.
- Lorsqu'aucun numéro de kart n'est fourni, aucun emplacement vide n'est ajouté devant le nom.
- Les affichages Focus et Endurance ne sont pas modifiés.

# KartIQ V4.6.5 — Signes des deltas en mode Focus Sprint

- Le delta orange avec le pilote devant est toujours affiché avec un signe `-`.
- Le delta vert avec le pilote derrière est toujours affiché avec un signe `+`.
- La règle s’applique également aux cas particuliers : P1 (vert uniquement) et dernier (orange uniquement).

# KartIQ V4.6.4 — Deltas Focus Sprint aux extrémités du classement

- Lorsque le pilote suivi est P1, affiche uniquement le delta vert avec le pilote P2.
- Supprime le second delta et le séparateur puisqu’aucun pilote ne se trouve devant le leader.
- Lorsque le pilote suivi est dernier, affiche uniquement le delta orange avec le pilote qui le précède.
- Conserve les deux deltas pour toutes les autres positions.

# KartIQ V4.6.3 — Suivi automatique Brice NGuessan

- Sélection automatique du pilote suivi en modes Qualification et Sprint lorsque le classement contient Brice NGuessan, NGUESSAN, B. NGuessan ou Guessan.
- Détection tolérante à la casse, aux apostrophes, aux points et aux espaces.
- Une sélection manuelle reste prioritaire jusqu’au prochain rechargement de session.

# V4.6.2

- Corrige le débordement du delta et du temps/tours en mode Sprint portrait.
- Tronque les noms trop longs dans les classements portrait.
- Maintient le meilleur dernier tour Sprint sur une seule ligne.
- Passe le bouton Home portrait sur fond noir.
- Ajoute l’icône cible orange devant FOCUS en Qualification et Sprint.
- Renforce la marge supérieure iPhone via la safe area.

# KartIQ V4.6.1 — Menu portrait Qualification et Sprint

- Ligne 1 en proportions fixes : Home 20 %, pilote suivi 30 %, Delta 50 %.
- Ligne 2 : Focus 50 %, temps restant / tours 50 %.
- Sprint : meilleur dernier tour sur une troisième ligne pleine largeur.
- Ajout d’une marge supérieure tenant compte de la zone sûre iPhone.

# V4.5.9

- Centre horizontalement le bouton Home entre le bord gauche de la carte et la position du pilote suivi.
- Conserve l’alignement vertical du bouton avec la position afin de ne jamais masquer le nom du pilote.

# V4.5.8

- Aligne le bouton Home à la même hauteur que la position du pilote suivi.
- Rend toute la largeur de la carte disponible au nom du pilote.
- Empêche le bouton Home de masquer les noms de pilotes longs.

# KartIQ v4.5.7

- Recentrage du bouton Home dans la carte du pilote suivi en Qualification et Sprint.
- Le bouton est désormais centré entre le bord gauche de la carte et la position affichée, sans sortir du cadre.
- Conservation des améliorations précédentes du Focus Sprint et de l’affichage des pénalités.

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

## V4.6.9 — Colonne KART conditionnelle
- Ajout d'une vraie colonne **KART** dans les classements Qualification et Sprint.
- La colonne est affichée uniquement si au moins un numéro de kart est fourni par Apex Timing.
- Si aucun numéro n'est disponible, la colonne disparaît totalement et la mise en page d'origine est conservée.
- En portrait, position, kart et pilote restent chacun dans leur colonne sur une seule ligne.

## V4.7.0 — Base circuits centralisée et 7 nouveaux circuits
- La liste des circuits est chargée depuis le fichier unique `config/circuits.json`.
- Le serveur garantit automatiquement un tri alphabétique insensible aux accents et à la casse.
- Ajout de **Circuit de l'Indre**.
- Ajout de **GP Kart Concept**.
- Ajout de **Harbor Circuit Makuhari** (Japon).
- Ajout de **Lignano Circuit** (Italie).
- Ajout de **PKS - Circuit du Val d'Argenton**.
- Ajout de **Racing Kart JPR Ostricourt**.
- Ajout de **RKC - Karting Paris**.
- Mise à jour du cache PWA afin de forcer le chargement de la nouvelle version sur mobile.
