# Nettoyage CSS sûr — KartIQ V5.3.0

Cette version réalise uniquement des consolidations dont l’équivalence de cascade peut être démontrée.

## Changements réalisés

1. Les trois blocs `:root` globaux ont été fusionnés. Les valeurs retenues sont exactement celles qui gagnaient déjà dans la cascade V5.2.3. La variable `--blue`, définie uniquement dans le premier bloc historique, a été conservée.
2. Les variables `--font-time` et `--font-driver` sont désormais dans la même source globale.
3. Une occurrence antérieure strictement identique de la règle `#qualifTable .pos, #sprintTable .pos { font-size: 38px; }` a été supprimée. La dernière occurrence, qui déterminait déjà le résultat final, est conservée.

## Ce qui n’a volontairement pas été fait

- aucune suppression de CSS supposé mort ;
- aucune fusion de règles seulement similaires ;
- aucun déplacement entre modules ;
- aucune modification des media queries ;
- aucune modification visuelle volontaire.

## Validation recommandée

Tester Qualification, Sprint et Endurance en portrait et paysage, puis les modes Focus et l’installation PWA. Une attention particulière doit être portée aux couleurs, aux typographies et aux tailles de position dans les tableaux Qualification et Sprint.
