from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Iterable

# Une mise à jour Apex ressemble à :
# r16248c6|tn|49.986
# r16248c7|in|Tour 10
# r16248|*|49805|
# Les mises à jour peuvent être séparées par des retours ligne OU concaténées
# dans une même trame. Le lookahead s'arrête avant la prochaine cellule.
CELL_SCAN_RE = re.compile(
    r"r(?P<row>\d+)(?:c(?P<column>\d+))?\|"
    r"(?P<code>[^|\r\n]*)\|"
    r"(?P<value>.*?)"
    r"(?=(?:\s*r\d+(?:c\d+)?\|)|$)",
    re.DOTALL,
)


@dataclass(slots=True)
class ApexCellUpdate:
    raw: str
    row: int
    column: int | None
    code: str
    value: str
    meaning: str

    def to_dict(self) -> dict:
        return asdict(self)


CODE_MEANINGS = {
    "tn": "tour normal / non amélioré",
    "ti": "meilleur tour de l’équipe",
    "tb": "meilleur tour de la grille",
    "to": "compteur de temps dynamique",
    "in": "information affichée",
    "ib": "écart / information secondaire",
    "sr": "style de ligne",
    "su": "mise à jour de style",
    "gf": "indicateur graphique",
    "gm": "indicateur graphique",
    "sd": "style de cellule",
    "gs": "style général",
    "lb": "valeur chronométrique secondaire",
    "*": "mise à jour globale de ligne",
    "*in": "entrée aux stands",
    "*out": "sortie des stands",
    "so": "ordre / tri de ligne",
    "sf": "état de ligne",
}


def _clean_value(value: str) -> str:
    value = value.strip()
    # Certaines trames finissent par un séparateur terminal supplémentaire.
    while value.endswith("|"):
        value = value[:-1].rstrip()
    return value


def decode_frame(frame: str) -> tuple[list[ApexCellUpdate], list[str]]:
    updates: list[ApexCellUpdate] = []
    spans: list[tuple[int, int]] = []

    for match in CELL_SCAN_RE.finditer(frame):
        code = match.group("code").strip()
        raw = match.group(0).strip()
        updates.append(ApexCellUpdate(
            raw=raw,
            row=int(match.group("row")),
            column=int(match.group("column")) if match.group("column") else None,
            code=code,
            value=_clean_value(match.group("value")),
            meaning=CODE_MEANINGS.get(code, "code non identifié"),
        ))
        spans.append(match.span())

    # Conserve uniquement les fragments non décodés significatifs (init, css, etc.).
    remainder_parts: list[str] = []
    cursor = 0
    for start, end in spans:
        if start > cursor:
            remainder_parts.append(frame[cursor:start])
        cursor = end
    if cursor < len(frame):
        remainder_parts.append(frame[cursor:])

    remainder = "\n".join(remainder_parts).replace("\r\n", "\n").replace("\r", "\n")
    unknown = [line.strip() for line in remainder.split("\n") if line.strip()]
    return updates, unknown


def updates_to_dicts(updates: Iterable[ApexCellUpdate]) -> list[dict]:
    return [item.to_dict() for item in updates]
