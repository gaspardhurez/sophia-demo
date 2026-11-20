"""Remplit une base vide avec des données de démonstration, entièrement fictives.

Usage, depuis `backend/` :

    uv run alembic upgrade head
    uv run python scripts/seed_demo.py

Le script passe par l'API (FastAPI `TestClient`), comme le ferait le front :
les données de démo respectent donc les mêmes règles de validation.
Les dates sont relatives à aujourd'hui, pour que la démo reste « en cours ».

Deux écarts, les mêmes que dans les tests :

- le compagnon (LLM) et la lecture des sources sont remplacés par des faux
  branchés sur les dépendances de l'app : la vérification des notes rend des
  commentaires écrits ici, sans réseau ni clé ;
- l'interro ne se passe qu'à partir de son jour dû, au plus tôt demain après
  son lancement : `_make_recall_due` ramène ce jour à aujourd'hui, en base,
  comme `_make_due` dans `tests/test_recall_api.py`.
"""

import uuid
from datetime import date, datetime, time, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient

from sophia.api.deps import get_companion, get_link_reader, get_source_reader
from sophia.application.companion import Availability, ReviewFinding
from sophia.application.review import SourceText
from sophia.infrastructure.database import SessionLocal
from sophia.infrastructure.models import AcquisitionPlan
from sophia.main import app


class _NoLinkReader:
    """Pas de réseau pendant le seed : les liens ne sont pas lus."""

    def read(self, url: str) -> None:
        return None


app.dependency_overrides[get_link_reader] = lambda: _NoLinkReader()
client = TestClient(app)
TODAY = date.today()
MONDAY = TODAY - timedelta(days=TODAY.weekday())


def call(method: str, url: str, body: dict | None = None) -> dict | list:
    resp = client.request(method, url, json=body)
    if resp.status_code >= 300:
        raise RuntimeError(f"{method} {url} → {resp.status_code}: {resp.text}")
    return resp.json() if resp.content else {}


def post(url: str, **body) -> dict:
    return call("POST", url, body)


def put(url: str, **body) -> dict:
    return call("PUT", url, body)


def patch(url: str, **body) -> dict:
    return call("PATCH", url, body)


def day(offset: int) -> str:
    return (TODAY + timedelta(days=offset)).isoformat()


def at(offset: int, hour: int, minute: int = 0) -> str:
    moment = datetime.combine(TODAY + timedelta(days=offset), time(hour, minute))
    return moment.isoformat()


def doc(*blocks: dict) -> dict:
    return {"type": "doc", "content": list(blocks)}


def h(text: str, level: int = 2) -> dict:
    return {
        "type": "heading",
        "attrs": {"level": level},
        "content": [{"type": "text", "text": text}],
    }


def p(text: str) -> dict:
    return {"type": "paragraph", "content": [{"type": "text", "text": text}]}


def ul(*items: str) -> dict:
    return {
        "type": "bulletList",
        "content": [{"type": "listItem", "content": [p(i)]} for i in items],
    }


def q(question_id: str) -> dict:
    """Une question posée dans les notes, à sa place dans le document."""
    return {"type": "question", "attrs": {"id": question_id}}


# --- Faux ports, comme dans les tests ---------------------------------------


class _DemoCompanion:
    """Le compagnon de la démo : des commentaires et une réponse écrits ici."""

    def __init__(self, findings: list[ReviewFinding], answer: str) -> None:
        self.findings = findings
        self.answer = answer

    def availability(self) -> Availability:
        return Availability(available=True)

    def review_notes(self, ctx) -> list[ReviewFinding]:
        return list(self.findings)

    def reply_in_thread(self, ctx) -> str:
        return self.answer


class _DemoSourceReader:
    def read(self, reference, part) -> SourceText:
        return SourceText(kind="text", text="Le chapitre sur le présent.")


def _make_recall_due(plan_id: str) -> None:
    """Amène l'interro du cycle à aujourd'hui (cf. la docstring du module)."""
    with SessionLocal() as db:
        plan = db.get(AcquisitionPlan, uuid.UUID(plan_id))
        plan.recall_next_due_at = TODAY
        db.commit()


