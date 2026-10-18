# Plan de validation V7.2.1815

Cette version livre une première vague de stabilisation P0 du rapport d'audit. Les garanties prouvées sont locales, via SQL SQLite représentatif des requêtes CAS et JavaScript Node.

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
