# KartIQ V6.0.11 — Identité couleur des modes

Cette version conserve les deux filets horizontaux orange du mode Endurance et remet le séparateur vertical de la case Menu en gris, comme en Qualification et Sprint.

# KartIQ V6.0.5 — Endurance clone strict de Qualification

Cette version introduit les quatre accès **Qualification**, **Sprint**, **Endurance** et **Analyzer**.

- Qualification et Sprint restent inchangés.
- L’ancien dashboard Endurance devient **Analyzer**.
- Le nouveau mode **Endurance** reprend à l’identique l’interface Qualification sur Desktop, portrait, paysage et Focus.
- La synchronisation Apex et le countdown validé en V5.5.16 sont conservés.


Cette version réduit le délai d'affichage entre Apex Timing et KartIQ. L'état de course est désormais interrogé toutes les **250 ms** au lieu d'une seconde, avec une protection empêchant l'empilement de requêtes lorsque le réseau ou le serveur répond plus lentement.

Les modes Qualification et Sprint conservent leur design et leurs fonctionnalités actuels.

---

V5.5.12: Smartphone paysage: +15% taille horloge; Sprint: couleur carte pilote le plus rapide alignée sur colonne Dernier (spécification).
# KartIQ V5.5.11 — Rééquilibrage ligne 1 smartphone paysage

## Évolution V5.5.11

En Qualification et Sprint sur smartphone en mode paysage uniquement :

- la carte du pilote suivi est réduite de 30 % ;
- la carte Temps/Tours est agrandie de 30 % ;
- le bloc Temps/Tours reste centré et responsive ;
- aucun impact sur Desktop, portrait ou Endurance.

---

Application web d’analyse du live timing Apex Timing pour les modes Qualification, Sprint et Endurance.

## Correction V5.5.9

En Qualification et Sprint sur smartphone en paysage, le temps restant et le nombre de tours forment désormais un seul ensemble centré dans la case. Le temps est 60 % plus grand, tandis que les deux valeurs s’adaptent ensemble pour ne jamais déborder. Le Desktop et le portrait restent inchangés.

## V5.5.9

- Sprint smartphone paysage : suppression de la colonne MEILLEUR, avec ÉCART conservé.
- Sprint Desktop : largeurs corrigées pour empêcher le chevauchement de MEILLEUR, ÉCART et INTERVALLE.
- Qualification Desktop : KART placé juste après POS et numéros parfaitement centrés.
- Qualification et Sprint Desktop : toutes les données numériques sont centrées sous leurs colonnes.

Le détail se trouve dans `docs/RANKING_ALIGNMENT_V5_5_6.md`.

## V5.5.5

- Smartphone paysage : taille des valeurs Temps/Tours augmentée à nouveau de 30 %, sans impact Desktop.
- Sprint paysage smartphone : suppression de la colonne Intervalle du classement général.
- Sprint portrait : mêmes informations et même structure que le classement Qualification portrait (POS, KART si disponible, PILOTE, DERNIER, MEILLEUR, ÉCART).

Le détail se trouve dans `docs/SPRINT_RESPONSIVE_V5_5_5.md`.

## V5.5.4

Amélioration visuelle ciblée sur les smartphones en orientation paysage, dans les modes Qualification et Sprint :

- suppression du filet horizontal au milieu de la case Temps/Tours ;
- augmentation de 30 % de la taille du temps restant et du nombre de tours ;
- aucune modification des libellés ;
- aucun changement sur Desktop, portrait, Focus ou Endurance.

Le détail se trouve dans `docs/SMARTPHONE_LANDSCAPE_CLOCK_POLISH_V5_5_4.md`.

## V5.5.3

Correction spécifique à Safari iOS en mode paysage : la somme des anciennes largeurs minimales dépassait le viewport CSS de certains iPhone et repoussait la case Temps/Tours hors écran. La ligne supérieure utilise désormais une grille proportionnelle qui tient entièrement dans la largeur disponible.

Le détail se trouve dans `docs/IPHONE_LANDSCAPE_GRID_V5_5_3.md`.

## V5.5.2

Cette version corrige sur iPhone en mode paysage le centrage du temps restant et du nombre de tours dans les modes Qualification et Sprint. La correction utilise un positionnement explicite des deux moitiés de la case pour garantir un rendu identique dans Safari iOS.

Le détail se trouve dans `docs/IPHONE_LANDSCAPE_CENTERING_V5_5_2.md`.

## V5.5.1

Cette version apporte un ajustement visuel ciblé aux modes Qualification et Sprint en orientation paysage :

- centrage horizontal et vertical strict du temps restant ;
- centrage horizontal et vertical strict du nombre de tours ;
- ciblage limité à la dernière case de la première ligne ;
- aucun changement en mode portrait, Focus, Endurance ou dans la logique métier.

Le détail de la modification se trouve dans `docs/LANDSCAPE_CLOCK_CENTERING_V5_5_1.md`.

## V5.5.0

Cette version clôt la refactorisation V5 avec une validation technique reproductible :

- audit Python, JavaScript, JSON, CSS et PWA ;
- suppression d’un import Python devenu inutilisé ;
- tests unitaires des conversions fondamentales du service métier ;
- ajout de `scripts/quality_check.py` ;
- nettoyage des fichiers générés de l’archive GitHub ;
- synchronisation de la version et du cache PWA ;
- aucun changement visuel ou métier attendu.

Le rapport complet se trouve dans `docs/QUALITY_AUDIT_V5_5_0.md`.

## Lancement local

```bash
python3 app.py
```

KartIQ est ensuite disponible sur `http://127.0.0.1:8200`.

## Validation technique

```bash
python3 scripts/quality_check.py
python3 -m unittest discover -s tests -v
```

Le contrôle JavaScript est effectué automatiquement lorsque Node.js est installé.

## Structure

- `app.py` : serveur Flask, connexion Apex et routes HTTP ;
- `backend/services/race_state.py` : état métier et calculs Qualification, Sprint et Endurance ;
- `backend/config.py` : version, nom de release et catalogue des circuits ;
- `backend/logging_tools.py` : journaux Apex et boîte noire ;
- `backend/network.py` : utilitaires réseau ;
- `templates/index.html` : interface principale ;
- `static/css/` : feuilles de style modulaires ;
- `static/js/` : modules JavaScript par domaine ;
- `static/sw.js` : service worker PWA ;
- `config/circuits.json` : catalogue des circuits ;
- `scripts/quality_check.py` : validation statique du dépôt ;
- `tests/` : tests unitaires sans réseau ;
- `docs/` : documentation technique et historique des refactorisations.
## Ajustements V6.0.3

- Accueil ordonné : Qualification, Sprint, Endurance, Analyzer.
- Une colonne en portrait et quatre cartes sur une ligne en paysage mobile.
- Identité visuelle orange réservée au mode Endurance.


## Ajustements V6.0.5

- Le mode Endurance affiche directement la page Qualification validée.
- Les informations, le responsive portrait/paysage, le desktop et le Focus sont strictement identiques.
- Aucune personnalisation de couleur n’est appliquée au mode Endurance : il reprend strictement les couleurs de Qualification.
- Qualification et Sprint restent inchangés.


## V6.0.5 — Clone strict Endurance

Le mode Endurance affiche directement la page Qualification, avec les mêmes informations, mises en page, couleurs, filets et comportements en desktop, portrait, paysage et Focus. Aucune initiative graphique spécifique à Endurance n’est appliquée.
