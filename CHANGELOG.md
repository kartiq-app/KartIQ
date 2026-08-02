# V6.3.7 — Couleurs des chronos dans STATS

- Le chrono du tour d’entrée aux stands (IN) est affiché en rouge.
- Chaque nouveau meilleur tour progressif de l’équipe est affiché en vert.
- Les tours sans amélioration conservent leur couleur actuelle.
- La règle fonctionne pour la course en direct et les anciennes sessions Apex.

# V6.3.6 — Temps EN PISTE en blanc

- Le temps du relais dans la colonne **EN PISTE** de l’Analyzer est désormais forcé en blanc.
- Suppression des classes vert/orange/rouge appliquées à cette valeur.
- La couleur bleue reste réservée à l’indication d’une équipe actuellement aux stands.
- Mise à jour du cache PWA et de la version applicative.

# V6.3.5 — Correction des temps PITS Apex

- Correction du mapping des champs du protocole PITS Apex.
- La colonne **TOUR** reprend désormais le vrai numéro de tour.
- La colonne **HEURE** affiche l’heure de course au format `HH:MM:SS`.
- La colonne **EN PISTE** calcule la durée entre la sortie du stand précédent et l’entrée actuelle.
- La colonne **TEMPS AUX STANDS** calcule uniquement la durée de l’arrêt, au format `M:SS.mmm`.
- Un arrêt encore en cours affiche `—` dans **TEMPS AUX STANDS**.
- Mise à jour du cache PWA et de la version applicative.

# V6.3.4 — STATS et historique PITS

- Le temps de relais de la colonne **EN PISTE** est affiché en blanc.
- Le bouton **TOURS** de la colonne CHRONOS devient **STATS**.
- La fenêtre STATS comprend désormais trois onglets : **ANCIENNES SESSIONS**, **TOURS DE L’ÉQUIPE** et **PITS**.
- L’onglet **PITS** charge directement depuis Apex l’historique des arrêts de l’équipe : numéro d’arrêt, tour, heure, temps en piste et temps aux stands.
- Les arrêts sont classés du plus récent au plus ancien et restent consultables dans les anciennes sessions.

# V6.3.3 — Correction compteur EN PISTE Analyzer

- La colonne **EN PISTE** utilise désormais exclusivement la colonne Apex de type `otr`.
- Les classes génériques `in` et `to` des autres colonnes ne peuvent plus écraser le compteur du relais.
- Quand une équipe roule, KartIQ affiche le temps transmis par Apex depuis sa dernière sortie des stands.
- Quand elle rentre, le compteur de stand Apex reste affiché en bleu jusqu'à la sortie.
- Mise à jour de la version et du cache PWA.

# V6.3.2 — Analyzer Relais

- Ajout de l’indicateur IN entre POS et KART.
- La colonne PISTE devient EN PISTE et affiche le compteur Apex du relais courant.
- Pendant un arrêt, EN PISTE affiche le compteur de stand en bleu.
- Ajout de T.MOYEN, recalculé à chaque tour du relais courant et remis à zéro à chaque sortie des stands.
- Mise à jour du cache PWA et de la version.

# V6.3.1 — Correction Tours Analyzer

- Correction du parseur des lignes Apex au format `D<id>.L<numéro>#S1|S2|S3|temps`.
- Le numéro de tour est désormais lu entre `.L` et `#`, comme dans le JavaScript officiel Apex.
- Chargement progressif de l’historique avec les fenêtres Apex 30, 100, 300, 750, 1500 et 3000 tours.
- Suppression de la requête non standard `D#-9999`, remplacée par le comportement natif d’Apex.
- Mise à jour du cache PWA et de la version en 6.3.1.

# V6.3.0 — Historique Apex dans Analyzer

- Ajout d’un bouton **TOURS** sur chaque équipe du classement Analyzer.
- Consultation de tous les tours disponibles depuis le début de la course : numéro du tour, secteurs, chrono et delta au meilleur tour.
- Ajout du bouton **HISTORIQUE APEX** dans la barre d’outils Analyzer.
- Détection et affichage des anciennes sessions Apex via la commande `S#`.
- Possibilité de consulter les tours d’une équipe dans la course en direct ou dans une ancienne session sélectionnée.
- Connexion en lecture seule à `request.php` via un proxy serveur KartIQ, sans interrompre le WebSocket de la course.
- Mise à jour du cache PWA et de la version en 6.3.0.

# V6.2.1 — South Garda Karting

- Ajout de South Garda Karting (Italie).
- Live Timing : `https://www.apex-timing.com/live-timing/southgardakarting/index.html`.
- WebSocket Apex : `wss://live-data.apex-timing.com:7443/`.
- Nouveau cache PWA afin de forcer le chargement de la version mise à jour.

