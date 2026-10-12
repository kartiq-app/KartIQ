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
