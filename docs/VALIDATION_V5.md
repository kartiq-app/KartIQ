# Validation KartIQ V5.0.1

Cette version doit se comporter exactement comme la V4.9.1.

## Vérifications prioritaires

- [ ] La page d’accueil s’affiche sans décalage visuel.
- [ ] La liste des circuits est chargée.
- [ ] La connexion Apex peut être lancée et interrompue.
- [ ] Qualification : classement, Focus, temps restant et tours.
- [ ] Sprint : classement, pénalités, temps restant et tours.
- [ ] Endurance : Top 8, Quick Change et files de karts.
- [ ] Affichage smartphone en portrait.
- [ ] Affichage smartphone en paysage.
- [ ] Aperçu iPhone SE.
- [ ] Installation et rechargement PWA.
- [ ] Comportement hors live.

## Contrôle technique réalisé

Le CSS a été déplacé sans changement de contenu ni d’ordre. Le HTML charge désormais `/static/css/kartiq.css?v=5.0.1`.


## Contrôles spécifiques V5.0.1

- Vérifier que `/static/js/kartiq.js` répond en HTTP 200.
- Vérifier l’absence d’erreur JavaScript dans la console.
- Tester les boutons utilisant des gestionnaires `onclick`.
- Tester la connexion Apex, les mises à jour automatiques et le service worker.
