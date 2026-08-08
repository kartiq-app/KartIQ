"""Configuration applicative et catalogue des circuits Velocity."""

from pathlib import Path
import json
import unicodedata

APP_DIR = Path(__file__).resolve().parent.parent
APP_VERSION = "7.2.127"
APP_RELEASE_NAME = "NOTIFICATIONS ANALYZER APEX"


def _circuit_sort_key(circuit):
    """Tri alphabétique stable, insensible aux accents et à la casse."""
    name = str(circuit.get("name", ""))
    return unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii").casefold()


def load_circuits():
    """Charge la base centralisée des circuits et garantit son ordre alphabétique."""
    path = APP_DIR / "config" / "circuits.json"
    try:
        circuits = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(circuits, list):
            raise ValueError("config/circuits.json doit contenir une liste")
        circuits = [c for c in circuits if isinstance(c, dict) and c.get("id") and c.get("name")]
        return sorted(circuits, key=_circuit_sort_key)
    except Exception:
        return [{
            "id": "circuit-de-leurope",
            "name": "Circuit de l'Europe",
            "live_url": "",
            "websocket_url": "",
        }]
