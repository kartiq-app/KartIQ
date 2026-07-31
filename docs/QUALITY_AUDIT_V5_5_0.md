# Audit qualité et certification — KartIQ V5.5.0

## Périmètre

La V5.5.0 clôt la phase de refactorisation V5 par une revue reproductible du dépôt. Elle ne modifie ni les calculs métier, ni les routes HTTP, ni le protocole Apex, ni l’interface.

## Corrections sûres appliquées

- suppression de l’import Python `time` devenu inutilisé dans `app.py` ;
- suppression des dossiers `__pycache__` et fichiers compilés de l’archive ;
- synchronisation de la version, des en-têtes CSS et du cache PWA ;
- ajout d’un contrôle qualité exécutable avec la bibliothèque standard ;
- ajout de tests unitaires ciblés sur les conversions fondamentales du service métier.

## Contrôles automatisés

La commande suivante vérifie le dépôt :

```bash
python3 scripts/quality_check.py
```

Elle contrôle :

- la syntaxe de tous les fichiers Python ;
- la validité des fichiers JSON ;
- la syntaxe JavaScript lorsque Node.js est disponible ;
- l’existence et l’ordre des modules CSS ;
- l’équilibre des accolades CSS ;
- la présence de toutes les ressources précachées par la PWA ;
- la cohérence de la version ;
- l’absence de caches et de fichiers Python compilés.

Les tests métier sans réseau se lancent avec :

```bash
python3 -m unittest discover -s tests -v
```

## Résultats de l’audit

- Python : syntaxe valide ; un import réellement inutilisé supprimé.
- JavaScript : syntaxe valide sur les six modules et le service worker.
- JSON : catalogue des circuits et manifest valides.
- CSS : point d’entrée valide, six modules présents, accolades équilibrées.
- PWA : toutes les ressources déclarées existent.
- Architecture : séparation frontend, backend de fondation et service métier opérationnelle.
- Archive : aucune ressource générée ou cache Python inclus.

## Limites de la certification

Cette certification est une validation statique et unitaire. Elle ne remplace pas un test pendant un live Apex actif, ni les validations visuelles sur iPhone en portrait, paysage et mode Focus. La connexion réelle dépend également du serveur et du format transmis par chaque circuit.

## État de la dette technique

La dette restante est faible et non bloquante. Les principales améliorations futures devront être réalisées au fil des nouvelles fonctionnalités plutôt que par une nouvelle refactorisation générale :

- tests de payloads à partir de captures Apex réelles ;
- réduction progressive des dépendances globales JavaScript ;
- consolidation CSS uniquement lorsqu’un composant est fonctionnellement modifié ;
- séparation supplémentaire des routes HTTP si leur nombre augmente fortement.

La V5.5.0 constitue ainsi la base stable de fin de cycle V5.
