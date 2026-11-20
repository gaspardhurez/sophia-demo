"""Use cases des métriques — les résultats mesurés.

Catalogue **construit à l'usage**, comme les unités : aucune graine, la métrique
naît au moment où on en a besoin, depuis le domaine ou depuis le projet qui la
vise. Elle appartient au domaine et **survit aux projets** : c'est ce qui rend
possible la lecture d'un squat de 70 à 200 kg à travers cinq projets annuels.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from sophia.application.schemas.metric import (
    MetricCreate,
    MetricUpdate,
    MetricUsage,
    MetricValueCreate,
    MetricValueUpdate,
)
from sophia.domain.metric import (
    DuplicateMetricName,
    MetricDomainMismatch,
    StartValueOfAnotherMetric,
)
from sophia.infrastructure.models import (
    Metric,
    MetricValue,
    Project,
    ProjectMetric,
)


def list_metrics(db: Session, domain_id: uuid.UUID) -> list[Metric]:
    return list(
        db.scalars(
            select(Metric).where(Metric.domain_id == domain_id).order_by(Metric.name)
        )
    )


def get_metric(db: Session, metric_id: uuid.UUID) -> Metric | None:
    return db.get(Metric, metric_id)


def _check_name_free(
    db: Session,
    domain_id: uuid.UUID,
    name: str,
    exclude: uuid.UUID | None = None,
) -> None:
    """Un nom libre **dans ce domaine**, casse ignorée."""
    stmt = select(Metric).where(
        Metric.domain_id == domain_id,
        func.lower(Metric.name) == name.strip().lower(),
    )
    if exclude is not None:
        stmt = stmt.where(Metric.id != exclude)
    if db.scalar(stmt) is not None:
        raise DuplicateMetricName


def create_metric(db: Session, domain_id: uuid.UUID, payload: MetricCreate) -> Metric:
    _check_name_free(db, domain_id, payload.name)
    metric = Metric(domain_id=domain_id, **payload.model_dump())
    metric.name = metric.name.strip()
    db.add(metric)
    db.commit()
    db.refresh(metric)
    return metric


def update_metric(db: Session, metric: Metric, payload: MetricUpdate) -> Metric:
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        _check_name_free(db, metric.domain_id, data["name"], exclude=metric.id)
        data["name"] = data["name"].strip()
    for field, value in data.items():
        setattr(metric, field, value)
    db.commit()
    db.refresh(metric)
    return metric


RECENT_VALUES = 3


def metric_usage(db: Session, metric: Metric) -> MetricUsage:
    """Relevés et projets concernés par une suppression, et les derniers
    relevés — ce qui partirait, nommé plutôt que compté."""
    return MetricUsage(
        recent=db.scalars(
            select(MetricValue)
            .where(MetricValue.metric_id == metric.id)
            .order_by(MetricValue.measured_at.desc(), MetricValue.created_at.desc())
            .limit(RECENT_VALUES)
        ).all(),
        values=db.scalar(
            select(func.count())
            .select_from(MetricValue)
            .where(MetricValue.metric_id == metric.id)
        )
        or 0,
        projects=db.scalar(
            select(func.count())
            .select_from(ProjectMetric)
            .where(ProjectMetric.metric_id == metric.id)
        )
        or 0,
    )


def delete_metric(db: Session, metric: Metric) -> None:
    """Supprime la métrique, ses relevés et les résultats visés qui la ciblaient.

    Les relevés partent (CASCADE) : une valeur détachée de ce qu'elle mesure ne
    veut plus rien dire. Les projets, eux, survivent — ils perdent seulement
    leur résultat visé.
    """
    db.delete(metric)
    db.commit()


# --- Relevés ---------------------------------------------------------------


def list_values(
    db: Session, metric: Metric, *, include_targets: bool = False
) -> list[MetricValue]:
    """Du plus ancien au plus récent — l'ordre de lecture d'une courbe. Les
    relevés qui comptent seulement (`MetricValue.counts`), sauf
    `include_targets` : les cibles posées sur des séances pas encore faites
    s'y ajoutent, marquées."""
    values = db.scalars(
        select(MetricValue)
        .where(MetricValue.metric_id == metric.id)
        .order_by(MetricValue.measured_at, MetricValue.created_at)
    )
    return [v for v in values if include_targets or v.counts]


def add_value(db: Session, metric: Metric, payload: MetricValueCreate) -> MetricValue:
    value = MetricValue(metric_id=metric.id, **payload.model_dump())
    db.add(value)
    db.commit()
    db.refresh(value)
    return value


def list_values_for_activity(db: Session, activity_id: uuid.UUID) -> list[MetricValue]:
    """Les relevés pris au cours d'une activité — une séance fullbody en a
    plusieurs.

    Endpoint dédié plutôt qu'un champ sur `ActivityRead` : le calendrier lit des
    dizaines d'activités d'un coup et n'a que faire des relevés, alors que le
    panneau n'en ouvre qu'une. Éviter le N+1 vaut bien une route.
    """
    return list(
        db.scalars(
            select(MetricValue)
            .where(MetricValue.activity_id == activity_id)
            .order_by(MetricValue.created_at)
        )
    )


def get_value(db: Session, value_id: uuid.UUID) -> MetricValue | None:
    return db.get(MetricValue, value_id)


def update_value(
    db: Session, value: MetricValue, payload: MetricValueUpdate
) -> MetricValue:
    for field, new in payload.model_dump(exclude_unset=True).items():
        setattr(value, field, new)
    db.commit()
    db.refresh(value)
    return value


def delete_value(db: Session, value: MetricValue) -> None:
    db.delete(value)
    db.commit()


# --- Résultats visés -------------------------------------------------------


def set_project_target(
    db: Session, project: Project, metric: Metric, target: float
) -> ProjectMetric:
    """Pose (ou met à jour) ce que ce projet vise sur cette métrique.

    Un projet en vise plusieurs — un cycle de musculation vise le squat, le
    RDL, les tractions et le DC ensemble. D'où l'upsert plutôt qu'un champ.
    """
    if metric.domain_id not in project.domain_ids:
        raise MetricDomainMismatch
    existing = db.get(ProjectMetric, (project.id, metric.id))
    if existing is not None:
        existing.target = target
        db.commit()
        db.refresh(existing)
        return existing
    link = ProjectMetric(project_id=project.id, metric_id=metric.id, target=target)
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


def set_project_start(
    db: Session, link: ProjectMetric, value: MetricValue | None
) -> ProjectMetric:
    """Désigne le relevé de départ de ce Résultat pour ce projet, ou le
    retire (`None`) : le départ suit alors la règle de `ProjectMetric.start`.
    Le relevé doit être un relevé de la métrique visée."""
    if value is not None and value.metric_id != link.metric_id:
        raise StartValueOfAnotherMetric
    link.start_value_id = value.id if value is not None else None
    db.commit()
    db.refresh(link)
    return link


def unset_project_target(db: Session, project: Project, metric_id: uuid.UUID) -> bool:
    """Retire le résultat visé. La métrique et ses relevés restent : ils
    appartiennent au domaine, pas au projet qui les visait."""
    link = db.get(ProjectMetric, (project.id, metric_id))
    if link is None:
        return False
    db.delete(link)
    # Les étapes cessent de le distribuer, cf. `Project.undistribute_metric`.
    project.undistribute_metric(metric_id)
    db.commit()
    return True
