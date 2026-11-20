"""Des poses simultanées ne posent rien deux fois (9/11/2026).

À l'ouverture de l'app, plusieurs `POST /planning/prepare` partent en même
temps ; chacun lisait « posé jusqu'au » avant que les autres l'avancent, et la
semaine se posait autant de fois. Ce test monte une base SQLite **sur disque**
(le dossier temporaire du test) et une session par requête, comme le serveur :
la base en mémoire partagée de `conftest` ne peut pas montrer la course.
"""

import threading
from collections.abc import Generator
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

import sophia.infrastructure.models  # noqa: F401
from sophia.infrastructure.database import Base, get_db
from sophia.main import app
from tests.helpers import project_payload

CALLS = 4


@pytest.fixture
def server(tmp_path: Path) -> Generator[TestClient, None, None]:
    engine = create_engine(
        f"sqlite:///{tmp_path / 'sophia.db'}",
        connect_args={"check_same_thread": False, "timeout": 30},
    )
    event.listen(
        engine, "connect", lambda conn, _: conn.execute("PRAGMA foreign_keys=ON")
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db() -> Generator[Session, None, None]:
        session = sessions()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_simultaneous_prepares_pose_the_week_once(server: TestClient) -> None:
    d = server.post("/domains", json={"name": "Sport"}).json()["id"]
    run = server.post("/activity-types", json={"domain_id": d, "title": "Run"}).json()[
        "id"
    ]
    obj = server.post(f"/domains/{d}/projects", json=project_payload("Semi")).json()[
        "id"
    ]
    server.put(
        f"/projects/{obj}/activity-types/{run}",
        json={"planning": "daily", "slot_start": "08:00:00", "slot_minutes": 45},
    )
    until = date.today() + timedelta(days=10)

    start = threading.Barrier(CALLS)
    codes: list[int] = []

    def prepare() -> None:
        start.wait()
        resp = server.post("/planning/prepare", json={"until": str(until)})
        codes.append(resp.status_code)

    threads = [threading.Thread(target=prepare) for _ in range(CALLS)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert codes == [200] * CALLS
    acts = server.get(
        "/activities",
        params={
            "start": f"{date.today()}T00:00:00",
            "end": f"{until + timedelta(days=1)}T00:00:00",
        },
    ).json()
    starts = [a["start_at"] for a in acts if a["activity_type_id"] == run]
    assert len(starts) == len(set(starts)) == 11
