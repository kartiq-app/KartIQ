from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class ApexEventStore:
    """Petit stockage JSONL local, adapté au prototype et rejouable hors course."""

    def __init__(self, directory: Path):
        self.directory = directory
        self.directory.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._session_file = self._new_session_file()

    def _new_session_file(self) -> Path:
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return self.directory / f"apex_session_{stamp}.jsonl"

    @property
    def session_file(self) -> Path:
        return self._session_file

    def append(self, event: dict[str, Any]) -> None:
        record = {
            "received_at": datetime.now(timezone.utc).isoformat(),
            **event,
        }
        with self._lock:
            with self._session_file.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(record, ensure_ascii=False) + "\n")

    def recent(self, limit: int = 100) -> list[dict[str, Any]]:
        if not self._session_file.exists():
            return []
        with self._lock:
            lines = self._session_file.read_text(encoding="utf-8").splitlines()
        result: list[dict[str, Any]] = []
        for line in lines[-max(1, min(limit, 1000)):]:
            try:
                result.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return result

    def reset(self) -> Path:
        with self._lock:
            self._session_file = self._new_session_file()
        return self._session_file