# V6.2.0 — Sessions Analyzer persistantes

- Sauvegarde automatique toutes les 5 secondes.
- Reprise automatique après fermeture, plantage ou redémarrage.
- Sessions distinctes par circuit.
- Sauvegarde avant changement de circuit et restauration de la dernière session du circuit sélectionné.
- Gestionnaire de sessions : créer, reprendre, archiver et supprimer.
- Export et import JSON.
- Persistance des règles, apprentissages, karts virtuels, files de Quick Change et tri du classement.
- Indicateur visuel de dernière sauvegarde.

# V6.1.0 — Analyzer stratégique Endurance

- Remplacement complet de l’ancienne page Analyzer.
- Classement général Apex enrichi : position, kart, équipe, tours, temps en piste, stands, dernier, meilleur, écart, pénalité, arrêt prévu, kart virtuel et note.
- Menu Règlement configurable : durée, passages obligatoires, relais minimum/maximum, temps minimum dans les stands, fermeture des stands, marge de sécurité et temps minimum par pilote.
- Prévision des prochains Quick Changes à partir du temps en piste, de la limite réglementaire et de l’historique appris.
- Timeline des arrêts attendus, détection de vagues, classement des karts et indice d’opportunité.
- Gestion des files de Quick Change conservée et intégrée à la recommandation.
- Apprentissage local persistant des durées de relais.

## 6.0.40

- Sprint desktop et portrait : chaque pénalité est affichée sur deux lignes, avec heure, pilote/équipe et durée sur la première, puis le détail sur la seconde.
- Protection stricte contre les débordements avec troncature visuelle.
- Sprint smartphone paysage : nom tronqué si nécessaire et durée toujours visible à droite.
- Normalisation des durées Apex : `3.000` devient `3 s`.

## 6.0.39
- Pénalités Sprint alimentées par les commentaires Apex en portrait et paysage.
- Affichage sur une ligne selon le format de chaque écran.
- Alerte pénalité Focus Endurance pendant 15 secondes, y compris au-dessus des écrans stands.

## V6.0.38 — Pénalités Focus Sprint depuis com||

- Parsing robuste des commentaires Apex dans les trames init séparées par espaces ou retours ligne.
- Extraction de l’heure, du kart et du texte via le HTML com||.
- Association automatique du numéro de kart au pilote ou à l’équipe.
- Déduplication des alertes sur l’heure Apex, le kart et le texte.

## V6.0.37 — Focus Sprint commentaires Apex

- Nom du pilote le plus rapide tronqué sans déborder.
- Pénalités du Focus Sprint alimentées exclusivement par la zone Commentaires Apex.
- Alerte rouge de 7 secondes pour chaque nouvelle pénalité, dédupliquée par heure.
- Noms des concurrents recentrés dans la case Delta du Focus Endurance.

## V6.0.36 — Temps restant dynamique en paysage smartphone

- Qualifications, Sprint et Endurance : affichage `HH:MM` à partir d'une heure.
- Sous une heure : affichage `MM:SS`.
- Aucun changement sur desktop, portrait ou les écrans Focus.

## V6.0.34 — Écarts en tours

- Sprint et Endurance : prise en charge des intervalles Apex exprimés en `Lap(s)` ou `tour(s)`.
- Focus Sprint et Focus Endurance : affichage des écarts directs en tours avec le signe correspondant à l’avance ou au retard.
- Les écarts chronométriques conservent leur format à trois décimales.

# KartIQ V6.0.33

- L’écran de sortie des stands utilise désormais exclusivement le nombre indiqué dans la colonne STANDS d’Apex Timing.
- La valeur reste synchronisée pendant les 5 secondes d’affichage afin de prendre en compte une mise à jour Apex reçue juste après la sortie.
- Suppression de l’incrément local du nombre de passages.

# KartIQ V6.0.32

- Nouvel écran de sortie des stands avec numéro de passage, libellé « Durée de l’arrêt » et chrono au format MM:SS.
- Police Regular blanche pour le nombre de passages, Torque blanche pour le titre et Regular bleue pour le chrono.

# KartIQ V6.0.31

- Correction de l'interprétation des compteurs Apex observés en live.
- `|to|` correspond au compteur actif pendant le passage aux stands : état IN.
- `|in|` correspond au compteur de temps en piste après la sortie : état piste.
- La transition `to` → `in` déclenche l'écran SORTIE STANDS pendant 5 secondes.
- La dernière valeur `to` alimente la colonne STAND et la durée affichée à la sortie.
- Le compteur `in` alimente le Temps en piste du Focus Endurance.

