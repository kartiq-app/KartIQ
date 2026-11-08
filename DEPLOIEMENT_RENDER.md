V7.2.1880 — Focus Qualification/Sprint/Endurance : auto-sélection de Red Kronos et Brice N’Guessan (onze variantes) lors de l’arrivée des données LIVE, y compris si Focus est ouvert avant le départ. Sélection manuelle prioritaire, aucun changement des moteurs Apex, PIT, KV ou Recorder.

V7.2.1879 — Analyzer > Karts : le potentiel déjà calculé par le moteur KV serveur est affiché avec * si l’identité physique est provisoire. Les filtres et fenêtres de calcul restent inchangés ; aucun potentiel qualifié = aucune note kart. Base V7.2.1878.

V7.2.1878 — Karts : nettoyage des anciens Recorders VVCE (toutes générations) au démarrage et à l’activation KV. Un autre Recorder Session/KV/Lab ne sera pas interrompu automatiquement ; l’API fournit une explication pour le libérer. Aucun nouveau WebSocket concurrent ni modification du moteur KV.

V7.2.1877 — Suppression complète du classement virtuel VVCE. Collecte KV via Analyzer > Karts, sans VVCE; réutilisation d’un Recorder de Session Course si actif. Redémarrage Render : arrêt des anciens recorders VVCE, sans supprimer les archives SQL.

## V7.2.1876 — Note relais KV provisoire à partir de 2 tours propres
- Le moteur KV côté serveur exige désormais deux tours valides attribués au même relais avant de publier un rythme récent provisoire.
- Le potentiel kart qualifié conserve ses exigences de fenêtre >= 8 tours et la formule de score existante.
- L’onglet Analyzer Karts explicite le seuil et distingue collecte inactive, attente de tours et notes disponibles.
- La collecte et la traçabilité KV doivent déjà fonctionner : le changement de seuil ne crée pas de tours artificiels.
- Classement LIVE, VVCE, Focus Endurance, Spotter PIT et autres scores relais inchangés.

V7.2.1874 — VVCE HYBRIDE : estimation secondaire des pertes nettes aux stands depuis les tours/PIT du Recorder, vérification obligatoire des positions sur le LIVE Apex. Le résultat peut rester indisponible lorsque les tours individuels ou les écarts officiels ne peuvent pas être réconciliés. Les données du Recorder ne prouvent pas un temps absolu commun. Cache persistant SQL, calcul hors flux LIVE. Focus Endurance et Spotter inchangés.

V7.2.1871 — Garde-fou VVCE : interdiction d’attribuer le tour du leader aux équipes dont le numéro de tour est inconnu, invalidation des résultats v1870 et suspension explicite du classement lorsque les écarts Apex ne permettent pas une comparaison fiable. LIVE, PIT, KV et Spotter inchangés.

V7.2.1870 — VVCE LIVE initialisé au clic, projection basée sur les snapshots live et non sur la somme de tours historiques ; coût d’arrêt provisoire de 110 secondes tant que non mesuré, positions indicatives. Tableau à défilement stable, sans reconstruction du conteneur.

V7.2.1868 : déployer intégralement le ZIP sur GitHub/Render. La version et le cache du service worker ont été incrémentés. Vérifier une équipe en PIT dans Focus Endurance et Spotter ; sans compteur Apex, Spotter affiche « — ».

V7.2.1865 — VVCE SERVEUR : sélectionner Analyzer → CLASSEMENT VIRTUEL pour initialiser automatiquement la collecte secondaire. Le premier classement peut nécessiter un chargement historique ; les suivantes lisent immédiatement le dernier snapshot SQL. Affichage NON CERTIFIÉ si les tours ne sont pas horodatés sur une chronologie commune. Si aucune session Apex n'est identifiée, le classement ne démarre pas. Une collecte dédiée VVCE ne commence que sur action explicite, reste limitée à 30 h et s'arrête si le live ne fournit plus de messages pendant 15 minutes. Sur Render, DATABASE_URL est nécessaire à la persistance. Les résultats ne doivent pas être utilisés pour des décisions critiques avant validation sur plusieurs courses.

