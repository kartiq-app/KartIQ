# KartIQ V6.1.0 — Analyzer stratégique Endurance

Cette version remplace entièrement la page Analyzer et ajoute :

- classement général Apex enrichi avec **temps en piste** ;
- prévision des prochains arrêts et détection des vagues de Quick Change ;
- réglage du règlement de course ;
- suivi des passages obligatoires et de la limite de relais ;
- apprentissage local des durées de relais ;
- classement et notation progressive des karts virtuels ;
- indice d’opportunité et recommandation rentrer / attendre ;
- files de Quick Change intégrées.

Les prédictions deviennent plus précises au fil des relais. Les informations qu’Apex ne transmet pas — notamment la file réellement choisie et l’identité physique du kart — nécessitent toujours une validation manuelle dans les files.

---

# KartIQ V6.0.28 — Restauration Endurance et Analyzer

Cette version repart strictement de la V6.0.26 validée et conserve les quatre modes ainsi que les pages Endurance et Focus Endurance.

Ajouts ciblés : delta P1 vert en Endurance, colonne STAND en paysage et séquence IN/OUT du Focus Endurance.

# KartIQ V6.0.26 — Deltas Sprint et Focus corrigés

Cette version modifie uniquement la carte du pilote ou de l’équipe suivie dans le Focus Sprint.

## Modification

La carte affiche désormais, dans cet ordre :

1. la position ;
2. le nom du pilote ou de l’équipe ;
3. le chronomètre blanc suivi du rang numérique, par exemple `⏱2`.

La présentation, les dimensions et la protection contre les débordements reprennent celles validées dans le Focus Endurance. Les autres informations du Focus Sprint restent inchangées.

## Correctif V6.0.26

- Sprint P1 : avance sur P2 en vert.
- Sprint P2+ : intervalle avec le pilote devant en orange.
- Focus Sprint / Endurance : orange avec le pilote devant, vert avec le pilote derrière, sans utiliser l’écart au leader comme valeur de secours.