# KartIQ V6.0.30

- Détection des stands alignée sur les trames Apex réelles : `|in|` active l'état IN.
- Le premier `|to|` reçu après `|in|` déclenche immédiatement la sortie des stands.
- La dernière durée `|in|` reste mémorisée pour la colonne STAND et l'écran SORTIE STANDS.
- Le temps en piste du Focus Endurance utilise désormais directement la valeur Apex `|to|`.

## 6.0.29
- Endurance paysage : classement général repris du mode Analyzer.
- Ordre des colonnes : POS, KART, ÉQUIPE / PILOTE, TOURS, STANDS, DERNIER, MEILLEUR, ÉCART, PÉNA.

# KartIQ V6.0.28

## Correctif de restauration

- Restauration intégrale des quatre cartes d’accueil : Qualification, Sprint, Endurance et Analyzer.
- Restauration de la page Endurance validée et de son Focus Endurance.
- Delta Endurance P1 affiché en vert.
- Colonne STAND ajoutée uniquement en paysage sur la page Endurance, alimentée par `pit_timer` Apex.
- Focus Endurance IN : chrono bleu en bas à droite.
- Focus Endurance OUT : écran noir pendant 5 secondes avec `SORTIE STANDS` et le temps Apex.
- Aucun remplacement de la page Endurance par l’ancien dashboard Analyzer.

# KartIQ V6.0.26

## Corrections des deltas Sprint / Endurance

- Mode Sprint : le delta des pilotes P2 et suivants est maintenant préfixé par `-`.
- Focus Sprint et Focus Endurance : pour le pilote suivi P1, l'avance sur P2 est affichée seule, en vert, au centre de la case Delta.
- Pour P2 et suivants, le delta avec le pilote devant reste en haut en orange et le delta avec le pilote derrière en bas en vert.
- Qualifications et Focus Qualifications restent inchangés.

## V6.0.25 — Deltas Sprint et Focus corrigés

## 6.0.25

- Correction des deltas Sprint et Endurance à partir des écarts Apex cumulés.
- Sprint/Endurance : écart direct avec le pilote devant ; pour P1, avance sur P2.
- Focus Sprint/Endurance : écart devant en orange et écart derrière en vert.
- Qualifications inchangées.

- Mode Sprint : le pilote suivi en P1 conserve l’écart avec le P2, affiché en vert.
- Mode Sprint : à partir de P2, la case Delta reste l’écart avec le pilote immédiatement devant, affiché en orange.
- Focus Sprint et Focus Endurance : le delta inférieur utilise exclusivement l’intervalle Apex du pilote immédiatement derrière.
- Suppression du repli sur l’écart au leader (`gap`) pour éviter un delta incorrect avec le pilote derrière.
- Qualification, Analyzer et les autres éléments d’interface ne sont pas modifiés.

## V6.0.23 — Focus Sprint : icône chrono et police Regular

- La carte du pilote suivi affiche strictement `Position / Nom / ⏱Rang`.
- L’icône chronomètre blanche est rendue explicitement dans le Focus Sprint.
- Le rang utilise la police F1 Regular, sans suffixe ordinal et sans espace après l’icône.
- Aucun autre écran n’est modifié.

## V6.0.22 — Focus Sprint : carte pilote suivie harmonisée

- Remplacement du contenu de la carte du pilote suivi par la structure du Focus Endurance.
- Affichage strict : position, nom, puis chronomètre blanc et rang numérique (`⏱2`).
- Suppression du suffixe ordinal et du libellé « TEMPS » dans cette carte.
- Protection contre les débordements reprise du Focus Endurance.
- Aucun changement sur les autres cartes du Focus Sprint ni sur les autres modes.

## V6.0.21 — Focus Endurance : stands IN / OUT

- État `IN` : écran noir et chrono des stands Apex en bleu dans le coin supérieur droit.
- État `OUT` : écran noir avec « Sortie Stands » et durée totale du passage aux stands pendant 5 secondes.
- Ajout des commandes développeur `IN`, `OUT` et réinitialisation pour tester la séquence.
- Aucun changement sur les Focus Qualification et Sprint.

# KartIQ V6.0.18

- Focus Endurance : bloc chronomètre + rang augmenté de 15 %.
- Case Delta : nom du pilote ou de l’équipe devant rapproché du filet orange.
- Aucun changement sur les autres modes.

# KartIQ V6.0.17

## Focus Endurance

- Suppression de l’espace entre l’icône chronomètre et le rang.
- Suppression des suffixes ordinaux « e » et « er ».
- Réduction de 10 % du bloc chronomètre + rang.
- Renforcement de la protection contre les débordements.

