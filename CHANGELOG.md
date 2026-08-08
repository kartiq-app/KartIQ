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