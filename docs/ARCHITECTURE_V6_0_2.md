# KartIQ V6.0.2

## Accueil

Sur Desktop, les quatre modes sont disposés sur une seule ligne :

1. Qualification
2. Sprint
3. Endurance
4. Analyzer

## Thème Endurance

Le nouveau mode Endurance réutilise l’architecture visuelle de Qualification mais conserve sa propre identité orange.
Les sélecteurs s’appuient sur `body[data-app-mode="endurance"]`, car la classe visuelle `current-qualification` reste volontairement utilisée pour préserver la mise en page Qualification validée.

Les éléments orange sont :

- le filet supérieur de la première ligne ;
- le filet inférieur de l’en-tête du classement ;
- le filet du bandeau Focus Endurance.