# KartIQ V6.0.16

- Focus Endurance uniquement : ordre strict Position / Nom / Chrono + rang dans la carte du pilote suivi.
- Réduction de 10 % du bloc chronomètre + rang.
- Protection renforcée contre tout débordement horizontal ou vertical dans cette carte.
- Aucun autre écran ni comportement modifié.

# KartIQ V6.0.15

## Focus Endurance
- Rapprochement visuel du rang de dernier tour et de la position du pilote suivi.
- Protection contre tout débordement du nom, de la position et du rang dans leur case.
- Taille des noms des concurrents devant et derrière augmentée de 100 %.
- Hauteur des cases Temps restant et Dernier temps réduite de 10 %, sans modifier la taille des chronos.
- Aucun changement sur les autres modes.

# KartIQ V6.0.14

## Focus Endurance

- Agrandissement de l’icône chronomètre et du rang du dernier tour pour les aligner visuellement sur la position.
- Suppression du nombre de tours dans la carte Temps restant.
- Réduction de la hauteur de la ligne inférieure sans modifier la taille du temps restant.
- Hauteur identique pour les cartes Temps restant et Dernier tour.

# KartIQ V6.0.13

## Focus Endurance

- Remplacement du panneau des pénalités par le dernier tour du pilote ou de l’équipe suivie, affiché en grand.
- Suppression du panneau du pilote le plus rapide.
- Conservation de la position et du nom de l’entité suivie.
- Classement du dernier tour affiché avec une icône chronomètre blanche et un ordinal compact (`2ᵉ`).
- Ajout du nom du concurrent devant au-dessus de son delta.
- Ajout du nom du concurrent derrière sous son delta.
- Aucun changement sur les Focus Qualification et Sprint.

# KartIQ V6.0.12

## V6.0.11 — Filets distinctifs Endurance

- Qualification conserve ses filets rouges.
- Sprint conserve ses filets bleus.
- Endurance utilise deux filets horizontaux orange `#FF8A00`.
- Le filet vertical de la case Position est orange `#FF8A00`.
- Le filet vertical de la case Menu reste gris `#29292E`.
- Tous les séparateurs de lignes restent gris.
- Analyzer n’est pas modifié.

## V6.0.11 — Restauration des filets Endurance

- Le filet horizontal supérieur de la page Endurance reste orange `#FF8A00`.
- Le filet horizontal au-dessus du classement reste orange `#FF8A00`.
- Le filet vertical de la case Menu reste gris, identique à Qualification et Sprint.
- Le filet vertical de la case Position passe en orange `#FF8A00`.
- Tous les séparateurs de lignes restent gris.
- Qualification, Sprint et Analyzer ne sont pas modifiés.
- Le Focus Endurance reste identique au Focus Sprint avec son filet supérieur orange.

## V6.0.9 — Correction du routage Focus Endurance

- Le mode Endurance ouvre désormais son propre écran cloné de Qualification.
- Le bouton Focus Endurance ouvre le composant Focus Sprint dédié à Endurance, et non le Focus Qualification.
- La structure, les informations et le comportement sont identiques au Focus Sprint.
- Le filet supérieur du Focus Endurance reste orange `#FF8A00`.
- Qualification, Sprint et Analyzer ne sont pas modifiés.

# KartIQ V6.0.8

## V6.0.8 — Focus Endurance copié du Focus Sprint

- Le mode Focus Endurance reprend intégralement la structure, les informations et le comportement du Focus Sprint.
- Le filet supérieur du Focus Endurance est orange `#FF8A00`.
- Le Focus Sprint reste inchangé.

# KartIQ V6.0.7

## V6.0.7 — Filet Menu Endurance gris

- Le filet vertical orange entre la case Menu et la case Position redevient gris (`#29292E`).
- Les deux filets horizontaux Endurance restent orange (`#FF8A00`).
- Qualification, Sprint et Analyzer ne sont pas modifiés.

---

# KartIQ V6.0.5

## V6.0.5 — Endurance clone strict de Qualification

- Le mode Endurance affiche directement la page Qualification.
- Les informations, mises en page, couleurs, filets et comportements sont identiques en desktop, portrait, paysage et Focus.
- Suppression de tous les styles de couleur spécifiques au mode Endurance ajoutés dans les versions précédentes.
- Aucun changement sur Qualification, Sprint ou Analyzer.

---

# KartIQ V6.0.4

## V6.0.4 — Endurance copié sur Qualification

