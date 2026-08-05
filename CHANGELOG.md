# Changelog

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
