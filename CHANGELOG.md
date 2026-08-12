# Velocity V7.2.176 — Focus Endurance + stabilité déploiement Chrome

- Focus Endurance iPhone : dernier tour réellement agrandi (~30 %) avec case basse élargie/haussée et marge de sécurité.
- Les modules CSS sont chargés directement avec `?v={{ app_version }}` : suppression des `@import` non versionnés qui pouvaient conserver un ancien Focus en cache.
- Desktop : arrêt de l’enregistrement du Service Worker et retrait différé des anciennes registrations.
- PWA/standalone mobile : Service Worker conservé, sans préchargement massif des assets pendant le déploiement.
- Objectif : supprimer le mélange ancienne/nouvelle version lors des déploiements et éviter le crash renderer Chrome observé.
