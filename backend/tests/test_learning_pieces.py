"""Tests des pièces d'un savoir (#107, #108, chantier apprentissage-preparation).

Une pièce se pose sur une séance comme un acte : l'étude, l'interro, un objet
de la rampe, ou une **pièce générique** — « Pratique » / « Application », un
acte de pratique sans objet qui dit sa phase. Ce qui se vérifie ici :

- la pièce générique : une phase à la place d'un objet, toujours d'un cycle ;
- une pièce d'un savoir pas démarré vise son cycle **prévu**, sans l'ouvrir ;
- la **première complétion** (cocher la séance) ouvre le cycle prévu, daté du
  jour de la séance — sauf si un autre cycle du savoir est en cours ;
  décocher ne referme rien ;
- les séances faites d'étude et de pièces génériques, que le cycle compte
  pour passer ses phases « en cours » ;
- le créneau porté, lu sur l'activité ; la fusion de deux séances.
"""

from datetime import date, timedelta
from types import SimpleNamespace

from fastapi.testclient import TestClient

from tests.helpers import project_payload

TODAY = date.today()


def _setup(client: TestClient) -> SimpleNamespace:
    """Tennis du dimanche : Chandelle puis Volée dans la séquence, Demi-volée hors
    séquence (les trois démarrés), Smash rangé mais pas démarré (son cycle est
    prévu). Une Leçon quotidienne."""
    d = client.post("/domains", json={"name": "Tennis"}).json()["id"]
    names = ["Volée", "Chandelle", "Demi-volée", "Smash"]
    s = {
        n: client.post(f"/domains/{d}/skills", json={"name": n}).json()["id"]
        for n in names
    }
    resp = client.post(
        f"/domains/{d}/projects",
        json=project_payload("Tennis du dimanche", skill_ids=list(s.values())),
    )
    assert resp.status_code == 201, resp.text
    obj = resp.json()["id"]
    resp = client.put(
        f"/projects/{obj}/sequence",
        json={"segments": [{"skill_ids": [s["Chandelle"], s["Volée"], s["Smash"]]}]},
    )
    assert resp.status_code == 200, resp.text
    plans = {}
    for n in ("Volée", "Chandelle", "Demi-volée"):
        resp = client.post(f"/skills/{s[n]}/plans/start", json={"project_id": obj})
        assert resp.status_code in (200, 201), resp.text
        plans[n] = resp.json()["id"]
    lecon = client.post(
        "/activity-types", json={"domain_id": d, "title": "Leçon", "emoji": "🎾"}
    ).json()["id"]
    resp = client.put(
        f"/projects/{obj}/activity-types/{lecon}",
        json={"planning": "daily"},
    )
    assert resp.status_code == 200, resp.text
    activity = client.post(
        "/activities",
        json={
            "domain_id": d,
            "activity_type_id": lecon,
            "title": "Leçon",
            "start_at": f"{TODAY}T18:00:00",
            "end_at": f"{TODAY}T19:30:00",
        },
    ).json()
    (smash,) = client.get(f"/skills/{s['Smash']}/plans").json()
    assert smash["state"] == "draft"
    plans["Smash"] = smash["id"]
    return SimpleNamespace(
        domain=d, skills=s, plans=plans, project=obj, type=lecon, activity=activity
    )


def _post_act(client: TestClient, activity_id: str, **act):
    return client.post(f"/activities/{activity_id}/acts", json=act)


def _plan(client: TestClient, skill_id: str, plan_id: str) -> dict:
    resp = client.get(f"/skills/{skill_id}/plans")
    assert resp.status_code == 200, resp.text
    return next(x for x in resp.json() if x["id"] == plan_id)


# --- La pièce générique ---------------------------------------------------------


def test_a_generic_piece_says_its_phase_instead_of_an_item(
    client: TestClient,
) -> None:
    p = _setup(client)
    chandelle = {"skill_id": p.skills["Chandelle"], "plan_id": p.plans["Chandelle"]}

    resp = _post_act(
        client, p.activity["id"], kind="practice", nature="isolated", **chandelle
    )
    assert resp.status_code == 200, resp.text
    resp = _post_act(
        client, p.activity["id"], kind="practice", nature="situation", **chandelle
    )
    assert resp.status_code == 200, resp.text

    acts = resp.json()["acts"]
    assert [(a["nature"], a["practice_item_id"]) for a in acts] == [
        ("isolated", None),
        ("situation", None),
    ]
    # La même pièce n'entre pas deux fois.
    again = _post_act(
        client, p.activity["id"], kind="practice", nature="isolated", **chandelle
    )
    assert again.status_code == 422


