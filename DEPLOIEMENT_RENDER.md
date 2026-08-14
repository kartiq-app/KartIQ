# Déploiement KartIQ sur Render

- Build Command : `pip install -r requirements.txt`
- Start Command : `gunicorn app:app --workers 1 --threads 4 --timeout 120`
- Runtime : Python 3

Le serveur local lancé avec `python3 app.py` reste utilisable sur Mac.
Sur Render, Gunicorn lance directement l'objet Flask `app` sans ouvrir de navigateur.
