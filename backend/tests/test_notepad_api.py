"""Tests du pense-bête — un texte unique, toujours là."""

from fastapi.testclient import TestClient


def test_the_notepad_exists_before_anyone_wrote_in_it(client: TestClient) -> None:
    """Pas de 404 sur un pense-bête jamais ouvert : il est vide, pas absent."""
    resp = client.get("/notepad")

    assert resp.status_code == 200
    assert resp.json()["content"] == ""


def test_what_is_written_comes_back(client: TestClient) -> None:
    client.put("/notepad", json={"content": "le compteur de la rampe est faux"})

    assert (
        client.get("/notepad").json()["content"] == "le compteur de la rampe est faux"
    )


def test_writing_replaces_and_never_accumulates(client: TestClient) -> None:
    """`PUT` remplace : c'est un champ de saisie, pas un journal."""
    client.put("/notepad", json={"content": "première note"})
    client.put("/notepad", json={"content": "première note\nseconde note"})

    assert client.get("/notepad").json()["content"] == "première note\nseconde note"


def test_the_notepad_stays_a_singleton(client: TestClient, db) -> None:
    """Le relire et l'écrire ne sème pas de lignes en double."""
    from sophia.infrastructure.models import Notepad

    client.get("/notepad")
    client.put("/notepad", json={"content": "a"})
    client.get("/notepad")
    client.put("/notepad", json={"content": "b"})

    assert db.query(Notepad).count() == 1


def test_emptying_it_is_allowed(client: TestClient) -> None:
    """Tout traiter puis tout effacer est l'usage normal, pas une erreur."""
    client.put("/notepad", json={"content": "quelque chose"})

    resp = client.put("/notepad", json={"content": ""})

    assert resp.status_code == 200
    assert resp.json()["content"] == ""
