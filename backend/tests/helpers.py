"""Helpers de test partagés."""

from datetime import date, timedelta

from sqlalchemy.orm import Session

from sophia.infrastructure.models import Domain, Skill

# Marge autour d'aujourd'hui pour une période par défaut : assez large pour
# qu'aucun test ne bascule selon le jour où il tourne.
_MARGIN = timedelta(days=30)


def make_skill(
    db: Session,
    domain: Domain,
    name: str,
    parent: Skill | None = None,
    **kwargs,
) -> Skill:
    """Crée une compétence dans le domaine."""
    skill = Skill(
        name=name,
        domain_id=domain.id,
        parent_skill_id=parent.id if parent else None,
        **kwargs,
    )
    db.add(skill)
    db.flush()
    return skill


def _as_date(value: date | str | None) -> date | None:
    if value is None or isinstance(value, date):
        return value
    return date.fromisoformat(value)


def period_dates(
    start_at: date | str | None = None, due_at: date | str | None = None
) -> tuple[date, date]:
    """Une période valide (design #32 : début et fin obligatoires).

    Par défaut, elle englobe aujourd'hui avec une marge d'un mois de chaque
    côté — le projet est donc « en cours ». Une borne fixée par le test est
    gardée telle quelle ; l'autre se déduit pour rester dans l'ordre.
    """
    start, due = _as_date(start_at), _as_date(due_at)
    today = date.today()
    if start is None:
        start = min(today, due or today) - _MARGIN
    if due is None:
        due = max(today, start) + _MARGIN
    return start, due


def period(**body) -> dict:
    """`period_dates` sérialisée pour un corps JSON, fusionnée avec `body`."""
    start, due = period_dates(body.pop("start_at", None), body.pop("due_at", None))
    return {**body, "start_at": str(start), "due_at": str(due)}


def project_payload(default_title: str, /, **body) -> dict:
    """Corps d'un `POST /domains/{id}/projects`, période comprise.

    Un `title` passé dans `body` l'emporte sur le titre par défaut.
    """
    return period(**{"title": default_title, **body})


def project_ids(activity: dict) -> list[str]:
    """Les projets pour lesquels une activité compte (#37 : plusieurs)."""
    return [link["project_id"] for link in activity["projects"]]
