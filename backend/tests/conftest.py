"""Fixtures partagées par toute la suite de tests.

Le harnais isole totalement les tests de la base de dev (`sophia.db`) : on monte
un engine SQLite **en mémoire** dédié, et on redirige la dépendance `get_db` de
l'app vers une session branchée sur cet engine.
"""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

# Importé pour son effet de bord : enregistre tous les modèles sur
# `Base.metadata`, sans quoi `create_all` ne créerait aucune table.
import sophia.infrastructure.models  # noqa: F401
from sophia.api.deps import get_link_reader
from sophia.infrastructure.database import Base, get_db
from sophia.main import app

# SQLite en mémoire : rien n'est écrit sur disque. `StaticPool` force toutes les
# connexions à partager l'unique connexion en mémoire — sinon chaque connexion
# repartirait sur une base vide et les tables disparaîtraient d'un appel à l'autre.
engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class _NoLinkReader:
    def read(self, url: str) -> None:
        return None


@pytest.fixture
def db() -> Generator[Session, None, None]:
    """Session sur une base fraîche, recréée puis jetée à chaque test."""
    Base.metadata.create_all(engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)


@pytest.fixture
def client(db: Session) -> Generator[TestClient, None, None]:
    """Client HTTP de test dont l'API partage la session du test.

    On remplace `get_db` par une fonction qui yield la *même* session que la
    fixture `db` : un test peut ainsi vérifier en base ce qu'un appel API a écrit.
    """

    def override_get_db() -> Generator[Session, None, None]:
        yield db

    app.dependency_overrides[get_db] = override_get_db
    # Jamais de réseau : un lien ne se lit pas (sa sorte vient du lien seul).
    app.dependency_overrides[get_link_reader] = lambda: _NoLinkReader()
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
