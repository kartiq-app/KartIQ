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
