"""Écrit le schéma OpenAPI de l'app dans backend/openapi.json.

Permet au frontend de régénérer son client typé sans serveur lancé.
Usage : `uv run python scripts/dump_openapi.py`
"""

import json
from pathlib import Path

from sophia.main import app

OUTPUT = Path(__file__).resolve().parent.parent / "openapi.json"


def main() -> None:
    schema = app.openapi()
    OUTPUT.write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")
    print(f"OpenAPI schema écrit dans {OUTPUT}")


if __name__ == "__main__":
    main()
