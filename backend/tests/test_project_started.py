"""Tests du cycle de vie d'un projet — cinq états, un seul manuel (design #32).

Le statut **affiché** se dérive de la période et des cibles : À faire, En
cours, Réussi, Raté. Le seul état qu'on décide, c'est l'abandon. Le statut
**stocké** (`manual_status`) ne garde que ce que rien d'autre ne dit : `todo`,
la coche « À la main » (`achieved`) et `abandoned`.

L'ordre de priorité : Abandonné > Réussi > Raté > En cours > À faire.

Ce qui se vérifie ici n'est pas une valeur de plus dans l'enum mais la
**question à laquelle le statut répond**. « Ai-je déjà touché à ça » est déjà
lisible sur la barre et les quatre axes ; le statut porte l'autre question, celle
que rien d'autre ne dit : **suis-je censé être dessus en ce moment**.
"""

from datetime import date, timedelta

from fastapi.testclient import TestClient

from tests.helpers import project_payload


def _domain(client: TestClient, name: str = "Sport") -> str:
    return client.post("/domains", json={"name": name}).json()["id"]


def _project(client: TestClient, domain_id: str, **body) -> str:
    resp = client.post(
        f"/domains/{domain_id}/projects",
        json=project_payload("Courir un marathon", **body),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _read(client: TestClient, project_id: str) -> dict:
    return client.get(f"/projects/{project_id}").json()


def _status(client: TestClient, project_id: str) -> str:
    return _read(client, project_id)["status"]


def _tracked(client: TestClient, domain_id: str, **body) -> str:
    """Projet portant une condition — un Total de 100 km —, donc au statut
    dérivé."""
    obj = _project(client, domain_id, **body)
    unit = client.post("/units", json={"name": "kilomètre"}).json()["id"]
    client.post(
        f"/projects/{obj}/totals",
        json={"mode": "value", "unit_id": unit, "target": 100},
    )
    return obj


def _run(client: TestClient, domain_id: str, project_id: str, km: float) -> None:
    """Une sortie faite, qui compte `km` pour le Total du projet."""
    unit = _read(client, project_id)["totals"][0]["unit"]["id"]
    resp = client.post(
        "/activities",
        json={
            "domain_id": domain_id,
            "projects": [{"project_id": project_id}],
            "title": "Sortie longue",
            "values": [{"unit_id": unit, "value": km}],
            "done": True,
        },
    )
    assert resp.status_code == 201, resp.text


def _day(offset: int) -> str:
    return (date.today() + timedelta(days=offset)).isoformat()


# --- En cours / À faire : la période décide ---


def test_open_period_starts_the_project(client: TestClient) -> None:
    """Une période ouverte suffit : le projet est en cours, qu'on y ait touché
    ou non. C'est le fait, pas l'inférence."""
    d = _domain(client)
    obj = _tracked(client, d, start_at=_day(-7), due_at=_day(30))

    assert _status(client, obj) == "in_progress"


def test_zero_progress_does_not_hold_it_back(client: TestClient) -> None:
    """Le cas moteur : une semaine ouverte sans la moindre activité. Dériver du
    progrès l'aurait rangé en « à faire », c'est-à-dire masqué l'alerte."""
    d = _domain(client)
    obj = _tracked(client, d, start_at=_day(-7), due_at=_day(30))
    assert _read(client, obj)["totals"][0]["progress"] == 0

    assert _status(client, obj) == "in_progress"


def test_future_start_stays_todo(client: TestClient) -> None:
    """Avant sa période, un projet n'est pas commencé — il est prévu."""
    d = _domain(client)
    obj = _tracked(client, d, start_at=_day(3), due_at=_day(30))

    assert _status(client, obj) == "todo"


def test_the_first_day_is_already_in_progress(client: TestClient) -> None:
    """Le jour du début compte : `start_at <= aujourd'hui`."""
    d = _domain(client)
    obj = _project(client, d, start_at=_day(0), due_at=_day(30))

    assert _status(client, obj) == "in_progress"


def test_untracked_projects_follow_the_same_rule(client: TestClient) -> None:
    """La période est un fait, indépendant des conditions déclarées : un
    projet sans axe suit la même règle."""
    d = _domain(client)
    ongoing = _project(client, d, start_at=_day(-1), due_at=_day(30))
    planned = _project(client, d, start_at=_day(1), due_at=_day(30))

    assert _status(client, ongoing) == "in_progress"
    assert _status(client, planned) == "todo"


def test_starting_earlier_means_moving_the_start(client: TestClient) -> None:
    """Plus de « Démarrer » à la main : démarrer plus tôt, c'est avancer le
    début. Remplace l'ancienne déclaration manuelle de l'état en cours."""
    d = _domain(client)
    obj = _tracked(client, d, start_at=_day(10), due_at=_day(60))
    assert _status(client, obj) == "todo"

    client.patch(f"/projects/{obj}", json={"start_at": _day(0)})

    assert _status(client, obj) == "in_progress"


def test_writing_todo_does_not_rewind_an_open_period(client: TestClient) -> None:
    """Le stocké `todo` ne recule pas l'état affiché : une période ouverte ne se
    remet pas en « à faire » d'un clic — on décale les dates. Sinon le statut
    mentirait sur la période."""
    d = _domain(client)
    obj = _tracked(client, d, start_at=_day(-2), due_at=_day(30))

    client.patch(f"/projects/{obj}", json={"status": "todo"})

    assert _status(client, obj) == "in_progress"


# --- Seules les décisions s'écrivent ---


def test_in_progress_cannot_be_written(client: TestClient) -> None:
    """En cours se lit sur la période : l'écrire est refusé, à la création
    comme en modification."""
    d = _domain(client)
    obj = _project(client, d, start_at=_day(10), due_at=_day(60))

    patched = client.patch(f"/projects/{obj}", json={"status": "in_progress"})
    created = client.post(
        f"/domains/{d}/projects",
        json=project_payload("X", status="in_progress"),
    )

    assert patched.status_code == 422
    assert created.status_code == 422
    assert _read(client, obj)["manual_status"] == "todo"
    assert _status(client, obj) == "todo"


def test_failed_cannot_be_written(client: TestClient) -> None:
    """Raté est un constat à l'échéance, pas une décision : l'abandon s'écrit
    `abandoned`."""
    d = _domain(client)
    obj = _project(client, d)

    patched = client.patch(f"/projects/{obj}", json={"status": "failed"})
    created = client.post(
        f"/domains/{d}/projects", json=project_payload("X", status="failed")
    )

    assert patched.status_code == 422
    assert created.status_code == 422
    assert _status(client, obj) == "in_progress"


def test_the_three_decisions_can_be_written(client: TestClient) -> None:
    d = _domain(client)
    for status in ("todo", "achieved", "abandoned"):
        resp = client.post(
            f"/domains/{d}/projects", json=project_payload("X", status=status)
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["manual_status"] == status


# --- Réussi ---


def test_targets_met_wins_over_the_period(client: TestClient) -> None:
    """Être dans sa période ne retient pas un projet atteint."""
    d = _domain(client)
    obj = _tracked(client, d, start_at=_day(-7), due_at=_day(30))
    _run(client, d, obj, 120)

    assert _status(client, obj) == "achieved"


def test_an_untracked_project_is_achieved_by_its_tick(client: TestClient) -> None:
    """Sans cible, c'est la carte « À la main » cochée qui dit la réussite."""
    d = _domain(client)
    obj = _project(client, d)

    client.patch(f"/projects/{obj}", json={"status": "achieved"})

    assert _status(client, obj) == "achieved"


def test_ticked_after_the_deadline_is_achieved(client: TestClient) -> None:
    """Cocher après l'échéance réussit quand même, comme une activité cochée en
    retard : la réussite l'emporte sur le raté."""
    d = _domain(client)
    obj = _project(client, d, start_at=_day(-30), due_at=_day(-1))
    assert _status(client, obj) == "failed"

    client.patch(f"/projects/{obj}", json={"status": "achieved"})

    assert _status(client, obj) == "achieved"


def test_targets_met_after_the_deadline_stay_achieved(client: TestClient) -> None:
    """Des cibles tenues dans la période : réussi, même une fois l'échéance
    passée."""
    d = _domain(client)
    obj = _tracked(client, d, start_at=_day(-7), due_at=_day(30))
    _run(client, d, obj, 120)

    client.patch(f"/projects/{obj}", json={"due_at": _day(-1)})

    assert _status(client, obj) == "achieved"


# --- Raté ---


def test_a_missed_deadline_wins_over_the_period(client: TestClient) -> None:
    """Passé l'échéance sans avoir rempli ses conditions, le projet est raté —
    pas éternellement en cours."""
    d = _domain(client)
    obj = _tracked(client, d, start_at=_day(-30), due_at=_day(-1))

    assert _status(client, obj) == "failed"


def test_an_unticked_untracked_project_fails_at_the_deadline(
    client: TestClient,
) -> None:
    """Nouveau (design #32) : un projet à la main non coché à l'échéance est
    raté, pas « à trancher »."""
    d = _domain(client)
    obj = _project(client, d, start_at=_day(-30), due_at=_day(-1))

    read = _read(client, obj)
    assert read["status"] == "failed"
    assert read["manual_status"] == "todo"


def test_the_last_day_is_not_yet_failed(client: TestClient) -> None:
    """Le raté se constate le lendemain de l'échéance (`aujourd'hui > fin`)."""
    d = _domain(client)
    obj = _project(client, d, start_at=_day(-30), due_at=_day(0))

    assert _status(client, obj) == "in_progress"


def test_pushing_the_deadline_reopens_a_failed_project(client: TestClient) -> None:
    """Prolonger, c'est repousser la fin : le raté redevient en cours."""
    d = _domain(client)
    obj = _project(client, d, start_at=_day(-30), due_at=_day(-1))
    assert _status(client, obj) == "failed"

    client.patch(f"/projects/{obj}", json={"due_at": _day(15)})

    assert _status(client, obj) == "in_progress"


# --- Abandonné ---


def test_abandon_wins_over_everything(client: TestClient) -> None:
    """L'abandon reste une décision qu'aucune date ne prend à notre place."""
    d = _domain(client)
    obj = _tracked(client, d, start_at=_day(-7), due_at=_day(30))

    client.patch(f"/projects/{obj}", json={"status": "abandoned"})

    read = _read(client, obj)
    assert read["status"] == "abandoned"
    assert read["manual_status"] == "abandoned"


def test_abandon_wins_over_met_targets(client: TestClient) -> None:
    d = _domain(client)
    obj = _tracked(client, d, start_at=_day(-7), due_at=_day(30))
    _run(client, d, obj, 120)
    assert _status(client, obj) == "achieved"

    client.patch(f"/projects/{obj}", json={"status": "abandoned"})

    assert _status(client, obj) == "abandoned"


def test_abandon_wins_over_a_missed_deadline(client: TestClient) -> None:
    """Abandonner n'est pas rater : la décision reste distincte du constat."""
    d = _domain(client)
    obj = _project(client, d, start_at=_day(-30), due_at=_day(-1))

    client.patch(f"/projects/{obj}", json={"status": "abandoned"})

    assert _status(client, obj) == "abandoned"


def test_resuming_recomputes_from_the_period(client: TestClient) -> None:
    """Reprendre = réécrire `todo` : le statut se relit sur la période."""
    d = _domain(client)
    obj = _tracked(client, d, start_at=_day(-7), due_at=_day(30))
    client.patch(f"/projects/{obj}", json={"status": "abandoned"})

    client.patch(f"/projects/{obj}", json={"status": "todo"})

    assert _status(client, obj) == "in_progress"


def test_resuming_after_the_deadline_is_failed(client: TestClient) -> None:
    """Reprendre un projet dont la fin est passée le rend raté — il faut
    repousser la fin pour le rouvrir."""
    d = _domain(client)
    obj = _project(client, d, start_at=_day(-30), due_at=_day(-1))
    client.patch(f"/projects/{obj}", json={"status": "abandoned"})

    client.patch(f"/projects/{obj}", json={"status": "todo"})
    assert _status(client, obj) == "failed"

    client.patch(f"/projects/{obj}", json={"due_at": _day(10)})
    assert _status(client, obj) == "in_progress"
