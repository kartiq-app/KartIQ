from __future__ import annotations

import html
import re
from dataclasses import dataclass
from html.parser import HTMLParser

from apex_decoder import ApexCellUpdate, CODE_MEANINGS

GRID_RE = re.compile(r"(?:^|\n)grid\|\|(.*)", re.DOTALL)
CELL_ID_RE = re.compile(r"^r(\d+)c(\d+)$")
COL_ID_RE = re.compile(r"^c(\d+)$")
ROW_ID_RE = re.compile(r"^r(\d+)$")
TAG_RE = re.compile(r"<[^>]+>")


@dataclass(slots=True)
class GridParseResult:
    schema: dict[int, str]
    labels: dict[int, str]
    updates: list[ApexCellUpdate]
    rows: set[int]


class _GridHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[dict] = []
        self.schema: dict[int, str] = {}
        self.labels: dict[int, str] = {}
        self.cells: list[tuple[int, int, str, str]] = []
        self.rows: set[int] = set()

    def handle_starttag(self, tag: str, attrs) -> None:
        data = dict(attrs)
        item = {
            "tag": tag,
            "id": data.get("data-id", ""),
            "type": data.get("data-type", ""),
            "class": data.get("class", ""),
            "text": [],
        }
        row_match = ROW_ID_RE.match(item["id"])
        if row_match:
            row = int(row_match.group(1))
            # r0 est la ligne d'en-tête Apex, pas un concurrent.
            if row > 0:
                self.rows.add(row)
        self.stack.append(item)

    def handle_data(self, data: str) -> None:
        if not data:
            return
        for item in self.stack:
            item["text"].append(data)

    def handle_endtag(self, tag: str) -> None:
        if not self.stack:
            return
        # Apex HTML is well formed enough for a simple unwind.
        index = len(self.stack) - 1
        while index >= 0 and self.stack[index]["tag"] != tag:
            index -= 1
        if index < 0:
            return
        item = self.stack.pop(index)
        text = " ".join("".join(item["text"]).split())
        element_id = item["id"]
        col_match = COL_ID_RE.match(element_id)
        if col_match:
            col = int(col_match.group(1))
            # Toujours conserver le libellé de colonne, même lorsque data-type
            # est vide. Apex utilise précisément ce cas pour « Péna. ».
            self.labels[col] = text
            if item["type"]:
                self.schema[col] = item["type"]
        cell_match = CELL_ID_RE.match(element_id)
        if cell_match:
            row, col = int(cell_match.group(1)), int(cell_match.group(2))
            code = item["class"].split()[0] if item["class"] else ""
            self.cells.append((row, col, code, text))


def parse_grid_frame(frame: str) -> GridParseResult | None:
    match = GRID_RE.search(frame)
    if not match:
        return None
    markup = html.unescape(match.group(1)).strip()
    parser = _GridHTMLParser()
    try:
        parser.feed(markup)
    except Exception:
        return None

    # One logical cell may appear twice through nested markup. Keep the most
    # specific/non-empty version while preserving the latest occurrence.
    dedup: dict[tuple[int, int], tuple[str, str]] = {}
    for row, col, code, value in parser.cells:
        key = (row, col)
        old = dedup.get(key)
        if old is None or value or not old[1]:
            dedup[key] = (code, value)

    updates = [
        ApexCellUpdate(
            raw=f"grid:r{row}c{col}", row=row, column=col, code=code,
            value=value, meaning=CODE_MEANINGS.get(code, "valeur initiale de la grille"),
        )
        for (row, col), (code, value) in sorted(dedup.items())
    ]
    return GridParseResult(parser.schema, parser.labels, updates, parser.rows)
