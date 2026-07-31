# KartIQ V5.5.8 — Ajustement du bloc Temps / Tours

Sur smartphone tactile en mode paysage, la case de session contient uniquement le temps restant et le nombre de tours.

Les deux valeurs sont considérées comme un seul bloc visuel. Le module `static/js/ui/session-clock-fit.js` calcule une taille de police commune en fonction de la largeur et de la hauteur réelles de la case. Si une valeur devient plus longue, les deux valeurs sont réduites ensemble afin de rester centrées et de ne jamais déborder.

Le Desktop et le mode portrait ne sont pas modifiés.
