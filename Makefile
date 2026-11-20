.PHONY: help install dev back front gen-client migrate migration lint format demo

help:
	@echo "Cibles disponibles :"
	@echo "  install     - installe les deps back (uv) et front (pnpm)"
	@echo "  dev         - lance back + front en parallele"
	@echo "  back        - serveur de dev backend (uvicorn, :8000)"
	@echo "  front       - serveur de dev frontend (vite, :5173)"
	@echo "  gen-client  - regenere le client OpenAPI (dump back -> types front)"
	@echo "  migrate     - applique les migrations Alembic (upgrade head)"
	@echo "  demo        - cree la base et la remplit de donnees de demonstration"
	@echo "  migration   - cree une migration : make migration m=\"message\""
	@echo "  lint        - verifie sans rien reecrire : back (ruff) + front (oxlint + steiger)"
	@echo "  format      - reformate back (ruff format) + front (prettier)"

install:
	cd backend && uv sync
	cd frontend && pnpm install

dev:
	$(MAKE) -j2 back front

back:
	cd backend && uv run uvicorn sophia.main:app --reload

front:
	cd frontend && pnpm dev

gen-client:
	cd backend && uv run python scripts/dump_openapi.py
	cd frontend && pnpm gen:client

migrate:
	cd backend && uv run alembic upgrade head

demo:
	cd backend && uv run alembic upgrade head && uv run python scripts/seed_demo.py

migration:
	cd backend && uv run alembic revision --autogenerate -m "$(m)"

lint:
	cd backend && uv run ruff format --check . && uv run ruff check .
	cd frontend && pnpm lint && pnpm lint:fsd

format:
	cd backend && uv run ruff format .
	cd frontend && pnpm format
