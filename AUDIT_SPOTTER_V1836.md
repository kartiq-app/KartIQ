# Velocity V7.2.1836 — Audit technique et consolidation Spotter / Suivi KV

**Périmètre analysé :** V1835, historique des changements V1829–V1834, `app.py`, `data_recorder.py`, `spotter_registry_scope.py`, `backend/services/kart_scoring_scope.py`, `backend/services/spotter_kv_scores.py`, `static/js/core/core.js`, `static/js/spotter/spotter.js`. Audit **statique et tests automatisés**, sans preuve de fonctionnement en production Render/Apex.

## 1. Constat : les superpositions effectivement retrouvées

| Élément | Ancienne organisation | Modification V1836 |
|---|---|---|
| Identité de course / epoch | Course KV dans le registre SQL, epoch des notes dans `STATE` mémoire Render, renouvelé au redémarrage / sélection de circuit | **Un seul run_id SQL**, utilisé également comme epoch ; mode kart stocké dans `velocity_kart_scoring_scope` |
| Création de course | `/api/kart-setup` et `/api/spotter-registry/new-course` agissaient indépendamment | Rotation unique de course + epoch, archivage du registre et maintien du mode sélectionné |
| Fabrication des notes KV | Profils navigateur + plusieurs estimations LIVE / STATS + écriture depuis le navigateur | Un chemin officiel : **Recorder serveur → données observées → SQL → Spotter lecture seule** |
| Historique de notes | Risque d'écrasement lors des synchronisations navigateur/serveur | Les mises à jour navigateur ne peuvent plus remplacer les champs de scores `server-recorder` ni les notes historiques correspondantes |
| Relais / identités | Risque de réutilisation de chronos de l'équipe précédente | Attribution selon les intervalles de l'historique KV, et seulement aux identités explicitement observées ; Quick Change physique jamais déduit du seul numéro Apex |
| Affichage TOURS | Valeur Apex parfois nulle ou absente | Nombre de tours du relais provenant du score Recorder, lorsqu'il existe ; sinon affichage prudent |
| Redémarrage Render | `STATE` en mémoire propre à chaque processus | Identité de course et mode persistés ; les notes enregistrées sont rechargées en SQL |
| Backfill Apex | Heure de récupération prise par erreur pour heure de tour possible | Colonne SQL `origin`, `live` / `backfill` : les tours historiques sans heure réelle ne sont pas affectés artificiellement à un KV/relai |

## 2. Architecture après nettoyage

1. **Apex Timing** reste la source prioritaire des chronos et du classement. La réception WebSocket et le moteur de classement live ne sont pas réécrits.
2. Une **Session Course active** démarre et maintient le Recorder de Render. Le worker de score du Recorder calcule les données complémentaires sur son thread dédié (aucun calcul KV depuis `/api/state` ou le callback WebSocket).
3. Le **registre SQL** contient la chronologie KV et les notes produites par le Recorder. Le `run_id` du registre est également l'epoch des notes : nouvelle course = nouvel epoch.
4. Le **Spotter navigateur** affiche, propose des affectations / événements Quick Change manuels et sauvegarde leurs modifications de registre. Il ne fabrique plus les notes KV et ne peut pas les écraser.
5. Deux notes métier distinctes restent prévues : **potentiel du kart** (meilleur rythme démontré sur une fenêtre qualifiée) et **note du relais courant** (rythme de la fenêtre récente). Aucun malus de régularité. Les anciennes notes de relais restent figées.

## 3. Sémantique des données et limites

