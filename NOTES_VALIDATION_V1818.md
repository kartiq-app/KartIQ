# V7.2.1818 — Validation avant exploitation en course

1. Sans registre historique KV, ouvrir Spotter → SUIVI KARTS : toutes les équipes du live Apex sont visibles avec `KV —`, KART APEX, TOURS, EN PISTE, DERNIER. Le nombre de lignes peut évoluer avec le plateau live, sans écriture de KV en PostgreSQL.
2. En présence d’au moins deux équipes avec tours valides, vérifier que les estimations LIVE* apparaissent sur les lignes non identifiées, sans créer de KV ; puis affecter/valider physiquement un KV dans Spotter : vérifier que l'équipe apparaît sur la ligne KV correspondante, sans ligne LIVE en doublon.
3. Observer un premier tour valide : `REC` et une `NOTE KART*` provisoire apparaissent selon les observations disponibles ; POT complet reste vide jusqu'à huit tours exploitables.
4. Après huit tours valides, comparer la NOTE KART du classement Analyzer et du registre KV sur deux appareils dans le même espace/circuit et à la même révision.
5. Changer de machine : l'équipe conserve son numéro Apex mais reçoit le vrai KV seulement après confirmation Spotter ; l'ancien potentiel n'est pas attribué au nouveau kart.
6. Faire une entrée, une validation Quick Change, une sortie sans Quick Change, puis un reset : vérifier intégrité des files/assignations et historiques sur les deux appareils.
7. Vérifier le classement GENERAL et VIRTUEL ; la note de relais Velocity n'est pas affichée à la place de la NOTE KART.
8. Ne pas conclure à une synchronisation temps réel totalement validée avant un essai sur Render avec PostgreSQL et flux Apex réel. Sauvegarder la base PostgreSQL avant déploiement.
