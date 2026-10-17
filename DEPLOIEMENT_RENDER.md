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
