"""Utilitaires réseau indépendants du serveur Flask."""

import socket


def local_ip():
    """Retourne l'adresse IP locale utilisée pour l'accès réseau à Velocity."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.connect(("8.8.8.8", 80))
        return sock.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        sock.close()
