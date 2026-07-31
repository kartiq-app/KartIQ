# Modules CSS — KartIQ V5.2.3

La V5.2.3 découpe la feuille monolithique sans modifier son comportement.

## Point d’entrée

`static/css/kartiq.css` contient uniquement les imports. Le HTML ne charge que ce fichier.

## Ordre obligatoire

1. `00-foundations.css`
2. `10-components-live.css`
3. `20-mobile-focus.css`
4. `30-modes-portrait.css`
5. `40-landscape-overrides.css`
6. `50-endurance-latest.css`

Cet ordre reproduit exactement la cascade de la V5.1.2. Les règles historiques se chevauchent encore : changer l’ordre des imports peut donc modifier le rendu. Le nettoyage et le reclassement réellement thématique seront réalisés seulement après validation de cette étape.

## Principe de cette version

- aucune suppression ;
- aucune fusion de sélecteurs ;
- aucune modification de spécificité ;
- aucun changement volontaire de rendu ;
- découpage aux frontières de blocs existants.