def _step_of(steps: list[dict], offset: int) -> str | None:
    """L'étape datée qui couvre ce jour."""
    d = day(offset)
    for s in steps:
        if s["start_at"] and s["due_at"] and s["start_at"] <= d <= s["due_at"]:
            return s["id"]
    return None


def main() -> None:
    if call("GET", "/domains"):
        raise SystemExit(
            "La base n'est pas vide : lancez le seed sur une base fraîche."
        )

    # --- Unités --------------------------------------------------------------
    km = post(
        "/units",
        name="kilomètre",
        plural="kilomètres",
        label="km",
        kind="distance",
        emoji="📏",
    )
    minute = post(
        "/units",
        name="minute",
        plural="minutes",
        label="min",
        kind="time",
        seconds_per_unit=60,
    )

    # --- Domaines ------------------------------------------------------------
    sport = post(
        "/domains",
        name="Course à pied",
        emoji="🏃",
        color="emerald",
        vision="Courir régulièrement, sans se blesser, pour le plaisir.",
    )
    langues = post(
        "/domains",
        name="Espagnol",
        emoji="🗣️",
        color="amber",
        vision="Pouvoir voyager et discuter sans passer par l'anglais.",
    )
    musique = post(
        "/domains",
        name="Guitare",
        emoji="🎸",
        color="violet",
        vision="Jouer des morceaux entiers avec des amis.",
    )
    tech = post(
        "/domains",
        name="Développement",
        emoji="💻",
        color="sky",
        vision="Écrire du SQL clair et comprendre ce que fait la base.",
    )

    # --- Course à pied : trois étapes vers le semi ---------------------------
    sortie = post(
        "/activity-types",
        domain_id=sport["id"],
        title="Sortie course",
        emoji="👟",
        unit_id=km["id"],
    )
    semi = post(
        f"/domains/{sport['id']}/projects",
        title="Courir un semi-marathon",
        emoji="🏅",
        description="Finir un semi-marathon au printemps.",
        start_at=day(-60),
        due_at=day(120),
    )
    put(
        f"/projects/{semi['id']}/activity-types/{sortie['id']}",
        planning="weekly",
        weekdays=[1, 3, 6],
        slot_start="07:30",
        slot_minutes=60,
    )
    total_km = post(
        f"/projects/{semi['id']}/totals",
        mode="value",
        unit_id=km["id"],
        target=400,
        activity_type_ids=[sortie["id"]],
    )["totals"][-1]
    chrono = post(
        f"/domains/{sport['id']}/metrics",
        name="Temps sur 10 km",
        emoji="⏱️",
        unit_id=minute["id"],
        direction="down",
    )
    put(f"/projects/{semi['id']}/metrics", metric_id=chrono["id"], target=50)

    stages = [
        ("Base", "Courir souvent, lentement, sans douleur.", -60, -15),
        ("Volume", "Allonger la sortie longue, garder une séance plus vive.", -14, 60),
        ("Affûtage", "Baisser le volume, arriver frais au départ.", 61, 120),
    ]
    for title, description, start, end in stages:
        post(
            f"/projects/{semi['id']}/steps",
            title=title,
            description=description,
            start_at=day(start),
            due_at=day(end),
        )
    steps = call("GET", f"/projects/{semi['id']}")["steps"]
    base, volume, affutage = steps
    # Une tranche du Total par étape, un palier sur le 10 km pour les deux dernières.
    for step, km_target in ((base, 100), (volume, 200), (affutage, 100)):
        put(f"/steps/{step['id']}/totals", total_id=total_km["id"], target=km_target)
    put(f"/steps/{volume['id']}/metrics", metric_id=chrono["id"], target=53)
    put(f"/steps/{affutage['id']}/metrics", metric_id=chrono["id"], target=50)

    def run(offset: int, distance: float, done: bool = True, title="Sortie course"):
        return post(
            "/activities",
            domain_id=sport["id"],
            activity_type_id=sortie["id"],
            title=title,
            start_at=at(offset, 7, 30),
            end_at=at(offset, 8, 30),
            projects=[{"project_id": semi["id"], "step_id": _step_of(steps, offset)}],
            values=[{"unit_id": km["id"], "value": distance}],
            done=done,
        )

    for i, offset in enumerate(range(-55, 0, 3)):
        run(offset, 6 + (i % 4) * 1.5)
    # Les tests sur 10 km : le chrono se relève depuis la sortie elle-même.
    for offset, value in [(-56, 58.5), (-35, 56.2), (-14, 54.9), (-3, 53.7)]:
        test = run(offset, 10, title="Test sur 10 km")
        post(
            f"/metrics/{chrono['id']}/values",
            value=value,
            measured_at=day(offset),
            activity_id=test["id"],
        )
    # Une sortie manquée en début de semaine, reportée d'une semaine.
    missed = run(-6, 8, done=False)
    post(f"/activities/{missed['id']}/postpone")

    # --- Espagnol : un arbre de savoirs, deux étapes, un cycle d'étude --------
    sk = f"/domains/{langues['id']}/skills"
    grammaire = post(sk, name="Grammaire")
    present = post(
        sk, name="Le présent de l'indicatif", parent_skill_id=grammaire["id"]
    )
    passe = post(sk, name="Le passé composé", parent_skill_id=grammaire["id"])
    vocab = post(sk, name="Vocabulaire")
    presenter = post(
        sk, name="Se présenter", parent_skill_id=vocab["id"], status="acquired"
    )
    voyager = post(sk, name="Voyager", parent_skill_id=vocab["id"])
    oral = post(sk, name="Compréhension orale")

    conversation = post(
        f"/domains/{langues['id']}/projects",
        title="Tenir une conversation en espagnol",
        emoji="💬",
        start_at=day(-30),
        due_at=day(150),
        skill_ids=[present["id"], passe["id"], presenter["id"], voyager["id"]],
    )
    au_present = post(
        f"/projects/{conversation['id']}/steps",
        title="Se débrouiller au présent",
        start_at=day(-30),
        due_at=day(40),
    )["steps"][-1]
    au_passe = post(
        f"/projects/{conversation['id']}/steps",
        title="Raconter ses voyages",
        start_at=day(41),
        due_at=day(150),
    )["steps"][-1]
    # La séquence : ce qu'on apprend d'abord, étape par étape.
    put(
        f"/projects/{conversation['id']}/sequence",
        segments=[
            {
                "step_id": au_present["id"],
                "skill_ids": [presenter["id"], present["id"]],
            },
            {"step_id": au_passe["id"], "skill_ids": [voyager["id"], passe["id"]]},
        ],
    )

    plan = post(f"/skills/{present['id']}/plans/start", project_id=conversation["id"])
    patch(
        f"/plans/{plan['id']}",
        name="Premier cycle",
        target_level="Parler de son quotidien au présent, sans chercher ses mots.",
    )
    grammar_book = post(
        f"/skills/{present['id']}/resources",
        title="Grammaire espagnole, chapitre 3",
        author="Manuel de référence",
        part="Le présent",
        plan_id=plan["id"],
    )
    post(
        f"/skills/{present['id']}/resources",
        title="Conjugaison des verbes irréguliers",
        reference="https://example.org/espagnol/present",
        plan_id=plan["id"],
    )
    conjuguer = post(
        f"/skills/{present['id']}/practice",
        title="Conjuguer dix verbes réguliers",
        emoji="✍️",
        instructions="Conjuguer hablar, comer et vivir à toutes les personnes.",
        plan_id=plan["id"],
    )
    post(
        f"/skills/{present['id']}/practice",
        title="Les diphtongues en dictée",
        emoji="🎧",
        instructions="Écrire querer, poder et dormir sous la dictée, au présent.",
        plan_id=plan["id"],
    )
    post(
        f"/skills/{present['id']}/practice",
        title="Décrire sa journée à voix haute",
        emoji="🗣️",
        nature="situation",
        instructions="Deux minutes sans notes : le matin, le travail, le soir.",
        plan_id=plan["id"],
    )
    patch(f"/plans/{plan['id']}/items/{conjuguer['id']}", done=True)

    # Les notes, et leurs questions à leur place dans le document.
    def question(**body) -> str:
        return post(f"/skills/{present['id']}/note-questions", **body)["id"]

    q_terminaisons = question(
        kind="factual",
        form="list",
        prompt="Quelles sont les trois terminaisons des verbes réguliers ?",
        points=[{"text": "-ar"}, {"text": "-er"}, {"text": "-ir"}],
    )
    q_hablar = question(
        kind="factual",
        prompt="« Nous parlons » ?",
        answer="Hablamos.",
    )
    q_diphtongue = question(
        kind="elaborative",
        prompt="Pourquoi « nosotros » ne diphtongue-t-il pas (queremos, podemos) ?",
        answer=(
            "La diphtongue n'apparaît que lorsque la voyelle est accentuée ; à "
            "nosotros et vosotros, l'accent tombe sur la terminaison."
        ),
    )
    q_poder = question(
        kind="factual",
        prompt="« Je peux » ?",
        answer="Puedo.",
    )
    put(
        f"/skills/{present['id']}/notes",
        doc=doc(
            h("Les verbes réguliers"),
            p(
                "Trois groupes selon la terminaison : -ar, -er, -ir. On retire la "
                "terminaison et on ajoute celle de la personne."
            ),
            ul(
                "hablar → hablo, hablas, habla",
                "comer → como, comes, come",
                "vivir → vivo, vives, vive",
            ),
            q(q_terminaisons),
            q(q_hablar),
            h("Les verbes à diphtongue"),
            p(
                "Certains verbes changent de voyelle sous l'accent : "
                "e → ie (querer → quiero), o → ue (poder → puedo)."
            ),
            q(q_diphtongue),
            q(q_poder),
        ),
    )

    # Les séances d'étude, puis un exercice fait et son retour.
    for offset in (-18, -11):
        post(
            "/activities",
            domain_id=langues["id"],
            title="Séance d'espagnol",
            start_at=at(offset, 19),
            end_at=at(offset, 19, 45),
            projects=[{"project_id": conversation["id"]}],
            acts=[{"skill_id": present["id"], "kind": "study", "plan_id": plan["id"]}],
            done=True,
        )
    practised = post(
        "/activities",
        domain_id=langues["id"],
        title="Séance d'espagnol",
        start_at=at(-4, 19),
        end_at=at(-4, 19, 45),
        projects=[{"project_id": conversation["id"]}],
        acts=[
            {"skill_id": present["id"], "kind": "study", "plan_id": plan["id"]},
            {
                "skill_id": present["id"],
                "kind": "practice",
                "plan_id": plan["id"],
                "practice_item_id": conjuguer["id"],
            },
        ],
        done=True,
    )
    practice_act = next(a for a in practised["acts"] if a["kind"] == "practice")
    put(
        f"/activities/{practised['id']}/acts/{practice_act['id']}/feedback",
        level=3,
        feedback="Juste au présent, mais j'hésite encore sur vivir à vosotros.",
    )

    # Les notes du manuel, vérifiées : deux commentaires, dont un résolu après
    # une réponse.
    put(
        f"/resources/{grammar_book['id']}/notes",
        doc=doc(
            h("Le présent"),
            ul(
                "Les verbes en -er et en -ir se conjuguent pareil.",
                "Ser et estar se traduisent tous deux par « être ».",
            ),
        ),
    )
    finding = dict(after_quote=None, prompt_version="review@demo", model="demo")
    app.dependency_overrides[get_source_reader] = lambda: _DemoSourceReader()
    app.dependency_overrides[get_companion] = lambda: _DemoCompanion(
        [
            ReviewFinding(
                kind="inexact",
                quote="Les verbes en -er et en -ir se conjuguent pareil.",
                message=(
                    "Presque : ils diffèrent à nosotros et vosotros "
                    "(comemos / vivimos, coméis / vivís)."
                ),
                where_to_look="Tableau des terminaisons",
                **finding,
            ),
            ReviewFinding(
                kind="surface",
                quote="Ser et estar se traduisent tous deux par « être ».",
                message="Le chapitre dit aussi quand employer l'un ou l'autre.",
                where_to_look="Encadré « ser ou estar »",
                **finding,
            ),
        ],
        answer="Oui, c'est cela : la nuance tient à nosotros et vosotros.",
    )
    comments = post(
        f"/resources/{grammar_book['id']}/review",
        pasted_text="Le chapitre sur le présent.",
    )["comments"]
    post(
        f"/review-comments/{comments[0]['id']}/replies",
        body="Donc seules les terminaisons de nosotros et vosotros changent ?",
    )
    patch(f"/review-comments/{comments[0]['id']}", status="resolved")
    del app.dependency_overrides[get_companion]
    del app.dependency_overrides[get_source_reader]

    # L'interro : lancée, passée aujourd'hui, deux questions ratées puis sues.
    post(f"/plans/{plan['id']}/recall/launch")
    _make_recall_due(plan["id"])
    session = post(f"/plans/{plan['id']}/recall")
    url = f"/recall-sessions/{session['id']}/answers"
    rows = session["answers"]
    for row, known in zip(rows, (True, False, True, False), strict=True):
        if row["form"] == "list":
            points = [pt["id"] for pt in row["points"]][: 3 if known else 2]
            put(f"{url}/{row['id']}", answer="…", known_points=points)
        else:
            put(f"{url}/{row['id']}", answer="…", known=known)
    for row in call("GET", f"/recall-sessions/{session['id']}")["answers"]:
        if not row["known"]:
            if row["form"] == "list":
                put(
                    f"{url}/{row['id']}",
                    known_points=[pt["id"] for pt in row["points"]],
                )
            else:
                put(f"{url}/{row['id']}", known=True)

    # --- Guitare : des réalisations à cocher --------------------------------
    pratique = post(
        "/activity-types", domain_id=musique["id"], title="Pratique guitare", emoji="🎶"
    )
    repertoire = post(
        f"/domains/{musique['id']}/projects",
        title="Jouer cinq morceaux en entier",
        emoji="🎼",
        start_at=day(-90),
        due_at=day(90),
    )
    put(
        f"/projects/{repertoire['id']}/activity-types/{pratique['id']}",
        planning="weekly",
        weekdays=[0, 4],
        slot_start="20:00",
        slot_minutes=30,
    )
    post(
        f"/projects/{repertoire['id']}/totals",
        mode="duration",
        target=25,
        activity_type_ids=[pratique["id"]],
    )
    songs = [
        post(f"/projects/{repertoire['id']}/achievements", title=t, emoji="🎵")
        for t in (
            "Une balade en arpèges",
            "Un blues en douze mesures",
            "Un morceau en barrés",
            "Un classique au médiator",
            "Une composition personnelle",
        )
    ]
    for i, offset in enumerate(range(-80, 0, 4)):
        activity = post(
            "/activities",
            domain_id=musique["id"],
            activity_type_id=pratique["id"],
            title="Pratique guitare",
            start_at=at(offset, 20),
            end_at=at(offset, 20, 30),
            projects=[{"project_id": repertoire["id"]}],
            done=True,
        )
        if i in (6, 14):
            post(
                f"/activities/{activity['id']}/achievements",
                achievement_id=songs[i // 8]["id"],
            )
    for song in songs[:2]:
        patch(f"/achievements/{song['id']}", done=True)

    # --- Guitare et Espagnol : un projet sur deux domaines -------------------
    chansons = post(
        f"/domains/{musique['id']}/projects",
        title="Chanter trois chansons en espagnol",
        emoji="🎤",
        description="S'accompagner à la guitare et comprendre ce qu'on chante.",
        start_at=day(-20),
        due_at=day(70),
        secondary_domain_ids=[langues["id"]],
        skill_ids=[oral["id"]],
    )
    ballads = [
        post(f"/projects/{chansons['id']}/achievements", title=t, emoji="🎶")
        for t in (
            "Une chanson traditionnelle",
            "Une ballade lente",
            "Une chanson à danser",
        )
    ]
    patch(f"/achievements/{ballads[0]['id']}", done=True)
    post(
        "/activities",
        domain_id=musique["id"],
        title="Paroles et accords",
        start_at=at(-2, 20),
        end_at=at(-2, 20, 45),
        projects=[{"project_id": chansons["id"]}],
        done=True,
    )

    # --- Développement : un savoir technique ---------------------------------
    st = f"/domains/{tech['id']}/skills"
    sql = post(st, name="SQL")
    jointures = post(
        st, name="Les jointures", parent_skill_id=sql["id"], status="acquired"
    )
    agregation = post(
        st, name="L'agrégation", parent_skill_id=sql["id"], status="in_progress"
    )
    index = post(st, name="Les index", parent_skill_id=sql["id"])
    sans_orm = post(
        f"/domains/{tech['id']}/projects",
        title="Écrire du SQL sans ORM",
        emoji="🧮",
        start_at=day(-10),
        due_at=day(80),
        skill_ids=[jointures["id"], agregation["id"], index["id"]],
    )
    put(
        f"/skills/{agregation['id']}/notes",
        doc=doc(
            h("GROUP BY et HAVING"),
            p(
                "WHERE filtre les lignes avant le regroupement, "
                "HAVING filtre les groupes après."
            ),
            ul(
                "COUNT(*) compte les lignes, COUNT(col) ignore les NULL",
                "Les agrégats ignorent les NULL",
            ),
        ),
    )
    sql_plan = post(
        f"/skills/{agregation['id']}/plans/start", project_id=sans_orm["id"]
    )
    for title, nature in (
        ("Compter les commandes par client", "isolated"),
        ("Le chiffre d'affaires par mois, sans les mois vides", "isolated"),
        ("Le tableau de bord d'une petite boutique", "situation"),
    ):
        post(
            f"/skills/{agregation['id']}/practice",
            title=title,
            nature=nature,
            emoji="🧮",
            plan_id=sql_plan["id"],
        )
    post(
        "/activities",
        domain_id=tech["id"],
        title="Séance SQL",
        start_at=at(-1, 18),
        end_at=at(-1, 19),
        projects=[{"project_id": sans_orm["id"]}],
        acts=[
            {"skill_id": agregation["id"], "kind": "study", "plan_id": sql_plan["id"]}
        ],
        done=True,
    )

    # --- Envies, indisponibilités, bloc-notes ---------------------------------
    put(
        "/wishes/wish",
        items=[
            {
                "id": str(uuid4()),
                "text": "Essayer un trail en forêt",
                "domain_id": sport["id"],
            },
            {
                "id": str(uuid4()),
                "text": "Regarder un film en espagnol sous-titré",
                "domain_id": langues["id"],
            },
            {
                "id": str(uuid4()),
                "text": "Apprendre un morceau à la demande d'un ami",
                "domain_id": musique["id"],
            },
        ],
    )
    put(
        "/wishes/commitment",
        items=[
            {
                "id": str(uuid4()),
                "text": "Une sortie longue ce week-end",
                "domain_id": sport["id"],
            },
        ],
    )
    post(
        "/unavailabilities",
        title="Week-end en famille",
        emoji="🏡",
        all_day=True,
        start_at=at(10, 0),
        end_at=at(12, 0),
    )
    put(
        "/notepad",
        content=(
            "Idées en vrac : tester les intervalles le jeudi, "
            "trouver un partenaire d'échange en espagnol."
        ),
    )

    # --- Préparation de la semaine -------------------------------------------
    # Le rituel du dimanche dernier : il valide la semaine passée et pose celle
    # en cours, projet par projet.
    prep = f"/preparations/{MONDAY.isoformat()}"
    post(f"{prep}/start")
    for project in (semi, conversation, repertoire, chansons, sans_orm):
        post(f"{prep}/projects/{project['id']}/pose")
        put(f"{prep}/projects/{project['id']}/reviewed")
    post(f"{prep}/validate")

    print(
        "Base de démo prête : 4 domaines, 5 projets, des étapes, des activités, "
        "des savoirs, une interro et des notes relues."
    )


if __name__ == "__main__":
    main()
