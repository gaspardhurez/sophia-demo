"""Tests de l'API des étapes de projet.

Couvre : création (ordre auto, compétences), édition (titre/ordre/coche), lien
compétences, dérivation du « fait » (manuel vs toutes acquises), suppression, et
l'agrégation des compétences effectives du projet (directes ∪ étapes).
"""

import uuid

from fastapi.testclient import TestClient

from tests.helpers import project_payload


def _domain(client: TestClient, name: str = "Guitare") -> str:
    return client.post("/domains", json={"name": name}).json()["id"]


def _skill(client: TestClient, domain_id: str, name: str) -> str:
    return client.post(f"/domains/{domain_id}/skills", json={"name": name}).json()["id"]


def _acquire(client: TestClient, skill_id: str) -> None:
    """Terminer acquis les cycles de ce savoir — ceux de ses projets.

    Le statut saisi à la main ne remplit plus la condition : elle lit le
    cycle rattaché au projet."""
    for plan in client.get(f"/skills/{skill_id}/plans").json():
        if plan["state"] == "draft":
            resp = client.post(f"/plans/{plan['id']}/open")
            assert resp.status_code == 200, resp.text
        if plan["state"] in ("draft", "active"):
            resp = client.post(f"/plans/{plan['id']}/complete")
            assert resp.status_code == 200, resp.text