- Le bouton Endurance ouvre désormais directement la page Qualification validée.
- Même contenu et même mise en page en desktop, smartphone portrait et smartphone paysage.
- Le mode Focus est le même que Qualification, avec le titre Endurance.
- L’accent orange Endurance est conservé ; les séparateurs de lignes restent gris.
- Aucun changement fonctionnel sur Qualification et Sprint.



## V6.0.3 — Correction des filets Endurance

- Desktop et smartphone paysage : le filet sous l’en-tête du classement Endurance est orange.
- Les séparateurs entre les lignes du classement restent gris, comme en Qualification et Sprint.
- Le mode Focus Endurance conserve les accents orange et les séparateurs internes gris.

- Accueil Desktop : les quatre cartes sont affichées sur une seule ligne dans l’ordre Qualification, Sprint, Endurance, Analyzer.
- Endurance : les deux filets hérités de Qualification sont maintenant orange.
- Focus Endurance : le filet supérieur est maintenant orange.
- Aucun changement fonctionnel dans Qualification, Sprint ou Analyzer.

## V6.0.3 — Accueil responsive et thème Endurance

- Ordre des cartes : Qualification, Sprint, Endurance, Analyzer.
- Accueil portrait : cartes affichées sur une seule colonne.
- Accueil paysage smartphone : quatre modes alignés sur une seule ligne.
- Bandeaux du mode Endurance passés à l’orange.
- Couleurs Qualification (rouge), Sprint (bleu) et Analyzer inchangées.

## V6.0.0 — Architecture quatre modes

- Accueil étendu à quatre cartes : Qualification, Sprint, Analyzer et Endurance.
- L’ancienne carte Endurance est renommée Analyzer avec une icône histogramme rouge.
- Nouvelle carte Endurance avec sablier rouge.
- Nouveau mode Endurance basé à l’identique sur Qualification, y compris les vues portrait, paysage et Focus.
- Ancien dashboard Endurance conservé sans perte sous le mode Analyzer.
- Cache PWA et version applicative synchronisés en V6.0.0.

## V5.5.13 — Synchronisation live accélérée

- Rafraîchissement de l'état affiché toutes les 250 ms au lieu d'une seconde.
- Protection contre les requêtes `/api/state` concurrentes afin d'éviter leur empilement.
- Désactivation du cache navigateur pour la récupération de l'état live.
- Conservation de la dernière donnée valide en cas d'erreur réseau ponctuelle.
- Cache PWA et version applicative synchronisés en V5.5.13.

V5.5.12: Smartphone paysage: +15% taille horloge; Sprint: couleur carte pilote le plus rapide alignée sur colonne Dernier (spécification).
## V5.5.11 — Rééquilibrage de la ligne 1 smartphone paysage

- Réduction de 30 % de la carte du pilote suivi en Qualification et Sprint paysage smartphone.
- Agrandissement de 30 % de la carte Temps/Tours.
- Conservation du centrage et de l'adaptation automatique du bloc Temps/Tours.
- Desktop, portrait et Endurance inchangés.
- Cache PWA et version synchronisés en V5.5.11.

## V5.5.9 — Centrage définitif du bloc Temps/Tours sur smartphone paysage

- Réinitialisation des anciennes positions absolues encore actives sur Safari iOS.
- Temps restant et nombre de tours regroupés dans un seul bloc Flex centré horizontalement et verticalement.
- Temps restant affiché 60 % plus grand que la taille de base commune.
- Nombre de tours lié à la même taille responsive afin que les deux informations s’adaptent ensemble.
- Ajustement JavaScript basé sur les dimensions réelles rendues pour éviter tout débordement.
- Aucun impact sur Desktop ni sur le mode portrait.
- Cache PWA et version synchronisés en V5.5.9.

## V5.5.8 — Bloc temps/tours réellement responsive sur iPhone paysage

- Correction des sélecteurs CSS : les classes réellement utilisées sont désormais ciblées.
- Temps restant et nombre de tours gérés comme un seul ensemble centré.
- Calcul JavaScript d’une taille de police commune adaptée à la largeur et à la hauteur disponibles.
- Réduction simultanée des deux valeurs pour garantir l’absence de débordement.
- Aucun libellé ajouté dans la case.
- Aucun impact sur Desktop ou sur le mode portrait.
- Cache PWA et version synchronisés en V5.5.8.

## V5.5.8 — Alignement des classements

- Suppression de la colonne MEILLEUR dans le classement Sprint sur smartphone en paysage.
- Conservation de la colonne ÉCART dans cette vue simplifiée.
- Correction des largeurs Desktop Sprint afin d'éviter tout chevauchement entre MEILLEUR, ÉCART et INTERVALLE.
- Positionnement de KART immédiatement après POS dans le classement Qualification Desktop.
- Centrage homogène des en-têtes et valeurs numériques en Qualification et Sprint Desktop.
- Cache PWA et version synchronisés en V5.5.8.
- Ajout de `docs/RANKING_ALIGNMENT_V5_5_6.md`.