V7.2.1863 : le diagnostic VVCE apparaît sous le classement Analyzer (résultat ou raison de refus), sans altérer le LIVE.

## V7.2.1860

Classement virtuel sur maximum d’arrêts observés et minimum probable déduit des PITS Apex ; compteur PIT sans accélération visible. Voir CHANGELOG.md.

## V7.2.1858 — Vérification Spotter

Après déploiement, sélectionner MRK Agadir, configurer 3 files avec six karts puis lancer Spotter. Vérifier le basculement à l'interface live et la synchronisation Render. Aucun effacement du stockage navigateur ne doit être nécessaire.

## V7.2.1856 — Vérification Actua / Agadir

- Les états Quick Change sont isolés par circuit, dans le même espace Velocity.
- Les anciens états SQL sont migrés sans suppression uniquement si leur circuit correspond.
- La sélection d’une autre piste invalide l’état local temporaire et recharge ce circuit.
- Une écriture issue de l’ancien circuit est refusée ; le moteur KV et Apex restent inchangés.


## V7.2.1855 — Orchestration Suivi Karts résiliente (7 novembre 2026)

- Activation et relance KV envoyées directement à `POST /api/spotter-kv-tracking` : une lecture GET momentanément indisponible ne bloque plus la commande. Le serveur reste seul responsable de la détermination du run/circuit et de la création du Recorder.
- Synchronisation SQL du registre séparée de la collecte : dernier état conservé, statut SYNCHRONISÉ/EN RECONNEXION et relecture avec temporisation exponentielle jusqu'à 30 s en cas de panne.
- L'arrêt KV stoppe uniquement la collecte dédiée ; les traces physiques KV et leurs historiques ne passent plus automatiquement en TRACE INTERROMPUE. Une interruption de collecte ne prouve pas un changement de kart.
- Retour visible sur la commande serveur et nombre de notes calculées. Les formules de notation et le live Apex sont inchangés.
- Tests : 58 Python réussis / 8 ignorés. Les 5 échecs JS historiques de la V1853 restent inchangés. Tests ciblés de POST sans GET et d'arrêt sans destruction des traces passés. Vérification sur Render encore nécessaire.

## V7.2.1853 — Suivi KV : affichage état réel et commandes simplifiées

Dans le registre Karts, les actions Exporter historique KV, Archives KV et Nouvelle Course KV sont retirées de l’interface, sans supprimer leurs données ni les routes sous-jacentes. RELANCER LES NOTES confirme désormais explicitement la réponse du Recorder côté serveur et le nombre de notes KV existantes : aucune nouvelle note n’est promise si les tours du Recorder sont insuffisants ou non attribuables à un kart physique. Aucune formule KV, aucun mécanisme d’identité KV, aucun traitement des chronos live Apex modifié.

## V7.2.1852 — Relance notes KV sans relecture bloquante du registre

Le bouton RELANCER LES NOTES fonctionne quand le suivi est déjà actif, même si un GET du registre est momentanément indisponible. Le serveur sélectionne le registre courant. Ni reset KV, ni formule, ni moteur Apex modifiés. Ne pas changer le préfixe interne KV_TRACK_V1851 utilisé pour retrouver les Recorders démarrés sous V1851.


## V7.2.1851 — Suivi KV volontaire sans Session Course ni mode obligatoire

- Le bouton ACTIVER LE SUIVI lance explicitement un Recorder KV léger déjà existant sur le serveur (réutilisation du moteur Recorder Apex), sans créer de Session Course.
- Aucune sélection Kart fixe / Quick Change obligatoire. Les formules `spotter_kv_scores.py` restent inchangées.
- Les chronos historiques backfill sans horodatage de passage ne servent pas à attribuer des notes KV.
- Les affectations provisoires restent marquées comme provisoires et les historiques restent intacts.
- Un arrêt du suivi arrête le Recorder KV dédié mais jamais une Session Course.
- Démarrage refusé si un autre Recorder utilise déjà le même circuit, pour éviter un double flux.
- Collecte limitée à la durée de sécurité `VELOCITY_RECORDER_MAX_HOURS` (30 heures par défaut).
- Sur Render, PostgreSQL persistant reste nécessaire. Pas de calcul KV autonome sans activation explicite.

