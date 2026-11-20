# Sophia — backend

API FastAPI de Sophia (SQLAlchemy 2 sync, SQLite, Alembic). Vue d'ensemble
dans le [README à la racine](../README.md).

```bash
uv sync                                          # dépendances
uv run alembic upgrade head                      # base à jour (sauvegarde automatique avant)
uv run python scripts/seed_demo.py               # données de démonstration (base vide)
uv run uvicorn sophia.main:app --reload          # serveur de dev (http://localhost:8000)
uv run pytest -q                                 # tests
uv run ruff format . && uv run ruff check .            # format + lint
uv run python scripts/dump_openapi.py            # openapi.json, pour régénérer le client front
```