def test_a_generic_piece_fits_only_a_practice_of_a_cycle(client: TestClient) -> None:
    p = _setup(client)
    skill, plan = p.skills["Chandelle"], p.plans["Chandelle"]
    item = client.post(f"/skills/{skill}/practice", json={"title": "Panier"}).json()

    def post(**act) -> int:
        return _post_act(client, p.activity["id"], skill_id=skill, **act).status_code

    # Sans cycle : refusée (pas d'acte générique hors cycle).
    assert post(kind="practice", nature="isolated") == 422
    # Un objet et une phase : l'un ou l'autre.
    assert (
        post(
            kind="practice",
            nature="isolated",
            practice_item_id=item["id"],
            plan_id=plan,
        )
        == 422
    )
    # L'étude ne dit pas de phase.
    assert post(kind="study", nature="isolated", plan_id=plan) == 422


# --- Un savoir pas démarré --------------------------------------------------------


def test_a_piece_of_a_skill_not_started_targets_its_planned_cycle(
    client: TestClient,
) -> None:
    """Planifier n'ouvre rien : l'acte vise le cycle prévu, qui le reste, et
    apporte ses projets à la séance."""
    p = _setup(client)
    plain = client.post(
        "/activities",
        json={
            "domain_id": p.domain,
            "title": "Tennis",
            "start_at": f"{TODAY}T10:00:00",
            "end_at": f"{TODAY}T11:00:00",
        },
    ).json()

    resp = _post_act(
        client,
        plain["id"],
        skill_id=p.skills["Smash"],
        plan_id=p.plans["Smash"],
        kind="study",
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["acts"][0]["plan_id"] == p.plans["Smash"]
    assert [o["project_id"] for o in resp.json()["projects"]] == [p.project]
    assert _plan(client, p.skills["Smash"], p.plans["Smash"])["state"] == "draft"


def _session(client: TestClient, p, day: date, **body) -> dict:
    resp = client.post(
        "/activities",
        json={
            "domain_id": p.domain,
            "title": "Séance",
            "start_at": f"{day}T10:00:00",
            "end_at": f"{day}T11:00:00",
            **body,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_the_first_completion_opens_the_planned_cycle(client: TestClient) -> None:
    """Cocher la séance ouvre le cycle prévu, daté du jour de la séance ;
    décocher ne referme rien."""
    p = _setup(client)
    day = TODAY - timedelta(days=2)
    smash = {
        "skill_id": p.skills["Smash"],
        "plan_id": p.plans["Smash"],
        "kind": "study",
    }
    session = _session(client, p, day, acts=[smash])

    client.patch(f"/activities/{session['id']}", json={"done": True})

    opened = _plan(client, p.skills["Smash"], p.plans["Smash"])
    assert opened["state"] == "active"
    assert opened["opened_at"].startswith(str(day))
    skill = client.get(f"/skills/{p.skills['Smash']}").json()
    assert skill["status"] == "in_progress"

    client.patch(f"/activities/{session['id']}", json={"done": False})
    assert _plan(client, p.skills["Smash"], p.plans["Smash"])["state"] == "active"


def test_a_session_created_done_opens_its_planned_cycle(client: TestClient) -> None:
    p = _setup(client)
    smash = {
        "skill_id": p.skills["Smash"],
        "plan_id": p.plans["Smash"],
        "kind": "study",
    }

    _session(client, p, TODAY, acts=[smash], done=True)

    assert _plan(client, p.skills["Smash"], p.plans["Smash"])["state"] == "active"


def test_nothing_opens_while_another_cycle_of_the_skill_runs(
    client: TestClient,
) -> None:
    """Un second cycle prévu de Chandelle (en cours) : cocher une séance qui le
    vise ne l'ouvre pas."""
    p = _setup(client)
    second = client.post(f"/skills/{p.skills['Chandelle']}/plans", json={}).json()
    assert second["state"] == "draft"
    act = {"skill_id": p.skills["Chandelle"], "plan_id": second["id"], "kind": "study"}
    session = _session(client, p, TODAY, acts=[act])

    client.patch(f"/activities/{session['id']}", json={"done": True})

    assert _plan(client, p.skills["Chandelle"], second["id"])["state"] == "draft"
    assert (
        _plan(client, p.skills["Chandelle"], p.plans["Chandelle"])["state"] == "active"
    )


# --- Ce que le cycle compte pour ses phases -----------------------------------------


def test_the_cycle_counts_its_done_study_and_generic_sessions(
    client: TestClient,
) -> None:
    p = _setup(client)
    plan, skill = p.plans["Volée"], p.skills["Volée"]
    item = client.post(
        f"/skills/{skill}/practice", json={"title": "Panier", "plan_id": plan}
    ).json()
    acts = [
        {"skill_id": skill, "plan_id": plan, "kind": "study"},
        {"skill_id": skill, "plan_id": plan, "kind": "practice", "nature": "situation"},
        {
            "skill_id": skill,
            "plan_id": plan,
            "kind": "practice",
            "practice_item_id": item["id"],
        },
    ]
    _session(client, p, TODAY, acts=acts, done=True)
    # Pas faite : ne compte pas.
    _session(client, p, TODAY, acts=acts[:2])

    read = _plan(client, skill, plan)
    assert (
        read["study_sessions"],
        read["isolated_sessions"],
        read["situation_sessions"],
    ) == (1, 0, 1)
    # Les passes d'un objet restent les siennes.
    assert [x["sessions"] for x in read["items"]] == [1]


def test_an_act_reads_with_its_skill_name(client: TestClient) -> None:
    p = _setup(client)
    resp = client.post(
        f"/activities/{p.activity['id']}/acts",
        json={
            "skill_id": p.skills["Chandelle"],
            "plan_id": p.plans["Chandelle"],
            "kind": "study",
        },
    )
    assert resp.status_code in (200, 201), resp.text

    (act,) = resp.json()["acts"]
    assert act["skill_name"] == "Chandelle"


# --- Fusionner deux séances -------------------------------------------------------


def test_merging_moves_the_acts_and_projects_then_drops_the_session(
    client: TestClient,
) -> None:
    p = _setup(client)
    act = {"skill_id": p.skills["Chandelle"], "kind": "study"}
    source = client.post(
        "/activities",
        json={
            "domain_id": p.domain,
            "title": "Étude",
            "start_at": f"{TODAY}T09:00:00",
            "end_at": f"{TODAY}T10:00:00",
            "acts": [act, {"skill_id": p.skills["Volée"], "kind": "study"}],
        },
    ).json()
    # La cible porte déjà l'étude de Chandelle : elle n'est pas doublée.
    client.post(f"/activities/{p.activity['id']}/acts", json=act)

    resp = client.post(
        f"/activities/{p.activity['id']}/merge", json={"source_id": source["id"]}
    )
    assert resp.status_code == 200, resp.text
    merged = resp.json()
    assert sorted(x["skill_name"] for x in merged["acts"]) == ["Chandelle", "Volée"]
    assert client.get(f"/activities/{source['id']}").status_code == 404


def test_merging_refuses_a_session_that_carries_more(client: TestClient) -> None:
    p = _setup(client)
    other = client.post("/domains", json={"name": "Autre"}).json()["id"]
    elsewhere = client.post(
        "/activities",
        json={"domain_id": other, "title": "Ailleurs", "start_at": f"{TODAY}T09:00:00"},
    ).json()
    done = client.post(
        "/activities",
        json={
            "domain_id": p.domain,
            "title": "Faite",
            "start_at": f"{TODAY}T09:00:00",
            "done": True,
        },
    ).json()

    for source in (elsewhere, done):
        resp = client.post(
            f"/activities/{p.activity['id']}/merge", json={"source_id": source["id"]}
        )
        assert resp.status_code == 422
        assert client.get(f"/activities/{source['id']}").status_code == 200
