# Velocity V7.2.181

- Test A/B stabilité Chrome Desktop : neutralisation complète sur Desktop de la persistance/restauration/watchdog des modes Focus.
- Aucun traitement d'orientation Focus n'est exécuté sur Desktop.
- iPhone conserve le paysage virtuel et Android conserve son verrouillage paysage existant.
- Aucun changement visuel ou fonctionnel du Focus Endurance iPhone validé en V7.2.180.

# Velocity V7.2.178 — Réalignement Focus Endurance iPhone

- Focus Endurance iPhone : la case **Temps en piste** retrouve exactement la même largeur que la case **Position**.
- La colonne droite **Dernier tour** retrouve donc la même largeur que la colonne **Delta**, comme sur la référence V7.2.173.
- Conservation de la taille réduite du chrono de dernier tour introduite en V7.2.177.

# Velocity V7.2.178 — Rééquilibrage Focus Endurance iPhone

- Dernier tour : taille réduite de 20 % par rapport à la V7.2.176.
- Zone Delta : retour à la proportion 60/40 précédente.
- Conservation du mécanisme de chargement CSS versionné de la V7.2.176.

# Velocity V7.2.176 — Focus Endurance + stabilité déploiement Chrome

- Focus Endurance iPhone : dernier tour réellement agrandi (~30 %) avec case basse élargie/haussée et marge de sécurité.
- Les modules CSS sont chargés directement avec `?v={{ app_version }}` : suppression des `@import` non versionnés qui pouvaient conserver un ancien Focus en cache.
- Desktop : arrêt de l’enregistrement du Service Worker et retrait différé des anciennes registrations.
- PWA/standalone mobile : Service Worker conservé, sans préchargement massif des assets pendant le déploiement.
- Objectif : supprimer le mélange ancienne/nouvelle version lors des déploiements et éviter le crash renderer Chrome observé.