- Un KV créé automatiquement à partir du live est **provisoire** : le score peut évoluer mais ne constitue pas la preuve d'identité d'un kart physique. Confirmation / Quick Change requises pour un historique physique fiable.
- Le score Recorder s'appuie sur des **tours valides enregistrés**. Une estimation provisoire peut apparaître avant que 8 tours permettent un potentiel qualifié. Aucune note ne doit être inventée à partir d'un chrono de classement isolé.
- La précision de l'historique Apex est limitée : **les tours historiques backfillés n'ont pas d'heure de passage absolue**, ils sont exclus de l'affectation KV et peuvent réduire la couverture des notes après coupure. Les tours effectivement reçus en live et persistés restent exploitables après redémarrage.
- Les tours historiques déjà enregistrés dans les anciennes bases avant V1836 reçoivent `origin='legacy'` : leur provenance n'est pas reconstruite artificiellement. Un démarrage de course propre après déploiement minimise cette ambiguïté.
- L'application suppose **une base PostgreSQL Render partagée et persistante** (ou SQLite durable en local) et une Session Course active avec Recorder. Le système ne collecte ni ne note une course hors session active.
- La première mise en production de V1836 peut exiger de **rechoisir le mode Kart fixe / Quick Change** : les choix de mode anciens exclusivement en RAM ne sont pas migrables de manière sûre. L'interface doit afficher un diagnostic lorsque le mode n'est pas sélectionné.
- Un redéploiement n'archive PAS automatiquement une course ; le bouton **NOUVELLE COURSE KV** en crée une nouvelle. Ne pas cliquer dessus pour simplement reprendre une session après redéploiement.
- Une race KV démarrée sans Recorder actif ne produit pas de notes serveur, même si le live Apex est visible. C'est intentionnel, pour respecter l'interdiction de collecte hors Session Course active.

## 4. Contrôles et tests

- **48 tests Python réussis** dans `python -m pytest -q tests` : stockage SQL, rotation de course, perte de connexion/reprise SQL simulée, protection des scores, isolation des relais, notes produites sans navigateur, fin de session, provenance backfill.
- **5 scripts de tests JavaScript réussis** : `test_registry_client_scope_v1811.js`, `test_registry_no_flicker_v1812.js`, `test_registry_simple_v1813.js`, `test_spotter_rebase_v1808.js`, `test_sql_authoritative_kv_v1836.js`.
- **5 tests historiques JavaScript non verts** : `test_live_kart_registry_v1818.js`, `test_registry_layout_v1809.js`, `test_registry_live_v1810.js`, `test_registry_new_course_v1814.js`, `test_stabilisation_v1815.js` ; les quatre premiers échouaient déjà avant consolidation, et le dernier teste des comportements de calcul navigateur supprimés en V1836. Les maintenir dans le dépôt afin de pouvoir les adapter aux nouvelles interfaces ; ne pas interpréter ces échecs comme une validation complète.
- Contrôles de syntaxe Python + JS effectués. **Aucun essai réel sur Render, Apex live ou un mobile 4G** : validation sur une Session Course de test requise avant endurance réelle.

## 5. Validation recommandée avant course réelle

1. Déployer en environnement de test avec PostgreSQL persistant, ouvrir une Session Course ; sélectionner une fois **Kart fixe** ou **Quick Change**.
2. Laisser le Recorder acquérir 8 à 12 tours valides par équipe, puis vérifier NOTE KART, NOTE RELAIS et TOURS, sur **deux navigateurs**.
3. Fermer **tous** les navigateurs pendant plusieurs tours : vérifier à la réouverture la persistance des notes et des relais sans attendre un calcul local.
4. Simuler redéploiement Render : confirmer **même run_id**, mêmes scores et continuité de l'enregistrement.
5. Faire un vrai Quick Change confirmé : vérifier le basculement d'identité et le gel de l'ancien score de relais.
6. Cliquer **NOUVELLE COURSE KV** en test : vérifier que notes et tours antérieurs ne reviennent pas et que le Recorder produit progressivement les nouvelles notes.
7. Contrôler sur 4G que **chronos/classement Apex** ne gagnent aucune latence. Cette contrainte est prioritaire sur les scores.

## 6. Travail encore distinct de cette consolidation

- Adapter l'ancienne suite JavaScript aux contrats SQL actuels ; surveiller la console sur navigateurs et la charge Postgres.
- Vérifier en production la corrélation `workspace_id` / Session Course / Recorder sur toutes les combinaisons de circuits et de sessions.
- Les modules Spotter de files, entrées/sorties, maintenance, radar et partage de l'état n'ont pas été supprimés : ils répondent à des fonctionnalités différentes. Le nettoyage s'est concentré sur les **redondances de notation et de portée de course** afin de limiter les régressions.

**Conclusion :** consolidation fonctionnelle majeure, pas une preuve que la totalité de la dette technique de l'application est éliminée. Toutes les décisions liées à l'identité physique restent à valider avec les événements terrain.
