"""Journalisation locale du live Apex et de la boîte noire développeur."""

from datetime import datetime
from pathlib import Path
import threading


class ApexLogManager:
    """Centralise les chemins et écritures des journaux Apex."""

    def __init__(self, app_dir: Path):
        self.log_dir = app_dir / "logs"
        self.log_dir.mkdir(exist_ok=True)
        self.live_file = self.log_dir / "apex_live.log"
        self.traffic_in_file = self.log_dir / "apex_in.log"
        self.traffic_out_file = self.log_dir / "apex_out.log"
        self.traffic_lock = threading.Lock()

    def write_live(self, message):
        stamp = datetime.now().isoformat(timespec="milliseconds")
        try:
            with self.live_file.open("a", encoding="utf-8") as handle:
                handle.write(f"[{stamp}] {message}\n")
        except Exception:
            pass

    def write_traffic(self, direction, message, enabled=False):
        """Enregistre une trame Apex brute lorsque la boîte noire est activée."""
        if not enabled:
            return
        stamp = datetime.now().isoformat(timespec="milliseconds")
        target = self.traffic_in_file if direction == "IN" else self.traffic_out_file
        if isinstance(message, bytes):
            message = message.decode("utf-8", errors="replace")
        text = str(message)
        try:
            with self.traffic_lock:
                with target.open("a", encoding="utf-8") as handle:
                    handle.write(f"[{stamp}] {direction}\n{text}\n---\n")
        except Exception as exc:
            self.write_live(f"ERREUR ENREGISTREMENT TRAFIC {exc}")

    def reset_traffic(self):
        """Vide les deux fichiers de capture avant un nouvel enregistrement."""
        with self.traffic_lock:
            self.traffic_in_file.write_text("", encoding="utf-8")
            self.traffic_out_file.write_text("", encoding="utf-8")