## V5.5.5 — Classements Sprint responsive

- Nouvelle augmentation de 30 % des valeurs Temps/Tours, uniquement sur smartphone en paysage.
- Suppression de la colonne Intervalle dans le classement Sprint sur smartphone en paysage.
- Alignement du classement Sprint portrait sur le classement Qualification portrait : POS, KART, PILOTE, DERNIER, MEILLEUR et ÉCART.
- Aucun changement sur Desktop, Qualification portrait, Focus ou Endurance.
- Cache PWA et version synchronisés en V5.5.5.
- Ajout de `docs/SPRINT_RESPONSIVE_V5_5_5.md`.

## V5.5.4 — Polish Temps/Tours smartphone paysage

- Suppression du filet horizontal qui traversait visuellement la case Temps/Tours sur smartphone en paysage.
- Augmentation de 30 % de la taille des seules valeurs du temps restant et du nombre de tours.
- Ciblage limité aux écrans tactiles de largeur inférieure ou égale à 950 px en orientation paysage.
- Aucun changement sur Desktop, portrait, Focus ou Endurance.
- Cache PWA et version synchronisés en V5.5.4.
- Ajout de `docs/SMARTPHONE_LANDSCAPE_CLOCK_POLISH_V5_5_4.md`.

## V5.5.3 — Correction de la grille iPhone en paysage

- Correction du débordement horizontal de la première ligne sur les iPhone en paysage.
- Remplacement des largeurs minimales incompatibles avec les petits viewports CSS par cinq colonnes proportionnelles.
- La case Temps/Tours reste désormais entièrement visible dans l'écran.
- Centrage horizontal et vertical conservé dans les deux demi-cases.
- Aucun changement sur Desktop, portrait, Focus ou Endurance.
- Cache PWA et version synchronisés en V5.5.3.
- Ajout de `docs/IPHONE_LANDSCAPE_GRID_V5_5_3.md`.

## V5.5.2 — Correction du centrage sur iPhone en paysage

- Correction spécifique à Safari iOS du centrage du temps restant et du nombre de tours.
- Positionnement explicite des deux moitiés de la case sur les petits écrans en paysage.
- Aucun changement sur Desktop, Portrait, Focus ou Endurance.
- Cache PWA et version synchronisés en V5.5.2.
- Ajout de `docs/IPHONE_LANDSCAPE_CENTERING_V5_5_2.md`.

## V5.5.1 — Centrage temps et tours en paysage

- Centrage horizontal et vertical renforcé de la dernière case de la ligne supérieure en Qualification paysage.
- Même correction appliquée au mode Sprint paysage.
- Les deux valeurs, temps restant et nombre de tours, occupent chacune exactement la moitié de la case.
- Aucun impact sur les vues portrait, Focus, Endurance, les données Apex ou les calculs métier.
- Synchronisation de la version, du cache PWA, du README et du contrôle qualité.
- Ajout de `docs/LANDSCAPE_CLOCK_CENTERING_V5_5_1.md`.

## V5.5.0 — Audit qualité & certification

- Audit statique reproductible du Python, JavaScript, JSON, CSS et cache PWA.
- Ajout de `scripts/quality_check.py`, sans dépendance externe.
- Ajout de tests unitaires ciblés pour `RaceStateService`.
- Suppression de l’import `time` inutilisé dans `app.py`.
- Suppression des caches Python et fichiers compilés de l’archive GitHub.
- Synchronisation de la version, des en-têtes CSS, du README et du cache PWA.
- Ajout du rapport `docs/QUALITY_AUDIT_V5_5_0.md`.
- Aucun changement visuel, métier, API ou protocole Apex attendu.

## V5.4.1 — Modularisation métier du backend

- Création de `backend/services/race_state.py`.
- Extraction de la synchronisation du modèle Apex vers l’état KartIQ.
- Centralisation des historiques de tours, performances personnelles, passages Qualification et pénalités courantes.
- Extraction des calculs Qualification, Sprint, Endurance et du payload de l’API `/api/state`.
- Centralisation de la remise à zéro métier lors d’un changement de circuit.
- Réduction de `app.py` de 904 à 558 lignes.
- Conservation des routes, formats JSON, connexions Apex et comportements visibles.
- Mise à jour de la version, du cache PWA, du README et de la documentation.

## V5.4.0 — Fondations backend modulaires

