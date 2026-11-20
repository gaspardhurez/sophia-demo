import shutil
from datetime import datetime
from logging.config import fileConfig
from pathlib import Path

from alembic import context

# `models` est importé pour que les tables soient enregistrées sur
# Base.metadata et vues par l'autogenerate.
from sophia.infrastructure import models  # noqa: F401
from sophia.infrastructure.config import settings
from sophia.infrastructure.database import Base, engine

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# On garde les N derniers backups (fichiers ~200 Ko, on peut être généreux).
_BACKUP_KEEP = 30


def _backup_sqlite_before_migration() -> None:
    """FILET DE SÉCURITÉ : copie la base SQLite avant toute migration.

    Une migration destructive reste ainsi TOUJOURS réversible (restaurer le
    dernier backup). Câblé dans env.py → couvre chaque `alembic upgrade/downgrade`,
    impossible à oublier. No-op si la base n'existe pas encore (1ʳᵉ migration)."""
    db_path = engine.url.database
    if not db_path or engine.dialect.name != "sqlite":
        return
    src = Path(db_path)
    if not src.exists():
        return
    backups = src.parent / "backups"
    backups.mkdir(exist_ok=True)
    rev = context.get_head_revision() or "base"
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = backups / f"{src.stem}.{stamp}.{rev}{src.suffix}"
    shutil.copy2(src, dest)
    print(f"[alembic] backup base → {dest}")
    # Purge des plus anciens.
    old = sorted(backups.glob(f"{src.stem}.*{src.suffix}"))[:-_BACKUP_KEEP]
    for f in old:
        f.unlink()


def run_migrations_offline() -> None:
    """Migrations en mode offline (émet le SQL sans se connecter)."""
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,  # SQLite : ALTER via batch
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Migrations en mode online (via l'engine de l'app)."""
    _backup_sqlite_before_migration()
    with engine.connect() as connection:
        # CRITIQUE (SQLite) : le `batch_alter_table` recrée la table (drop +
        # rename). Avec `PRAGMA foreign_keys=ON` (activé par l'app), le drop de
        # la table parente CASCADE sur les enfants → perte de données. On coupe
        # les FK le temps de la migration ; SQLite les revérifie au commit.
        if connection.dialect.name == "sqlite":
            connection.exec_driver_sql("PRAGMA foreign_keys=OFF")

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,  # SQLite : ALTER via batch
        )

        with context.begin_transaction():
            context.run_migrations()

        # SQLAlchemy 2.0 : une connexion obtenue par `engine.connect()` est en
        # « commit as you go » — sans commit explicite, la fermeture du `with`
        # annule tout. Alembic ne s'en charge pas ici : SQLite est déclaré
        # `transactional_ddl = False`, donc `begin_transaction()` est un no-op.
        #
        # Les migrations purement DDL passaient quand même, par l'auto-commit
        # de pysqlite. Dès qu'une migration mélange du DML (amorcer une table,
        # backfiller une colonne), tout ce qui suit part dans une transaction
        # jamais validée — et disparaît en silence, sans erreur ni code retour.
        connection.commit()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
