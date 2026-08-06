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
