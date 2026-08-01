#!/usr/bin/env python3
"""Contrôles qualité reproductibles de KartIQ, sans dépendance externe."""

from __future__ import annotations

import ast
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXPECTED_VERSION = "6.0.17"


def ok(message: str) -> None:
    print(f"[OK] {message}")


def fail(message: str) -> None:
    print(f"[ERREUR] {message}")
    raise SystemExit(1)


def check_python() -> None:
    files = sorted(ROOT.rglob("*.py"))
    for path in files:
        if any(part in {".git", ".venv", "venv", "__pycache__"} for part in path.parts):
            continue
        try:
            ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except SyntaxError as exc:
            fail(f"syntaxe Python invalide dans {path.relative_to(ROOT)}: {exc}")
    ok(f"syntaxe Python ({len(files)} fichiers détectés)")


def check_json() -> None:
    files = sorted(ROOT.rglob("*.json"))
    for path in files:
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            fail(f"JSON invalide dans {path.relative_to(ROOT)}: {exc}")
    ok(f"JSON valide ({len(files)} fichiers)")


def check_javascript() -> None:
    node = shutil.which("node")
    files = sorted((ROOT / "static" / "js").rglob("*.js")) + [ROOT / "static" / "sw.js"]
    if not node:
        print("[INFO] Node.js absent : contrôle syntaxique JavaScript ignoré")
        return
    for path in files:
        result = subprocess.run([node, "--check", str(path)], capture_output=True, text=True)
        if result.returncode:
            fail(f"syntaxe JavaScript invalide dans {path.relative_to(ROOT)}: {result.stderr.strip()}")
    ok(f"syntaxe JavaScript ({len(files)} fichiers)")


def check_css_entrypoint() -> None:
    entry = ROOT / "static" / "css" / "kartiq.css"
    text = entry.read_text(encoding="utf-8")
    imports = re.findall(r'@import\s+url\(["\']?([^"\')]+)', text)
    if not imports:
        fail("aucun module importé par static/css/kartiq.css")
    missing = [name for name in imports if not (entry.parent / name).exists()]
    if missing:
        fail(f"modules CSS manquants: {', '.join(missing)}")
    for path in [entry, *(entry.parent / name for name in imports)]:
        css = path.read_text(encoding="utf-8")
        if css.count("{") != css.count("}"):
            fail(f"accolades CSS déséquilibrées dans {path.relative_to(ROOT)}")
    ok(f"point d’entrée CSS et cascade ({len(imports)} modules)")


def check_pwa_assets() -> None:
    sw = (ROOT / "static" / "sw.js").read_text(encoding="utf-8")
    assets_match = re.search(r"const ASSETS = \[(.*?)\];", sw, re.S)
    if not assets_match:
        fail("liste ASSETS introuvable dans static/sw.js")
    assets = re.findall(r"['\"]([^'\"]+)['\"]", assets_match.group(1))
    missing = []
    for asset in assets:
        if asset == "/":
            continue
        path = ROOT / asset.lstrip("/")
        if not path.exists():
            missing.append(asset)
    if missing:
        fail(f"ressources PWA manquantes: {', '.join(missing)}")
    ok(f"ressources PWA présentes ({len(assets)} entrées)")


def check_version() -> None:
    config = (ROOT / "backend" / "config.py").read_text(encoding="utf-8")
    sw = (ROOT / "static" / "sw.js").read_text(encoding="utf-8")
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    if f'APP_VERSION = "{EXPECTED_VERSION}"' not in config:
        fail("APP_VERSION non synchronisée")
    if f"kartiq-v{EXPECTED_VERSION.replace('.', '-')}" not in sw:
        fail("clé de cache PWA non synchronisée")
    if f"V{EXPECTED_VERSION}" not in readme:
        fail("README non synchronisé")
    ok(f"cohérence de version V{EXPECTED_VERSION}")


def check_repository_hygiene() -> None:
    unwanted = [p for p in ROOT.rglob("*") if p.name == "__pycache__" or p.suffix in {".pyc", ".pyo"}]
    if unwanted:
        fail("fichiers générés présents: " + ", ".join(str(p.relative_to(ROOT)) for p in unwanted[:5]))
    ok("hygiène de l’archive GitHub")


def main() -> int:
    check_python()
    check_json()
    check_javascript()
    check_css_entrypoint()
    check_pwa_assets()
    check_version()
    check_repository_hygiene()
    print("\nKartIQ V6.0.17 : contrôles qualité réussis.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
