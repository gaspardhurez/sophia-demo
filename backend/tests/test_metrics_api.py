"""Tests de l'API Métrique (résultats mesurés).

Trois niveaux, trois chemins : le catalogue au domaine, les relevés sous la
métrique, les résultats visés sous le projet. Ce qu'on vérifie ici est surtout
ce qui distingue une métrique d'un suivi : elle **survit aux projets**, ses
relevés ne s'additionnent pas, et un même relevé peut naître d'une activité qui
en porte plusieurs.
"""

from fastapi.testclient import TestClient

from tests.helpers import project_payload


def _domain(client: TestClient, name: str = "Musculation") -> str:
    return client.post("/domains", json={"name": name}).json()["id"]


def _metric(client: TestClient, domain_id: str, **body) -> dict:
    payload = {"name": "Squat 1RM", **body}
    resp = client.post(f"/domains/{domain_id}/metrics", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _value(client: TestClient, metric_id: str, value: float, day: str, **body) -> dict:
    resp = client.post(
        f"/metrics/{metric_id}/values",
        json={"value": value, "measured_at": day, **body},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _project(
    client: TestClient, domain_id: str, title: str = "Muscu 2027", **body
) -> str:
    """`start_at` par défaut : un projet à résultat visé a une saison, et
    c'est elle qui borne le comptage — sans date, seuls les relevés postérieurs
    à sa création compteraient."""
    payload = project_payload(title, **{"start_at": "2026-01-01", **body})
    return client.post(f"/domains/{domain_id}/projects", json=payload).json()["id"]


# --- Catalogue -------------------------------------------------------------


def test_create_and_list_metric(client: TestClient) -> None:
    d = _domain(client)

    m = _metric(client, d, name="Squat 1RM", direction="up")

    assert m["name"] == "Squat 1RM"
    assert m["direction"] == "up"
    assert m["latest"] is None and m["best"] is None
    assert [x["id"] for x in client.get(f"/domains/{d}/metrics").json()] == [m["id"]]


def test_duplicate_name_in_same_domain_refused(client: TestClient) -> None:
    """La contrainte existe pour empêcher « Squat 1RM » / « squat 1rm » de faire
    diverger la courbe — même leçon que le référentiel d'unités."""
    d = _domain(client)
    _metric(client, d, name="Squat 1RM")

    resp = client.post(f"/domains/{d}/metrics", json={"name": "squat 1rm"})
    assert resp.status_code == 422


def test_same_name_allowed_in_another_domain(client: TestClient) -> None:
    """« Poids » a du sens dans plusieurs domaines : l'unicité est PAR domaine."""
    d1, d2 = _domain(client, "Musculation"), _domain(client, "Bien-être")
    _metric(client, d1, name="Poids")

    resp = client.post(f"/domains/{d2}/metrics", json={"name": "Poids"})
    assert resp.status_code == 201


def test_rename_keeps_values(client: TestClient) -> None:
    """Les relevés pointent la métrique, pas son libellé : renommer ne coupe rien."""
    d = _domain(client)
    m = _metric(client, d, name="Squat")
    _value(client, m["id"], 100, "2026-08-01")

    client.patch(f"/metrics/{m['id']}", json={"name": "Squat 1RM"})

    after = client.get(f"/metrics/{m['id']}").json()
    assert after["name"] == "Squat 1RM"
    assert after["latest"]["value"] == 100


# --- Relevés : « où j'en suis » vs le record -------------------------------


def test_latest_is_most_recent_not_biggest(client: TestClient) -> None:
    """« Où j'en suis » est le DERNIER relevé — une contre-performance compte."""
    d = _domain(client)
    m = _metric(client, d, direction="up")
    _value(client, m["id"], 100, "2026-08-01")
    _value(client, m["id"], 118, "2026-08-15")
    _value(client, m["id"], 112, "2026-08-20")  # jour de moins bien

    read = client.get(f"/metrics/{m['id']}").json()
    assert read["latest"]["value"] == 112
    assert read["best"]["value"] == 118


def test_best_follows_direction_down(client: TestClient) -> None:
    """Sur un temps, le meilleur est le plus PETIT — d'où `direction`."""
    d = _domain(client, "Course à pied")
    m = _metric(client, d, name="Temps sur 10 km", direction="down")
    _value(client, m["id"], 53.0, "2026-07-01")
    _value(client, m["id"], 48.5, "2026-08-01")
    _value(client, m["id"], 50.0, "2026-08-20")

    read = client.get(f"/metrics/{m['id']}").json()
    assert read["latest"]["value"] == 50.0
    assert read["best"]["value"] == 48.5


def test_values_do_not_sum(client: TestClient) -> None:
    """Le point de tout l'objet : un relevé REMPLACE, il ne s'ajoute pas."""
    d = _domain(client)
    m = _metric(client, d)
    _value(client, m["id"], 100, "2026-08-01")
    _value(client, m["id"], 110, "2026-08-10")

    assert client.get(f"/metrics/{m['id']}").json()["latest"]["value"] == 110
    assert len(client.get(f"/metrics/{m['id']}/values").json()) == 2


def test_value_without_activity(client: TestClient) -> None:
    """Le point de départ (« ~70 squat ») précède tout projet et toute séance."""
    d = _domain(client)
    m = _metric(client, d)

    v = _value(client, m["id"], 70, "2026-09-01")

    assert v["activity_id"] is None


def test_one_activity_carries_several_values(client: TestClient) -> None:
    """Une séance fullbody relève le squat, le DC et le RDL d'un même geste —
    c'est pourquoi les relevés sont une table et non des colonnes d'activité."""
    d = _domain(client)
    activity = client.post(
        "/activities", json={"domain_id": d, "title": "Fullbody", "done": True}
    ).json()
    squat = _metric(client, d, name="Squat 1RM")
    dc = _metric(client, d, name="DC")
    rdl = _metric(client, d, name="RDL")

    for metric, value in ((squat, 118), (dc, 40), (rdl, 130)):
        _value(client, metric["id"], value, "2026-08-26", activity_id=activity["id"])

    for metric, value in ((squat, 118), (dc, 40), (rdl, 130)):
        assert client.get(f"/metrics/{metric['id']}").json()["latest"]["value"] == value


def test_list_values_of_one_activity(client: TestClient) -> None:
    """Ce que le panneau d'activité lit : les relevés de CETTE séance, sans
    charger tout le catalogue du domaine."""
    d = _domain(client)
    seance = client.post(
        "/activities", json={"domain_id": d, "title": "Fullbody"}
    ).json()
    autre = client.post("/activities", json={"domain_id": d, "title": "Repos"}).json()
    squat = _metric(client, d, name="Squat 1RM")
    dc = _metric(client, d, name="DC")
    _value(client, squat["id"], 118, "2026-08-26", activity_id=seance["id"])
    _value(client, dc["id"], 40, "2026-08-26", activity_id=seance["id"])
    _value(client, squat["id"], 70, "2026-06-01")  # hors séance

    listed = client.get(f"/activities/{seance['id']}/metric-values").json()
    assert sorted(v["value"] for v in listed) == [40, 118]
    assert client.get(f"/activities/{autre['id']}/metric-values").json() == []


def test_moving_the_activity_moves_its_measures(client: TestClient) -> None:
    """Déplacer une séance déplace ce qu'on y a relevé : le squat a été soulevé
    le jour où la séance a eu lieu, pas le jour où on l'a saisi."""
    d = _domain(client)
    seance = client.post(
        "/activities",
        json={
            "domain_id": d,
            "title": "Fullbody",
            "start_at": "2026-08-26T18:00:00",
            "end_at": "2026-08-26T19:00:00",
            "done": True,
        },
    ).json()
    m = _metric(client, d)
    _value(client, m["id"], 118, "2026-08-26", activity_id=seance["id"])

    resp = client.patch(
        f"/activities/{seance['id']}",
        json={"start_at": "2026-08-28T18:00:00", "end_at": "2026-08-28T19:00:00"},
    )
    assert resp.status_code == 200, resp.text

    assert (
        client.get(f"/metrics/{m['id']}").json()["latest"]["measured_at"]
        == "2026-08-28"
    )


def test_a_session_measure_needs_an_activity_of_the_metric_domain(
    client: TestClient,
) -> None:
    """Un relevé en séance se prend sur une activité qui existe, du domaine de
    la métrique : un id inconnu n'arrive plus jusqu'à la clé étrangère."""
    d = _domain(client)
    cuisine = _domain(client, "Cuisine")
    m = _metric(client, d)
    ailleurs = client.post(
        "/activities",
        json={"domain_id": cuisine, "title": "Béchamel", "start_at": "2026-08-26"},
    ).json()["id"]
    body = {"value": 118, "measured_at": "2026-08-26"}

    inconnue = client.post(
        f"/metrics/{m['id']}/values",
        json={**body, "activity_id": "00000000-0000-0000-0000-000000000000"},
    )
    autre_domaine = client.post(
        f"/metrics/{m['id']}/values", json={**body, "activity_id": ailleurs}
    )

    assert inconnue.status_code == 404
    assert autre_domaine.status_code == 422
    assert client.get(f"/metrics/{m['id']}/values").json() == []


def test_moving_a_free_measure_is_untouched(client: TestClient) -> None:
    """Un relevé sans activité garde sa date : rien ne la porte à sa place."""
    d = _domain(client)
    m = _metric(client, d)
    _value(client, m["id"], 70, "2026-06-01")

    assert (
        client.get(f"/metrics/{m['id']}").json()["latest"]["measured_at"]
        == "2026-06-01"
    )


def test_deleting_the_activity_takes_its_measures(client: TestClient) -> None:
    """`CASCADE` (27/08/2026) : supprimer une séance emporte ses relevés.

    C'était `SET NULL` — « tu as bien soulevé 118 ce jour-là ». À l'usage, le
    relevé délié n'apparaissait dans aucun écran (seule la liste *d'une
    activité* savait en supprimer un) tout en continuant d'alimenter le record
    et la courbe : conservé mais inatteignable, donc incorrigible.
    """
    d = _domain(client)
    activity = client.post(
        "/activities", json={"domain_id": d, "title": "Fullbody"}
    ).json()
    m = _metric(client, d)
    _value(client, m["id"], 118, "2026-08-26", activity_id=activity["id"])

    assert client.delete(f"/activities/{activity['id']}").status_code == 204

    assert client.get(f"/metrics/{m['id']}/values").json() == []
    # Et le record repart avec : rien ne doit survivre au fond de la base pour
    # continuer à peser sur « où j'en suis ».
    assert client.get(f"/metrics/{m['id']}").json()["best"] is None


def test_deleting_the_activity_spares_independent_measures(
    client: TestClient,
) -> None:
    """Le CASCADE ne suit que le lien : un relevé saisi hors séance (le point de
    départ, celui qui précède le projet) n'appartient à aucune activité."""
    d = _domain(client)
    activity = client.post(
        "/activities", json={"domain_id": d, "title": "Fullbody"}
    ).json()
    m = _metric(client, d)
    _value(client, m["id"], 70, "2026-08-01")  # départ, sans séance
    _value(client, m["id"], 118, "2026-08-26", activity_id=activity["id"])

    assert client.delete(f"/activities/{activity['id']}").status_code == 204

    values = client.get(f"/metrics/{m['id']}/values").json()
    assert [v["value"] for v in values] == [70]


# --- Résultats visés -------------------------------------------------------


def test_project_targets_several_metrics(client: TestClient) -> None:
    """Un cycle de musculation vise le squat, le RDL et les tractions
    ensemble — la raison d'être de la table plutôt que de colonnes."""
    d = _domain(client)
    obj = _project(client, d)
    targets = {
        _metric(client, d, name=name)["id"]: value
        for name, value in (("Squat 1RM", 90), ("RDL", 100), ("Tractions", 6))
    }

    for metric_id, target in targets.items():
        resp = client.put(
            f"/projects/{obj}/metrics",
            json={"metric_id": metric_id, "target": target},
        )
        assert resp.status_code == 200, resp.text

    listed = client.get(f"/projects/{obj}/metrics").json()
    assert {x["metric_id"]: x["target"] for x in listed} == targets


def test_setting_twice_updates_instead_of_duplicating(client: TestClient) -> None:
    d = _domain(client)
    obj, m = _project(client, d), _metric(client, d)

    client.put(f"/projects/{obj}/metrics", json={"metric_id": m["id"], "target": 120})
    client.put(f"/projects/{obj}/metrics", json={"metric_id": m["id"], "target": 125})

    listed = client.get(f"/projects/{obj}/metrics").json()
    assert len(listed) == 1
    assert listed[0]["target"] == 125


def test_target_carries_where_i_am(client: TestClient) -> None:
    """Le résultat visé porte sa métrique, donc « où j'en suis » vient avec."""
    d = _domain(client)
    obj, m = _project(client, d), _metric(client, d)
    _value(client, m["id"], 118, "2026-08-26")
    client.put(f"/projects/{obj}/metrics", json={"metric_id": m["id"], "target": 120})

    listed = client.get(f"/projects/{obj}/metrics").json()
    assert listed[0]["metric"]["latest"]["value"] == 118


def test_metric_from_another_domain_refused(client: TestClient) -> None:
    d1, d2 = _domain(client, "Musculation"), _domain(client, "Cuisine")
    obj = _project(client, d2)
    m = _metric(client, d1)

    resp = client.put(
        f"/projects/{obj}/metrics", json={"metric_id": m["id"], "target": 120}
    )
    assert resp.status_code == 422


def test_unset_target_keeps_metric_and_values(client: TestClient) -> None:
    """Retirer un résultat visé ne touche pas la métrique : elle appartient au
    domaine, pas au projet qui la visait."""
    d = _domain(client)
    obj, m = _project(client, d), _metric(client, d)
    _value(client, m["id"], 118, "2026-08-26")
    client.put(f"/projects/{obj}/metrics", json={"metric_id": m["id"], "target": 120})

    assert client.delete(f"/projects/{obj}/metrics/{m['id']}").status_code == 204

    assert client.get(f"/projects/{obj}/metrics").json() == []
    assert client.get(f"/metrics/{m['id']}").json()["latest"]["value"] == 118


def test_metric_survives_the_project(client: TestClient) -> None:
    """LE point du modèle : le squat traverse plusieurs projets successifs.
    Supprimer le premier ne coupe pas la courbe."""
    d = _domain(client)
    obj, m = _project(client, d), _metric(client, d)
    _value(client, m["id"], 118, "2026-08-26")
    client.put(f"/projects/{obj}/metrics", json={"metric_id": m["id"], "target": 120})

    assert client.delete(f"/projects/{obj}").status_code == 204

    read = client.get(f"/metrics/{m['id']}")
    assert read.status_code == 200
    assert read.json()["latest"]["value"] == 118


# --- Suppression -----------------------------------------------------------


def test_usage_then_delete(client: TestClient) -> None:
    """La suppression emporte les relevés (ils n'ont pas de sens détachés) mais
    laisse les projets, qui perdent seulement leur résultat visé."""
    d = _domain(client)
    obj, m = _project(client, d), _metric(client, d)
    _value(client, m["id"], 100, "2026-08-01")
    _value(client, m["id"], 118, "2026-08-26")
    client.put(f"/projects/{obj}/metrics", json={"metric_id": m["id"], "target": 120})

    usage = client.get(f"/metrics/{m['id']}/usage").json()
    assert (usage["values"], usage["projects"]) == (2, 1)
    # Les derniers relevés, du plus récent au plus ancien.
    assert [v["value"] for v in usage["recent"]] == [118, 100]

    assert client.delete(f"/metrics/{m['id']}").status_code == 204

    assert client.get(f"/metrics/{m['id']}").status_code == 404
    assert client.get(f"/projects/{obj}").status_code == 200
    assert client.get(f"/projects/{obj}/metrics").json() == []


# --- Statut dérivé des cibles ----------------------------------------------


def test_untracked_project_keeps_manual_status(client: TestClient) -> None:
    """Sans cible, rien ne permet de conclure : le statut reste à la main."""
    d = _domain(client)
    obj = _project(client, d)

    assert client.get(f"/projects/{obj}").json()["is_tracked"] is False
    client.patch(f"/projects/{obj}", json={"status": "achieved"})
    assert client.get(f"/projects/{obj}").json()["status"] == "achieved"


def test_status_becomes_achieved_when_targets_are_met(client: TestClient) -> None:
    """Toutes les cibles atteintes → atteint, sans avoir à le déclarer."""
    d = _domain(client)
    obj, m = _project(client, d), _metric(client, d, direction="up")
    client.put(f"/projects/{obj}/metrics", json={"metric_id": m["id"], "target": 120})

    assert client.get(f"/projects/{obj}").json()["status"] == "in_progress"
    _value(client, m["id"], 118, "2026-08-01")
    assert client.get(f"/projects/{obj}").json()["status"] == "in_progress"
    _value(client, m["id"], 122, "2026-08-20")
    assert client.get(f"/projects/{obj}").json()["status"] == "achieved"


def test_record_counts_not_the_last_reading(client: TestClient) -> None:
    """Un PR reste acquis même si la séance suivante est moins bonne."""
    d = _domain(client, "Course à pied")
    obj = _project(client, d)
    m = _metric(client, d, name="Temps sur 10 km", direction="down")
    client.put(f"/projects/{obj}/metrics", json={"metric_id": m["id"], "target": 45})

    _value(client, m["id"], 44, "2026-08-01")  # cible franchie
    _value(client, m["id"], 48, "2026-08-20")  # contre-performance

    assert client.get(f"/projects/{obj}").json()["status"] == "achieved"


def test_a_record_predating_the_project_does_not_satisfy_it(
    client: TestClient,
) -> None:
    """Le cas réel : un PR de 2025 validait une cible posée en 2026, et
    le projet naissait atteint sans qu'on ait couru. Un projet ne peut pas
    être satisfait par ce qui le précède."""
    d = _domain(client, "Course à pied")
    m = _metric(client, d, name="Temps sur 10 km", direction="down")
    _value(client, m["id"], 50, "2025-07-05")  # le PR hérité
    obj = _project(client, d, title="Record sur 10 km", start_at="2026-08-08")
    client.put(f"/projects/{obj}/metrics", json={"metric_id": m["id"], "target": 50})

    assert client.get(f"/projects/{obj}").json()["status"] == "in_progress"

    result = client.get(f"/projects/{obj}/metrics").json()[0]
    # Il n'est pas ignoré pour autant : c'est la barre à battre, en repère.
    assert result["baseline"]["value"] == 50
    assert result["best_in_period"] is None
    assert result["is_met"] is False
    # Le record ABSOLU, lui, ne bouge pas — la page domaine dit qui tu es.
    assert result["metric"]["best"]["value"] == 50


def test_a_reading_after_the_deadline_does_not_count(client: TestClient) -> None:
    """« Sous 49:30 avant le 31 décembre » tenu le 15 janvier n'a pas été tenu.

    Aucune tolérance : tout seuil de grâce serait arbitraire et ne ferait que
    déplacer la falaise. Prolonger une saison est une décision, elle s'écrit en
    déplaçant l'échéance — ce que le second temps vérifie.
    """
    d = _domain(client, "Course à pied")
    m = _metric(client, d, name="Temps sur 10 km", direction="down")
    # Saison close : l'échéance doit être PASSÉE pour qu'un manque se solde en
    # échec — sinon le projet attend encore, et il attendrait à raison.
    obj = _project(client, d, title="PR", start_at="2025-08-08", due_at="2025-12-31")
    client.put(f"/projects/{obj}/metrics", json={"metric_id": m["id"], "target": 49.5})

    _value(client, m["id"], 49, "2026-01-15")  # mieux que la cible, trop tard

    assert client.get(f"/projects/{obj}").json()["status"] == "failed"

    # On décale l'échéance : la course entre dans la saison, la cible tombe.
    client.patch(f"/projects/{obj}", json={"due_at": "2026-01-31"})

    assert client.get(f"/projects/{obj}").json()["status"] == "achieved"


def test_before_the_deadline_a_missing_target_waits(client: TestClient) -> None:
    """Avant l'échéance, une cible manquante n'est pas un échec : le projet
    attend ses cibles. Sa saison a commencé, donc il est *en cours* — le raté
    ne se constate qu'à l'échéance (design #32)."""
    d = _domain(client)
    obj, m = _project(client, d), _metric(client, d)
    client.put(f"/projects/{obj}/metrics", json={"metric_id": m["id"], "target": 120})

    assert client.get(f"/projects/{obj}").json()["status"] == "in_progress"


def test_passed_deadline_with_a_missing_target_fails(client: TestClient) -> None:
    d = _domain(client)
    obj = client.post(
        f"/domains/{d}/projects",
        json=project_payload("Muscu 2026", due_at="2026-01-31"),
    ).json()["id"]
    m = _metric(client, d)
    client.put(f"/projects/{obj}/metrics", json={"metric_id": m["id"], "target": 120})

    assert client.get(f"/projects/{obj}").json()["status"] == "failed"


def test_abandon_wins_over_met_targets(client: TestClient) -> None:
    """L'abandon est une décision qu'aucun chiffre ne dira : il l'emporte."""
    d = _domain(client)
    obj, m = _project(client, d), _metric(client, d)
    client.put(f"/projects/{obj}/metrics", json={"metric_id": m["id"], "target": 120})
    _value(client, m["id"], 130, "2026-08-01")
    assert client.get(f"/projects/{obj}").json()["status"] == "achieved"

    client.patch(f"/projects/{obj}", json={"status": "abandoned"})

    read = client.get(f"/projects/{obj}").json()
    assert read["status"] == "abandoned"
    assert read["manual_status"] == "abandoned"


# --- Le départ du fil de résultat (design #27) --------------------------------


def test_the_thread_starts_from_the_inherited_record(client: TestClient) -> None:
    """Cible plus exigeante que le record d'avant : on part de lui."""
    d = _domain(client, "Course à pied")
    m = _metric(client, d, name="Temps sur 10 km", direction="down")
    _value(client, m["id"], 52, "2025-07-05")
    obj = _project(client, d, start_at="2026-08-08")
    client.put(f"/projects/{obj}/metrics", json={"metric_id": m["id"], "target": 49})
    _value(client, m["id"], 51, "2026-08-20")

    result = client.get(f"/projects/{obj}/metrics").json()[0]

    assert result["start"]["value"] == 52


def test_a_target_below_the_record_starts_from_the_season(client: TestClient) -> None:
    """Reprise après blessure : record 50, cible 55. On ne part pas d'un niveau
    qu'on ne vise plus — et la cible n'est pas atteinte d'office."""
    d = _domain(client, "Course à pied")
    m = _metric(client, d, name="Temps sur 10 km", direction="down")
    _value(client, m["id"], 50, "2025-07-05")
    obj = _project(client, d, start_at="2026-08-08")
    client.put(f"/projects/{obj}/metrics", json={"metric_id": m["id"], "target": 55})
    _value(client, m["id"], 60, "2026-08-20")
    _value(client, m["id"], 58, "2026-09-01")

    result = client.get(f"/projects/{obj}/metrics").json()[0]

    assert result["start"]["value"] == 60
    assert result["is_met"] is False


def test_no_reading_no_start(client: TestClient) -> None:
    d = _domain(client)
    m = _metric(client, d, direction="up")
    obj = _project(client, d)
    client.put(f"/projects/{obj}/metrics", json={"metric_id": m["id"], "target": 100})

    assert client.get(f"/projects/{obj}/metrics").json()[0]["start"] is None


def test_a_designated_reading_is_the_start(client: TestClient) -> None:
    """Record sur 10 km : record 50:00 d'il y a un an, saison commencée à 55:00. La
    règle part de 50:00 ; le relevé désigné corrige, et `null` rend la main."""
    d = _domain(client, "Course à pied")
    m = _metric(client, d, name="Temps sur 10 km", direction="down")
    _value(client, m["id"], 50, "2025-07-05")
    obj = _project(client, d, start_at="2026-07-01")
    client.put(f"/projects/{obj}/metrics", json={"metric_id": m["id"], "target": 49})
    first = _value(client, m["id"], 55, "2026-07-01")
    _value(client, m["id"], 53, "2026-08-27")
    url = f"/projects/{obj}/metrics/{m['id']}/start"

    resp = client.put(url, json={"value_id": first["id"]})

    assert resp.status_code == 200, resp.text
    assert resp.json()["start"]["value"] == 55
    assert resp.json()["start_value_id"] == first["id"]
    assert client.put(url, json={"value_id": None}).json()["start"]["value"] == 50


def test_the_start_is_a_reading_of_the_targeted_metric(client: TestClient) -> None:
    d = _domain(client)
    squat = _metric(client, d, name="Squat", direction="up")
    rdl = _metric(client, d, name="RDL", direction="up")
    obj = _project(client, d)
    client.put(
        f"/projects/{obj}/metrics", json={"metric_id": squat["id"], "target": 100}
    )
    other = _value(client, rdl["id"], 80, "2026-02-01")

    resp = client.put(
        f"/projects/{obj}/metrics/{squat['id']}/start",
        json={"value_id": other["id"]},
    )

    assert resp.status_code == 422


def test_deleting_the_designated_reading_restores_the_rule(client: TestClient) -> None:
    d = _domain(client)
    m = _metric(client, d, direction="up")
    obj = _project(client, d)
    client.put(f"/projects/{obj}/metrics", json={"metric_id": m["id"], "target": 100})
    _value(client, m["id"], 60, "2026-02-01")
    pinned = _value(client, m["id"], 70, "2026-03-01")
    client.put(
        f"/projects/{obj}/metrics/{m['id']}/start", json={"value_id": pinned["id"]}
    )

    client.delete(f"/metric-values/{pinned['id']}")
    result = client.get(f"/projects/{obj}/metrics").json()[0]

    assert result["start_value_id"] is None
    assert result["start"]["value"] == 60