## V7.2.1849 — Focus invité à distance (aucun nouvel accès requis)

La migration de la table `velocity_access_focus_control` (présence/commande isolées par identifiant d’invitation) est créée automatiquement à l'initialisation de `RecorderStore` sur Render PostgreSQL. Pas de variable d'environnement supplémentaire. Aucun lien d'accès V1848 existant n'est révoqué par le déploiement. Les utilisateurs doivent actualiser/recharger Velocity pour recevoir le code V1849 ; l'écran Focus doit rester ouvert et la connexion active pour une commande à distance. Le serveur refuse un changement d'équipe si la présence Focus a expiré (> 40 s). Le live Apex et le Recorder ne sont pas modifiés.

## Urgence V7.2.1816 — Correction de la page HTTP 500

1. Redéployer **tous les fichiers V1816** ; ne pas redéployer le `app.py` défectueux de la V1815.
2. **Conserver la base PostgreSQL et les variables d’environnement Render.** Aucune table à vider, aucune migration SQL à déclencher manuellement.
3. Vérifier dans les logs Render que Gunicorn démarre, puis que `GET /` répond HTTP 200 (et non 500).
4. Rafraîchir ordinateur et iPhone ; la Home doit afficher **V7.2.1816**. Le cache PWA passe de `v7-2-1815` à `v7-2-1816`.
5. Tester successivement l’ouverture d’Analyzer, de Spotter, du registre KV et le chargement des espaces partagés, **hors course active**.
6. Si le 500 persiste, relever **le traceback exact** de Render (`Logs`) ; ne pas effacer PostgreSQL ni réinitialiser le Quick Change.

Cette version restaure le code manquant mais ne remplace pas la validation finale de la synchronisation sur Render.

## V7.2.1815 — Déploiement prudent (stabilisation Analyzer / Spotter)

1. Effectuer un export du registre KV actif et une sauvegarde PostgreSQL avant déploiement. Conserver l'archive V1814 comme retour arrière **code uniquement** (les données PostgreSQL ne sont jamais automatiquement restaurées par un redéploiement GitHub).
2. Déployer tous les fichiers de l'archive sur GitHub. Conserver `DATABASE_URL`, `VELOCITY_SESSION_SECRET` et le démarrage Gunicorn existants. Aucune table n'est supprimée ni recréée ; les colonnes SQL existantes suffisent.
3. Rafraîchir les navigateurs ordinateur et smartphone pour vérifier la version **V7.2.1815**. Un client V1814 encore ouvert ne peut plus réécrire le registre car il ne transmet pas la révision KV attendue ; il doit être rechargé.
4. En **simulation sur la même Session Velocity**, vérifier : (a) arrivée kart, (b) deux validations proches sur deux appareils, (c) retour `Pas de Quick Change`, (d) NOTE identique pour le même KV après synchronisation (< 3–6 s), (e) retour de l'état serveur après conflit, (f) export/archives et changement de course.
5. Si le serveur rejette un snapshot incohérent (`422`), ne pas forcer un reset pendant une course : exporter le contexte, repérer les duplications KV/cartes et comparer à l'état serveur. Le refus empêche l'écriture d'une incohérence.
6. En cas de conflit de registre (`409`), l'ancien client conserve un JSON local de secours dans son navigateur, mais son écriture n'est pas acceptée ; le serveur reste autoritaire et son dernier registre doit être relu.

**Tests disponibles :** `python -m unittest discover -s tests -p 'test_*.py'` et `node tests/test_stabilisation_v1815.js`. Les tests réels Render/PostgreSQL + Apex restent indispensables avant une endurance.

## V7.2.1814 — Réinitialisation fiable de « Nouvelle course KV »

