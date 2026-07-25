from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime
from threading import RLock


@dataclass(slots=True)
class CellState:
    row: int
    column: int | None
    code: str
    value: str
    meaning: str
    previous_value: str | None
    changed_at: str
    change_count: int

    def to_dict(self) -> dict:
        return asdict(self)


class ApexTable:
    """Reconstruit l'état courant de la grille Apex cellule par cellule."""

    def __init__(self) -> None:
        self._rows: dict[int, dict[int | None, CellState]] = {}
        self._lock = RLock()
        self._version = 0

    @property
    def version(self) -> int:
        with self._lock:
            return self._version

    def reset(self) -> None:
        with self._lock:
            self._rows.clear()
            self._version += 1

    def apply(self, update) -> CellState:
        now = datetime.now().isoformat(timespec="milliseconds")
        with self._lock:
            row = self._rows.setdefault(update.row, {})
            previous = row.get(update.column)
            state = CellState(
                row=update.row,
                column=update.column,
                code=update.code,
                value=update.value,
                meaning=update.meaning,
                previous_value=previous.value if previous else None,
                changed_at=now,
                change_count=(previous.change_count + 1) if previous else 1,
            )
            row[update.column] = state
            self._version += 1
            return state

    def row_count(self) -> int:
        with self._lock:
            return len(self._rows)

    def cell_count(self) -> int:
        with self._lock:
            return sum(len(row) for row in self._rows.values())

    def snapshot(self, *, limit_rows: int = 250) -> dict:
        with self._lock:
            rows = []
            for row_id in sorted(self._rows)[:limit_rows]:
                cells = self._rows[row_id]
                ordered = sorted(cells.values(), key=lambda c: (-1 if c.column is None else c.column))
                rows.append({
                    "row": row_id,
                    "cells": [cell.to_dict() for cell in ordered],
                    "updated_at": max((cell.changed_at for cell in ordered), default=None),
                })
            return {
                "version": self._version,
                "row_count": len(self._rows),
                "cell_count": sum(len(row) for row in self._rows.values()),
                "rows": rows,
            }
