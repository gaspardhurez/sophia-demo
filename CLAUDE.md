# CLAUDE.md — Sophia

Instructions pour l'agent de code (Claude Code) qui travaille sur ce dépôt. Ce fichier
est une version publique, épurée des règles qui renvoient à la documentation interne et
aux outils de design du dépôt privé.

Outil perso de montée en compétence : domaines → projets et leurs objectifs (Total,
Résultat, Réalisation, Apprentissage) → activités planifiées au calendrier → arbre de
savoirs → cycles d'acquisition (étude, pratique, application, rétention). Mono-user,
web-first, local.

**Livrer, c'est aussi documenter** : un comportement changé dans le code se reflète dans
la documentation dans le même commit. Une doc périmée est pire que pas de doc.

---

## Stack

**Backend** — FastAPI, SQLAlchemy 2.0 (**sync**), Alembic, Pydantic v2, SQLite. Outillage : `uv`, `ruff`, `pytest`.
**Frontend** — React/TS, Vite, Tailwind, shadcn/ui, FSD, TanStack Query, React Router v7, RHF + Zod. Outillage : **pnpm** (jamais npm), oxlint, steiger, prettier. Client généré via openapi-typescript / openapi-fetch.

Contrat **OpenAPI** = source de vérité. Aucun type dupliqué à la main entre back et front.

---

## Commandes

Depuis `backend/` :
```bash
uv run uvicorn sophia.main:app --reload          # serveur de dev
uv run pytest -q                                 # tests
uv run alembic revision --autogenerate -m "..."  # créer une migration
uv run alembic upgrade head                      # appliquer les migrations
uvx ruff format . && uvx ruff check .            # format + lint
uv run python scripts/dump_openapi.py            # écrire openapi.json (pour le client)
```

Depuis `frontend/` :
```bash
pnpm dev                   # serveur de dev
pnpm gen:client            # régénérer src/shared/api/schema.d.ts depuis openapi.json
pnpm exec tsc -b           # types
pnpm lint && pnpm lint:fsd # oxlint + règles FSD (steiger)
pnpm format                # prettier
```

Après un changement d'API : `dump_openapi.py` puis `pnpm gen:client` (les deux fichiers
générés sont ignorés par git).

**Sécurité des données (non négociable).** Chaque `alembic upgrade/downgrade`
**sauvegarde d'abord** la base dans `backend/backups/` (câblé dans `env.py`) — une
migration reste toujours réversible. Restaurer = copier le dernier backup sur
`backend/sophia.db`. Les migrations tournent avec `PRAGMA foreign_keys=OFF`
(sinon le `batch_alter_table` de SQLite recrée la table parente et CASCADE
détruit les enfants — c'est ainsi que des `project_steps` ont été perdues).
Conséquence : dans une migration, le CASCADE ne joue pas — nettoyer à la main ce
qu'il aurait emporté. Ne jamais retirer ces deux garde-fous. Tester une migration
sur une copie de la base (`SOPHIA_DATABASE_URL`) avant de l'appliquer.

---

## Règles backend

Clean architecture, appliquée avec **pragmatisme**. Dépendances vers l'intérieur uniquement :

```
api → application → domain
infrastructure (ORM, config) sert application
domain ne dépend de rien
```

- `domain/` — logique métier pure et erreurs métier, zéro dépendance framework
  (ex. `planning.py` : un lien pose-t-il tel jour ; `period.py`, `sequence.py`).
- `application/` — use cases.
- `infrastructure/` — SQLAlchemy (engine, Base, session, modèles), config.
- `api/` — routers FastAPI (couche interface).

Conventions dures :
- **SQLAlchemy 2.0** : `DeclarativeBase` en classe, `Mapped[...]` / `mapped_column(...)`. Jamais la syntaxe 1.x (`declarative_base()`, `Column(...)` sans typing).
- **Sync**, pas d'async tant qu'on est en SQLite local.
- Les sessions arrivent par injection FastAPI (`Depends(get_db)`) — jamais ouvertes à la main dans un endpoint.
- **Pragmatisme des couches** : les modèles SQLAlchemy servent d'entités (ils portent aussi des propriétés calculées : statut d'un projet, progrès d'un Total…). Une règle qui doit être partagée ou testée à part va en fonction pure dans `domain/`. Pas de repository ni de mapper superflu sur le CRUD pur.

---

## Règles frontend (FSD)

Structure par **entité métier**, pas par type technique. Couches, dépendances strictement descendantes :

```
app → pages → widgets → features → entities → shared
```

Deux règles **non négociables** :
1. **Dépendances unidirectionnelles** — une couche ne dépend que des couches en dessous. Une entité ne connaît jamais une feature.
2. **Public API** — chaque slice expose un seul `index.ts`. On n'importe jamais un fichier interne d'un autre slice.

Distinction de rangement, à appliquer systématiquement :
- **entities/** = ce que les choses **SONT** (données + logique métier de base). Ex : le statut d'un savoir → `entities/skill/model/status.ts`.
- **features/** = ce que l'utilisateur **FAIT** (actions), groupées par entité. Ex : passer un statut → `features/skill/edit-status`.
- **widgets/** = blocs UI montés (données + comportement). Ex : `skill-tree` (React Flow), `activity-calendar`.
- **shared/** = primitifs agnostiques du métier. shadcn → `shared/ui` ; client OpenAPI → `shared/api`.

Un widget n'en importe pas un autre : quand il en a besoin, **la page compose** et le
lui passe (ex. le calendrier fourni à `project-activities`).

Les hooks TanStack Query enveloppant le client OpenAPI vivent dans `entities/*/api`.

Adoption **minimale** : on pose la structure et les deux règles, mais on ne crée un slice ou un segment que quand il y a quelque chose à y mettre.

---

## Style & garde-fous

- Formatage et lint via **Ruff** — respecte sa sortie, n'improvise pas de style.
- Une décision d'architecture ne se prend jamais au milieu d'une tâche d'exécution : signale-la, ne tranche pas seul.
- Revue humaine avant commit — le code produit ici est relu, pas mergé aveuglément.

---

## Hors périmètre

Auth (mono-user local, pas de modèle `User`), CI/CD, monitoring, déploiement cloud. Ne les ajoute pas sans qu'on en discute.

Le **LLM** n'est branché que pour l'étude (le compagnon : dictée, vérification des notes, idées centrales), derrière les ports `Companion` et `Transcriber`. Les tests ne l'appellent jamais.