- Les anciennes courses restent archivées séparément dans PostgreSQL. Ne pas supprimer ou réinitialiser le stockage.
- Nouveau contrôle visuel après « NOUVELLE COURSE KV » : message de confirmation et **0 KV** tant qu'aucun événement Spotter n'a créé de nouvelle affectation physique.
- Le Quick Change existant **n'est pas effacé** par cette commande. Pour une course entièrement nouvelle, configurer séparément le Quick Change.
- Cache Chrome/iPhone invalidé par version de service worker.
- Tests : `node tests/test_registry_new_course_v1814.js` et tests des versions antérieures.
- Aucun test de déploiement sur Render de production dans cet environnement. Vérifier après mise en ligne le nouveau numéro de version et le comportement du bouton avant une course.

## V7.2.1813 — Registre KV stable, inspiré de V1799

Le registre garde les lignes visibles pendant l'actualisation et ignore une réponse serveur vide/incomplète pour la **même course**. Une course différente doit être identifiée explicitement : nouvelle Session Course, changement de circuit par `/api/circuit`, ou bouton **NOUVELLE COURSE KV**. Un worker Render ne peut plus vider les KV par une simple lecture de son circuit périmé.

Tests locaux :

```bash
python -m unittest discover -s tests -p 'test_registry*.py'
node tests/test_registry_simple_v1813.js
node tests/test_registry_live_v1810.js
node tests/test_registry_layout_v1809.js
node tests/test_registry_no_flicker_v1812.js
node tests/test_registry_client_scope_v1811.js
```

Aucune migration destructrice : les tables PostgreSQL, archives KV et historiques sont conservés. Le premier test sur Render doit vérifier un registre de 14+ KV ouvert pendant plusieurs minutes puis l'ouverture sur un second appareil, ainsi qu'une nouvelle course explicite. Ne pas réinitialiser le registre pendant une course active.

## V7.2.1812 — Contrôle anti-clignotement du registre KV

- Sauvegarder/exporter les historiques existants avant déploiement, notamment si V1811 a créé plusieurs archives à la suite d’alternances de titres Apex.
- Déployer avec le même `DATABASE_URL` PostgreSQL. Aucun changement de schéma SQL.
- Le registre de la course active ne tourne plus sur le titre `title1/title2`; une nouvelle course sur le **même** circuit nécessite une nouvelle Session Course ou le bouton **NOUVELLE COURSE KV**.
- Vérifier que le registre ne passe plus de N/N à 0/0 quand Spotter synchronise les files et lorsque `title1/title2` alternent.
- Le contenu vidé ou déjà archivé par V1811 n’est pas automatiquement réinjecté dans le registre courant, afin d’éviter une contamination entre courses. Utiliser ARCHIVES KV pour récupérer les données anciennes.
- Tests: `python -m unittest discover -s tests -p 'test_registry_isolation_v1811.py'`, `python -m unittest discover -s tests -p 'test_registry_stability_v1812.py'`, `node tests/test_registry_no_flicker_v1812.js`.

# Déploiement Render — Velocity

Le Web Service Velocity est prévu en **Starter** avec un seul worker Gunicorn et plusieurs threads.

## Data Recorder — stockage persistant obligatoire pour une longue course

Le Recorder fonctionne localement avec SQLite pour les essais, mais le disque local d’un Web Service Render n’est pas la source de stockage à utiliser pour une course de 24 heures.

1. Créer une base **Render Postgres** dans le même workspace.
2. Ajouter au Web Service Velocity la variable d’environnement `DATABASE_URL` avec l’URL interne de cette base.
3. Redéployer Velocity.
4. Ouvrir **Analyzer → VELOCITY LAB → DATA RECORDER** et vérifier que le badge indique **STOCKAGE : RENDER POSTGRES**.
5. Ne lancer une collecte 24 h que lorsque ce badge indique un stockage persistant.

Les Recorders actifs sont enregistrés en base. Après un redémarrage du service, Velocity tente automatiquement de les reconnecter à Apex et recharge l’historique nécessaire au suivi des scores.


## V7.2.1808 — tests de synchronisation multi-appareils