- Création du package Python `backend/`.
- Déplacement de la configuration applicative et du chargement des circuits dans `backend/config.py`.
- Centralisation des journaux Apex et de la boîte noire dans `backend/logging_tools.py`.
- Déplacement de l'utilitaire réseau `local_ip()` dans `backend/network.py`.
- Conservation des mêmes routes, réponses JSON, fichiers de logs et comportements métier.
- Mise à jour de la version, du cache PWA, du README et de la documentation.
- Aucun changement visuel ou fonctionnel attendu.

## V5.3.3 — Cohérence des versions

- Ajout de `APP_VERSION` comme source unique de la version côté serveur.
- Injection de la version dans le HTML via Jinja pour le titre, le bandeau, l’accueil et les paramètres de cache.
- Synchronisation de `STATE["version"]` et du message de démarrage avec la même constante.
- Mise à jour explicite de la clé du cache PWA en `kartiq-v5-3-3`.
- Ajout d’un `.gitignore` adapté au projet.
- Correction de l’intitulé V5.3.1 dans l’historique.
- Aucun changement visuel ou métier attendu.

## V5.3.2 — Sources statiques unifiées

- Suppression des copies identiques à la racine (`index.html`, `manifest.json`, `assets/`, `fonts/`, `icons/`).
- Suppression du service worker racine inutilisé.
- `templates/index.html` et `static/` deviennent les sources uniques.
- Précache PWA complété avec les six modules CSS.
- Documentation ajoutée dans `docs/STATIC_SOURCES_V5_3_2.md`.
- Aucun changement visuel ou métier attendu.

## V5.3.1 — Consolidation CSS sûre

- Suppression de six règles CSS strictement identiques conservées en double.
- Nettoyage ciblé des feuilles Sprint paysage et Qualification portrait.
- Conservation systématique de la dernière occurrence afin de préserver la cascade.
- Aucun sélecteur réécrit et aucune valeur modifiée.
- Suppression des fichiers Python compilés (`__pycache__`, `.pyc`) de l’archive GitHub.
- Version, cache PWA et documentation synchronisés.

## V5.3.0 — Nettoyage CSS sûr

- Fusion des trois déclarations globales `:root` en une source unique, sans modifier les valeurs finales calculées.
- Conservation de la variable historique `--blue` et centralisation des variables typographiques.
- Suppression d’une déclaration CSS strictement identique de `#qualifTable .pos, #sprintTable .pos`, en conservant sa dernière occurrence dans la cascade.
- Aucun sélecteur réécrit et aucune règle potentiellement obsolète supprimée dans cette étape prudente.
- Synchronisation de la version, de la documentation et du cache PWA.

## V5.2.3 — Affichage orange du meilleur dernier tour Sprint

- Correction de la couleur blanche dans la case 🔥 en Sprint portrait, Sprint paysage et Focus Sprint.
- Ajout de la variable CSS `--orange`, utilisée lorsque le pilote le plus rapide du tour n’améliore pas son meilleur temps personnel.
- La logique reste : violet pour le meilleur temps absolu de session, vert pour une amélioration personnelle, orange sinon.

## V5.2.3 — Couleurs du meilleur dernier tour Sprint

- Dans la case avec la flamme, le chrono est orange lorsque le pilote n'améliore pas son meilleur temps personnel précédent.
- Le chrono devient vert lorsque le pilote améliore son meilleur temps personnel précédent.
- Le violet reste prioritaire lorsque le chrono correspond au meilleur temps absolu de la session.
- La même logique est appliquée au mode Sprint classique et au mode Focus Sprint.
- Le premier tour valide d'un pilote est considéré comme une amélioration personnelle.
- Mise à jour de la version et du cache PWA.

## V5.2.3 — Synchronisation du meilleur dernier tour Sprint

- La carte avec la flamme compare uniquement les pilotes ayant parcouru exactement le même nombre de tours que le pilote suivi.
- Le pilote et le chrono affichés appartiennent donc au même tour de course que le pilote suivi.
- La même règle est appliquée au mode Focus Sprint.
- Conservation de la couleur verte, sauf si le chrono correspond au meilleur temps absolu de la session.
- Mise à jour de la version et du cache PWA.

## V5.2.0 — Modularisation CSS

- Découpage de `static/css/kartiq.css` en six feuilles de style ordonnées.
- Conservation stricte de la cascade : aucune règle n’a été supprimée, réécrite ou déplacée hors de son ordre historique.
- `kartiq.css` devient le point d’entrée et importe les modules dans l’ordre attendu.
- Ajout des feuilles CSS au cache PWA et synchronisation de toutes les références de version.
- Ajout d’une documentation dédiée à l’architecture CSS et à sa règle de sécurité principale : ne jamais changer l’ordre des imports sans campagne de tests.

