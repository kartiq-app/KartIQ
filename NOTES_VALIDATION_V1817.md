# Plan de validation V7.2.1817

Cette version consolide la V1816 : prise en compte de nouveaux événements KV concurrents et affichage provisoire explicite du potentiel jusqu'à récupération du référentiel partagé. Les tests locaux SQLite et Node passent ; les écritures de production PostgreSQL et le fonctionnement sur deux appareils réels ne sont pas validés.

## Contrôles prioritaires à réaliser sur Render

- Même ESPACE, même course et même epoch Analyzer sur PC et smartphone.
- Validation simultanée du même entrant depuis deux navigateurs : une seule réservation, et retour visible d'un éventuel conflit.
- Pas de Quick Change : après sortie Apex le KV de l'équipe doit redevenir `track`.
- Registre KV : aucun ancien navigateur ne réécrit une fiche plus récente ; en cas de 409, la copie locale est préservée mais non réappliquée.
- Analyzer → KARTS et registre : même note KV après récupération du registre partagé ; les LIVE non identifiés sont distincts.
- Passage à une deuxième course : aucun KV/historique de la première course dans la seconde ; archives conservées.
- Reconnexion/réouverture du navigateur, interruption réseau, redéploiement Render : contrôle des compteurs, identités et reprises de notes.

## Non couvert par cette version

- Remplacement intégral de tous les snapshots par des commandes métier transactionnelles.
- Stockage append-only complet des mouvements (les passages KV ne sont plus tronqués dans le registre courant, mais d'autres journaux le sont).
- Contrôle exhaustif des équipes Recorder et datation fiable des tours backfillés.
- Refonte de l'index temporel du Score Relais : la comparaison par tour reste inchangée.
- Garantie de conservation complète des marqueurs et fenêtres Analyzer après redémarrage serveur.

## Scénarios spécifiques V1817

1. Deux appareils ouvrent le même registre/révision. A ajoute un passage sur KV01 ; B ajoute un passage sur KV02. Les deux doivent être enregistrés.
2. Un appareil tardif envoie un ancien score KV01 et un NOUVEAU passage KV01 : seul le nouveau passage est ajouté, l'ancien score ne remplace pas le score serveur.
3. Deux appareils ajoutent chacun un KV différent avant le premier relais : les deux nouvelles fiches restent enregistrées.
4. Une retransmission du même passage ne crée pas de doublon.
5. Après un changement de course, aucune écriture sur l'ancien `run_id` n'est acceptée.
6. Avant le premier GET valide du registre, Analyzer affiche les KV locaux éventuels uniquement sous la mention « RÉF. EN CHARGEMENT » ; Spotter ne leur attribue pas de couleur officielle. Après GET valide, les scores deviennent identiques à référentiel partagé identique.
7. Home, Analyzer, Spotter, registre et Lab doivent charger sans 500 sur Render après déploiement (test réel à effectuer).

Attention : les modifications concurrentes des attributs d'une MÊME fiche KV (hors nouveaux passages) ne sont pas fusionnées aveuglément. Le serveur reste autoritaire pour éviter les régressions de score et statut. Une architecture de commandes métier transactionnelles sera nécessaire pour garantir tous les mouvements multi-appareils.