1. Vérifier `DATABASE_URL` (Postgres partagé) et `VELOCITY_SESSION_SECRET` (secret stable identique sur tous les processus et déploiements). Ne jamais employer une clé Flask régénérée à chaque démarrage pour partager les cookies de connexion.
2. Sauvegarder/exporter l'état de course avant le premier déploiement V1808. Les snapshots Spotter existants restent en base ; les nouveaux schémas sont créés sans DROP.
3. Déployer l'archive complète. Sur le Mac et l'iPhone, recharger la PWA pour obtenir V7.2.1808 ; le cache service worker est invalidé.
4. Si le téléphone est un appareil de Team associé avant V1808, ouvrir **Sessions/Team → membre concerné → SYNCHRONISER APPAREILS** sur le compte autorisé. Actualiser ensuite la page du téléphone. Les nouveaux appairages héritent automatiquement du même ESPACE.
5. Ouvrir Spotter des deux côtés : vérifier **ESPACE identique**, stockage Render/Postgres, et numéro de révision `R` qui progresse après une action. Si l'un affiche `LEGACY`, l'appairage à l'espace n'est pas prêt : ne pas lancer une course en mode multi-appareils.
6. En simulation : ajouter un entrant depuis le mobile, valider la file depuis le PC, vérifier absence de doublon ; puis inverser les appareils. Tester aussi le RESET et le retour aux réglages sur les deux appareils.
7. Tester deux validations quasi simultanées (deux entrants différents), puis le redémarrage du navigateur et de Render. Les anciennes versions sauvegardées se lisent sans suppression.
8. Contrôler les messages **ESPACE / R / synchronisation** ; si des identifiants diffèrent, consulter les droits d'appairage, le circuit sélectionné et les logs Render.

Tests hors Render : `python tests/test_spotter_sql_v1808.py` et `node tests/test_spotter_rebase_v1808.js`.

**Limites connues :** sans flux Apex réel ni accès au service Render de production, le comportement de bout en bout sur deux appareils n'a pas été démontré ici. En cas de panne persistante ou d'état incompatiblement hérité, ne pas supprimer les données SQL sans export préalable.

## V7.2.1811 — Registre KV séparé par course

1. **Avant le déploiement**, exporter l'historique KV de la V1810 et conserver une sauvegarde PostgreSQL. Ne pas réinitialiser les files d'une course en cours uniquement pour tester l'archive.
2. Déployer la V1811 avec `DATABASE_URL` pointant vers **le même PostgreSQL Render** que V1810. Les nouvelles tables sont créées automatiquement ; l'ancienne `velocity_spotter_shared_registry` n'est pas détruite.
3. Au premier chargement de « SUIVI KARTS », l'ancien registre V1810 est **archivé, même s'il contient plusieurs courses mélangées**. Le registre de la course active repart sans l'ancien historique : ce comportement est intentionnel pour éviter de fausses affectations.
4. Pour retrouver les données antérieures, cliquer **ARCHIVES KV** dans le registre. L'export ZIP contient un JSON par ancien contexte et l'index des courses.
5. Pour des courses successives sur le même circuit avec des noms Apex différents, la nouvelle course reçoit automatiquement un identifiant distinct. Une Session Course différente provoque également une séparation.
6. **Cas particulier :** sans Session Course et si Apex réutilise exactement le même titre pour deux courses, cliquer **NOUVELLE COURSE KV** au démarrage de la suivante. Cela archive le registre sans toucher aux files ; vérifier séparément le Quick Change et ses affectations physiques.
7. Vérifier la séparation sur deux tests successifs (équipe A sur KV01 lors du test 1, équipe B sur KV01 lors du test 2), puis l'export des archives. Sur deux appareils, recharger V1811 des deux côtés : un ancien navigateur ne doit pas être autorisé à republier un registre de la course précédente.
8. Important : si le Quick Change ou les affectations physiques ont été conservés d'une course antérieure, **les revalider/reconfigurer séparément** ; l'isolation des historiques ne garantit pas la justesse d'une identité physique réutilisée.

Tests locaux : `python -m unittest discover -s tests -p 'test_registry_isolation_v1811.py'` et `node tests/test_registry_client_scope_v1811.js`.