## V5.1.2 — Couleur conditionnelle du meilleur dernier tour Sprint

- Le chrono de la carte avec la flamme reste vert par défaut.
- Il devient violet uniquement lorsqu'il correspond au meilleur temps absolu de la session.
- Le correctif s'applique notamment à l'affichage Sprint en portrait.
- Mise à jour du cache PWA et des références de version.

## V5.1.1 — Correctif meilleur tour précédent en Sprint
- Correction du cartouche avec la flamme : le nom du pilote est de nouveau affiché.
- Le calcul compare désormais les chronos appartenant au même numéro de tour, au lieu de mélanger les dernières valeurs reçues ligne par ligne.
- Ajout d’un repli côté interface si Apex transmet temporairement le chrono avant le nom du pilote.
- Cache PWA actualisé.

## V5.1.1 — Architecture métier

- Réorganisation des scripts JavaScript par domaines fonctionnels.
- Création des dossiers `core`, `sprint`, `qualification`, `ui` et `endurance`.
- Conservation stricte du contenu et de l’ordre de chargement de la V5.0.2.
- Mise à jour du cache PWA et de toutes les références de version.
- Ajout de la documentation `docs/MODULES.md`.

## V5.0.2 — Correctif sélection du circuit

- Remplacement de la dépendance implicite à `window.circuitSelect` par une référence DOM explicite.
- Branchement explicite de l’événement `change` sur le sélecteur de circuit.
- Exposition de `changeCircuit` sur `window` pour conserver la compatibilité.
- Mise à jour du cache PWA afin de forcer le chargement du correctif.

## V5.0.2 — Modularisation JavaScript

- Découpage de `static/js/kartiq.js` en six fichiers thématiques chargés dans l’ordre historique.
- Conservation exacte du code JavaScript et de son ordre d’exécution : aucune logique métier modifiée.
- Modules créés : cœur/Apex, Sprint, Qualification, interface course, files Endurance et démarrage PWA.
- Mise à jour de la version affichée, de la version interne et du cache PWA.
- Préparation de la modularisation fonctionnelle plus fine sans introduire de modules ES.

## V5.0.1 — Foundation JavaScript

### Correctif de cohérence de version

- Version de la page d’accueil synchronisée en V5.0.1.
- Version interne de l’application synchronisée en 5.0.1.
- Paramètres de cache CSS et JavaScript synchronisés en 5.0.1.
- Cache PWA renouvelé pour forcer le chargement des fichiers corrigés.

- Extraction intégrale du JavaScript de `index.html` vers `static/js/kartiq.js`.
- Fonctions, variables globales et ordre d’exécution conservés sans modification.
- Aucun changement fonctionnel ou visuel attendu.
- Ajout du fichier JavaScript au cache PWA.
- Documentation d’architecture et de validation mise à jour.
- Version interne, titre, accueil et message de lancement mis à jour en V5.0.1.

## V5.0.0 — Foundation CSS

- Première étape de la refactorisation progressive de KartIQ.
- Extraction intégrale du CSS de `index.html` vers `static/css/kartiq.css`.
- Ordre et contenu des règles conservés afin de ne provoquer aucun changement visuel.
- Ajout de `docs/ARCHITECTURE.md` et `docs/VALIDATION_V5.md`.
- Version interne, page d’accueil, titre et cache PWA mis à jour en V5.0.0.
- Aucune logique JavaScript ou fonctionnalité métier modifiée.

## V4.9.1 — Endurance mobile pleine largeur

- Le Top 8 du rythme actuel tient désormais entièrement dans la largeur d’un smartphone.
- Les noms d’équipe trop longs sont tronqués proprement au lieu d’élargir la carte.
- Le tableau Quick Change conserve ses sept colonnes visibles sans défilement horizontal.
- Largeurs, tailles et espacements optimisés uniquement pour le mode Endurance mobile.
- Aucun changement sur la logique Apex, Qualification, Sprint ou les files de karts.
- Cache PWA mis à jour en V4.9.1.

## V4.9.0 — Files de karts Endurance

- Ajout d’une zone dynamique de redistribution sous le classement général et le Top 8 du mode Endurance.
- Gestion de 1, 2 ou 3 files.
- Ajout manuel de karts à chaque file avec le visuel RT10 fourni.
- Sélection d’un kart par clic, déplacement vers l’avant ou l’arrière, et retrait de la file.
- Mise en valeur du premier kart disponible de chaque file.
- Sauvegarde automatique des files dans le navigateur.
- Interface tactile et défilement horizontal adaptés au mobile.
- Cache PWA mis à jour en V4.9.0.

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