def _project(client: TestClient, domain_id: str, **body) -> dict:
    payload = project_payload("Produire un morceau de House", **body)
    resp = client.post(f"/domains/{domain_id}/projects", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _step(client: TestClient, project_id: str, **body) -> dict:
    payload = {"title": "Composer la structure", **body}
    resp = client.post(f"/projects/{project_id}/steps", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _find_step(project: dict, step_id: str) -> dict:
    return next(s for s in project["steps"] if s["id"] == step_id)


# --- Création / ordre ---


def test_new_project_has_no_steps(client: TestClient) -> None:
    obj = _project(client, _domain(client))
    assert obj["steps"] == []


def test_create_step_appends_in_order(client: TestClient) -> None:
    domain_id = _domain(client)
    obj = _project(client, domain_id)

    after_first = _step(client, obj["id"], title="Composition")
    after_second = _step(client, obj["id"], title="Mixage")

    steps = after_second["steps"]
    assert [s["title"] for s in steps] == ["Composition", "Mixage"]
    assert [s["order"] for s in steps] == [1, 2]
    # Réponse = projet parent complet, pas juste l'étape.
    assert after_first["id"] == obj["id"]


def test_create_step_with_skills(client: TestClient) -> None:
    domain_id = _domain(client)
    skill = _skill(client, domain_id, "Harmonie")
    # Déclarée d'abord au niveau du projet : une étape ne distribue que ce
    # que le projet s'est engagé à acquérir.
    obj = _project(client, domain_id, skill_ids=[skill])

    result = _step(client, obj["id"], skill_ids=[skill])

    step = result["steps"][0]
    assert step["skill_ids"] == [skill]


def test_create_step_in_unknown_project_404(client: TestClient) -> None:
    resp = client.post(f"/projects/{uuid.uuid4()}/steps", json={"title": "X"})
    assert resp.status_code == 404


# --- Dérivation du « fait » ---


def test_step_without_skills_is_manual(client: TestClient) -> None:
    domain_id = _domain(client)
    obj = _project(client, domain_id)
    step = _step(client, obj["id"])["steps"][0]
    assert step["done"] is False

    resp = client.patch(f"/steps/{step['id']}", json={"done": True})

    assert resp.status_code == 200
    assert _find_step(resp.json(), step["id"])["done"] is True


def test_step_with_skills_is_done_when_all_acquired(client: TestClient) -> None:
    domain_id = _domain(client)
    a = _skill(client, domain_id, "Kick")
    b = _skill(client, domain_id, "Basse")
    obj = _project(client, domain_id, skill_ids=[a, b])
    step = _step(client, obj["id"], skill_ids=[a, b])["steps"][0]
    assert step["done"] is False

    _acquire(client, a)
    partial = client.get(f"/projects/{obj['id']}").json()
    assert _find_step(partial, step["id"])["done"] is False

    _acquire(client, b)
    full = client.get(f"/projects/{obj['id']}").json()
    assert _find_step(full, step["id"])["done"] is True


def test_manual_flag_ignored_when_step_has_skills(client: TestClient) -> None:
    domain_id = _domain(client)
    skill = _skill(client, domain_id, "Arrangement")
    obj = _project(client, domain_id, skill_ids=[skill])
    step = _step(client, obj["id"], skill_ids=[skill])["steps"][0]

    # Cocher manuellement ne prime pas : la compétence n'est pas acquise.
    resp = client.patch(f"/steps/{step['id']}", json={"done": True})

    assert _find_step(resp.json(), step["id"])["done"] is False


# --- Lien compétences ---


def test_set_step_skills_replaces_and_aggregates(client: TestClient) -> None:
    domain_id = _domain(client)
    a = _skill(client, domain_id, "Sound design")
    b = _skill(client, domain_id, "Sidechain")
    obj = _project(client, domain_id, skill_ids=[a, b])
    step = _step(client, obj["id"], skill_ids=[a])["steps"][0]

    resp = client.put(f"/steps/{step['id']}/skills", json={"skill_ids": [b]})

    assert resp.status_code == 200
    body = resp.json()
    assert _find_step(body, step["id"])["skill_ids"] == [b]
    # Le projet garde les deux : retirer une compétence d'une ÉTAPE ne la
    # retire pas de ce à quoi le projet s'est engagé. C'est la distribution
    # qui change, pas la condition.
    assert set(body["direct_skill_ids"]) == {a, b}


def test_project_skills_are_union_of_direct_and_steps(client: TestClient) -> None:
    domain_id = _domain(client)
    direct = _skill(client, domain_id, "Théorie")
    step_skill = _skill(client, domain_id, "Automation")
    obj = _project(client, domain_id, skill_ids=[direct, step_skill])
    _step(client, obj["id"], skill_ids=[step_skill])

    body = client.get(f"/projects/{obj['id']}").json()

    # Depuis que l'étape ne fait que **distribuer**, l'union est triviale : tout
    # ce qu'une étape porte a d'abord été déclaré par le projet. `skill_ids`
    # reste exposé — le front s'en sert pour cadrer l'arbre — mais il ne peut
    # plus rien contenir que `direct_skill_ids` n'ait déjà.
    assert set(body["skill_ids"]) == {direct, step_skill}
    assert set(body["direct_skill_ids"]) == {direct, step_skill}


def test_set_step_skills_from_other_domain_422(client: TestClient) -> None:
    guitare = _domain(client, "Guitare")
    sport = _domain(client, "Sport")
    foreign = _skill(client, sport, "Gainage")
    obj = _project(client, guitare)
    step = _step(client, obj["id"])["steps"][0]

    resp = client.put(f"/steps/{step['id']}/skills", json={"skill_ids": [foreign]})

    assert resp.status_code == 422


# --- Édition / suppression ---


def test_update_step_title(client: TestClient) -> None:
    domain_id = _domain(client)
    obj = _project(client, domain_id)
    step = _step(client, obj["id"], title="Brouillon")["steps"][0]

    resp = client.patch(f"/steps/{step['id']}", json={"title": "Version finale"})

    assert resp.status_code == 200
    edited = _find_step(resp.json(), step["id"])
    assert edited["title"] == "Version finale"


def test_the_order_is_not_written_step_by_step(client: TestClient) -> None:
    """L'ordre passe par le réordonnancement, qui garde des rangs uniques."""
    domain_id = _domain(client)
    obj = _project(client, domain_id)
    step = _step(client, obj["id"], title="Brouillon")["steps"][0]

    resp = client.patch(f"/steps/{step['id']}", json={"title": "X", "order": 5})

    assert resp.status_code == 422
    kept = client.get(f"/projects/{obj['id']}").json()["steps"][0]
    assert (kept["title"], kept["order"]) == ("Brouillon", 1)


def test_delete_step(client: TestClient) -> None:
    domain_id = _domain(client)
    obj = _project(client, domain_id)
    step = _step(client, obj["id"])["steps"][0]

    assert client.delete(f"/steps/{step['id']}").status_code == 204
    assert client.get(f"/projects/{obj['id']}").json()["steps"] == []


def test_update_unknown_step_404(client: TestClient) -> None:
    resp = client.patch(f"/steps/{uuid.uuid4()}", json={"title": "X"})
    assert resp.status_code == 404


# --- Réordonnancement ---


def test_reorder_steps(client: TestClient) -> None:
    domain_id = _domain(client)
    obj = _project(client, domain_id)
    _step(client, obj["id"], title="A")
    _step(client, obj["id"], title="B")
    result = _step(client, obj["id"], title="C")
    a, b, c = (s["id"] for s in result["steps"])

    resp = client.put(
        f"/projects/{obj['id']}/steps/order", json={"step_ids": [c, a, b]}
    )

    assert resp.status_code == 200
    body = resp.json()
    assert [s["title"] for s in body["steps"]] == ["C", "A", "B"]
    assert [s["order"] for s in body["steps"]] == [1, 2, 3]


def test_reorder_rejects_incomplete_list_422(client: TestClient) -> None:
    domain_id = _domain(client)
    obj = _project(client, domain_id)
    _step(client, obj["id"], title="A")
    result = _step(client, obj["id"], title="B")
    a, _b = (s["id"] for s in result["steps"])

    resp = client.put(f"/projects/{obj['id']}/steps/order", json={"step_ids": [a]})

    assert resp.status_code == 422


def test_deleting_project_cascades_steps(client: TestClient) -> None:
    domain_id = _domain(client)
    obj = _project(client, domain_id)
    step = _step(client, obj["id"])["steps"][0]

    assert client.delete(f"/projects/{obj['id']}").status_code == 204
    assert client.patch(f"/steps/{step['id']}", json={"title": "X"}).status_code == 404


def test_a_step_cannot_distribute_an_undeclared_skill(client: TestClient) -> None:
    """Une étape distribue, elle ne déclare pas.

    Sinon elle créerait une exigence en propre que le statut du projet ne
    verrait jamais — le découpage se mettrait à dire autre chose que ce à quoi
    on s'est engagé.
    """
    domain_id = _domain(client)
    skill = _skill(client, domain_id, "Sidechain")
    obj = _project(client, domain_id)  # ne déclare aucune compétence

    resp = client.post(
        f"/projects/{obj['id']}/steps",
        json={"title": "Mix", "skill_ids": [skill]},
    )

    assert resp.status_code == 422


def _unit(client: TestClient) -> str:
    return client.post("/units", json={"name": "kilogramme"}).json()["id"]


def _metric_project(client: TestClient) -> tuple[str, str, str]:
    """Un projet qui vise 120 au squat, et une étape à distribuer."""
    domain_id = _domain(client)
    metric = client.post(
        f"/domains/{domain_id}/metrics",
        json={"name": "Squat", "unit_id": _unit(client), "direction": "up"},
    ).json()
    obj = client.post(
        f"/domains/{domain_id}/projects",
        json=project_payload("Remise en forme", start_at="2026-01-01"),
    ).json()["id"]
    client.put(
        f"/projects/{obj}/metrics", json={"metric_id": metric["id"], "target": 120}
    )
    step = client.post(f"/projects/{obj}/steps", json={"title": "Automne"}).json()[
        "steps"
    ][-1]
    return obj, metric["id"], step["id"]


def test_a_step_can_hold_an_intermediate_target(client: TestClient) -> None:
    """Le palier : le projet vise 120, l'étape d'automne en demande 105.

    C'est ce qui permet de raconter une progression plutôt qu'un tout-ou-rien —
    et ça ne coûte rien de plus, la métrique et son historique existant déjà.
    """
    obj, metric, step = _metric_project(client)

    resp = client.put(
        f"/steps/{step}/metrics", json={"metric_id": metric, "target": 105}
    )
    assert resp.status_code == 200, resp.text
    link = _find_step(resp.json(), step)["metrics"][0]
    assert link["target"] == 105
    assert link["is_met"] is False

    client.post(
        f"/metrics/{metric}/values", json={"value": 107, "measured_at": "2026-03-01"}
    )

    body = client.get(f"/projects/{obj}").json()
    assert _find_step(body, step)["metrics"][0]["is_met"] is True
    assert _find_step(body, step)["done"] is True
    # L'étape est faite, le projet non : 107 ne franchit pas 120. Une étape
    # distribue, elle ne conclut pas.
    assert body["status"] == "in_progress"


def test_without_a_palier_the_link_does_not_condition_the_step(
    client: TestClient,
) -> None:
    """Sans palier, le lien situe le travail dans le plan — il n'exige rien.

    Il a repris la cible du projet, et c'était absurde : chaque étape sans
    palier exigeait alors le projet entier, si bien que distribuer un résultat
    sur trois étapes ne distribuait rien.
    """
    obj, metric, step = _metric_project(client)

    resp = client.put(f"/steps/{step}/metrics", json={"metric_id": metric})

    link = _find_step(resp.json(), step)["metrics"][0]
    assert link["target"] is None
    # Aucune condition posée : l'étape retombe sur sa coche manuelle.
    assert _find_step(resp.json(), step)["done"] is False
    client.patch(f"/steps/{step}", json={"done": True})
    assert _find_step(client.get(f"/projects/{obj}").json(), step)["done"] is True


def test_a_step_cannot_distribute_an_unaimed_result(client: TestClient) -> None:
    """Une étape distribue, elle ne déclare pas — ici comme pour les compétences."""
    domain_id = _domain(client)
    other = client.post(f"/domains/{domain_id}/metrics", json={"name": "RDL"}).json()[
        "id"
    ]
    _, _, step = _metric_project(client)

    resp = client.put(f"/steps/{step}/metrics", json={"metric_id": other})

    assert resp.status_code == 422


def test_unsetting_keeps_the_project_target(client: TestClient) -> None:
    """Défaire la distribution défait la place dans le plan, pas la condition."""
    obj, metric, step = _metric_project(client)
    client.put(f"/steps/{step}/metrics", json={"metric_id": metric, "target": 105})

    resp = client.delete(f"/steps/{step}/metrics/{metric}")

    assert resp.status_code == 200
    assert _find_step(resp.json(), step)["metrics"] == []
    assert [m["metric_id"] for m in client.get(f"/projects/{obj}/metrics").json()] == [
        metric
    ]


# --- Jalon ou étape dérivée (20/09/2026) -------------------------------------
#
# L'écran offrait la coche sur TOUTES les étapes, y compris celles dont `done`
# est dérivé : cliquer y enregistrait un `done_manual` sans le moindre effet.
# `is_manual` dit lequel des deux régimes s'applique, pour que la coche ne soit
# proposée que là où elle tranche vraiment.


def test_a_step_without_conditions_is_a_manual_milestone(client: TestClient) -> None:
    obj = _project(client, _domain(client))

    after = _step(client, obj["id"])

    assert after["steps"][0]["is_manual"] is True


def test_skills_make_the_step_derived(client: TestClient) -> None:
    domain_id = _domain(client)
    obj = _project(client, domain_id)
    skill = _skill(client, domain_id, "Sidechain")
    client.put(f"/projects/{obj['id']}/skills", json={"skill_ids": [skill]})
    step = _step(client, obj["id"])["steps"][0]

    after = client.put(f"/steps/{step['id']}/skills", json={"skill_ids": [skill]})

    assert _find_step(after.json(), step["id"])["is_manual"] is False


def test_a_link_without_a_target_does_not_derive_the_step(client: TestClient) -> None:
    """Sans palier, le lien situe le travail — il ne pose aucune condition."""
    obj, metric, step = _metric_project(client)

    resp = client.put(f"/steps/{step}/metrics", json={"metric_id": metric})

    assert _find_step(resp.json(), step)["is_manual"] is True


# --- Retirer une condition retire sa distribution (20/09/2026) ---------------
#
# La garde à l'entrée empêchait une étape de distribuer une condition non
# déclarée, mais rien ne tenait l'invariant à la sortie : délier la condition
# du projet laissait les étapes la distribuer encore. Pour les compétences,
# l'union des liens effectifs la ressuscitait — le projet « sans » ce savoir
# continuait de le compter.


def test_unlinking_a_skill_undistributes_it(client: TestClient) -> None:
    domain_id = _domain(client)
    obj = _project(client, domain_id)
    skill = _skill(client, domain_id, "Sidechain")
    client.put(f"/projects/{obj['id']}/skills", json={"skill_ids": [skill]})
    step = _step(client, obj["id"])["steps"][0]
    client.put(f"/steps/{step['id']}/skills", json={"skill_ids": [skill]})

    after = client.put(f"/projects/{obj['id']}/skills", json={"skill_ids": []})

    assert after.json()["direct_skill_ids"] == []
    assert _find_step(after.json(), step["id"])["skill_ids"] == []
    # Et donc l'union ne le ressuscite plus.
    assert after.json()["skill_ids"] == []


def test_unlinking_a_result_undistributes_its_milestone(client: TestClient) -> None:
    obj, metric, step = _metric_project(client)
    client.put(f"/steps/{step}/metrics", json={"metric_id": metric, "target": 105})

    resp = client.delete(f"/projects/{obj}/metrics/{metric}")

    assert resp.status_code == 204
    assert _find_step(client.get(f"/projects/{obj}").json(), step)["metrics"] == []


def test_undistributing_leaves_the_other_conditions_alone(client: TestClient) -> None:
    """On ne retire que ce qui est délié — les voisines d'étape restent."""
    domain_id = _domain(client)
    obj = _project(client, domain_id)
    garde = _skill(client, domain_id, "Sidechain")
    partie = _skill(client, domain_id, "Compression")
    client.put(f"/projects/{obj['id']}/skills", json={"skill_ids": [garde, partie]})
    step = _step(client, obj["id"])["steps"][0]
    client.put(f"/steps/{step['id']}/skills", json={"skill_ids": [garde, partie]})

    after = client.put(f"/projects/{obj['id']}/skills", json={"skill_ids": [garde]})

    assert _find_step(after.json(), step["id"])["skill_ids"] == [garde]


# --- Les étapes suivent la période du projet (design #27) ---------------


def test_moving_the_period_shortens_or_undates_steps(client: TestClient) -> None:
    d = _domain(client)
    obj = _project(client, d, start_at="2026-09-01", due_at="2026-12-31")
    oid = obj["id"]
    _step(client, oid, title="Un", start_at="2026-09-01", due_at="2026-09-30")
    _step(client, oid, title="Deux", start_at="2026-10-01", due_at="2026-11-15")
    _step(client, oid, title="Trois", start_at="2026-11-16", due_at="2026-12-31")
    _step(client, oid, title="Libre")

    resp = client.patch(
        f"/projects/{oid}", json={"start_at": "2026-10-10", "due_at": "2026-11-30"}
    )
    assert resp.status_code == 200, resp.text
    dates = {s["title"]: (s["start_at"], s["due_at"]) for s in resp.json()["steps"]}
    assert dates == {
        "Un": (None, None),  # recouverte : sans dates
        "Deux": ("2026-10-10", "2026-11-15"),  # raccourcie au début
        "Trois": ("2026-11-16", "2026-11-30"),  # raccourcie à la fin
        "Libre": (None, None),  # sans dates, intouchée
    }


def test_placing_a_step_folds_its_neighbours(client: TestClient) -> None:
    """Aucune date d'étape n'est bloquée : la voisine d'avant finit la veille,
    celle d'après commence le lendemain, recouverte elle perd ses dates ; hors
    période, la borne du projet se décale."""
    d = _domain(client)
    obj = _project(client, d, start_at="2026-09-01", due_at="2026-12-31")
    oid = obj["id"]
    _step(client, oid, title="Un", start_at="2026-09-01", due_at="2026-09-30")
    _step(client, oid, title="Deux", start_at="2026-10-01", due_at="2026-10-31")
    _step(client, oid, title="Trois", start_at="2026-11-01", due_at="2026-11-10")
    _step(client, oid, title="Quatre", start_at="2026-11-11", due_at="2026-12-31")
    steps = client.get(f"/projects/{oid}").json()["steps"]
    deux = next(s["id"] for s in steps if s["title"] == "Deux")

    resp = client.patch(
        f"/steps/{deux}", json={"start_at": "2026-09-20", "due_at": "2026-11-15"}
    )
    assert resp.status_code == 200, resp.text
    o = client.get(f"/projects/{oid}").json()
    dates = {s["title"]: (s["start_at"], s["due_at"]) for s in o["steps"]}
    assert dates == {
        "Un": ("2026-09-01", "2026-09-19"),
        "Deux": ("2026-09-20", "2026-11-15"),
        "Trois": (None, None),
        "Quatre": ("2026-11-16", "2026-12-31"),
    }

    un = next(s["id"] for s in o["steps"] if s["title"] == "Un")
    client.patch(
        f"/steps/{un}", json={"start_at": "2026-08-15", "due_at": "2026-09-19"}
    )
    assert client.get(f"/projects/{oid}").json()["start_at"] == "2026-08-15"


def test_a_step_start_after_its_end_is_refused(client: TestClient) -> None:
    d = _domain(client)
    obj = _project(client, d, start_at="2026-09-01", due_at="2026-12-31")
    oid = obj["id"]

    created = client.post(
        f"/projects/{oid}/steps",
        json={"title": "À l'envers", "start_at": "2026-10-10", "due_at": "2026-10-01"},
    )
    assert created.status_code == 422

    step = _step(client, oid, start_at="2026-10-01", due_at="2026-10-31")["steps"][0]
    both = client.patch(
        f"/steps/{step['id']}", json={"start_at": "2026-10-20", "due_at": "2026-10-05"}
    )
    late_start = client.patch(f"/steps/{step['id']}", json={"start_at": "2026-11-15"})
    early_due = client.patch(f"/steps/{step['id']}", json={"due_at": "2026-09-15"})
    assert (both.status_code, late_start.status_code, early_due.status_code) == (
        422,
        422,
        422,
    )
    kept = client.get(f"/projects/{oid}").json()["steps"][0]
    assert (kept["start_at"], kept["due_at"]) == ("2026-10-01", "2026-10-31")


def test_creating_a_dated_step_places_it(client: TestClient) -> None:
    """Née avec une plage, une étape se pose comme une plage déplacée : la
    voisine chevauchée se replie, la période du projet s'élargit."""
    d = _domain(client)
    obj = _project(client, d, start_at="2026-09-01", due_at="2026-12-31")
    oid = obj["id"]
    _step(client, oid, title="Un", start_at="2026-09-01", due_at="2026-10-31")

    resp = client.post(
        f"/projects/{oid}/steps",
        json={"title": "Deux", "start_at": "2026-10-15", "due_at": "2027-01-15"},
    )
    assert resp.status_code == 201, resp.text
    o = resp.json()
    dates = {s["title"]: (s["start_at"], s["due_at"]) for s in o["steps"]}
    assert dates == {
        "Un": ("2026-09-01", "2026-10-14"),
        "Deux": ("2026-10-15", "2027-01-15"),
    }
    assert o["due_at"] == "2027-01-15"
