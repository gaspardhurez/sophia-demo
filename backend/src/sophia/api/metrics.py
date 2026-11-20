"""Endpoints REST des métriques (résultats mesurés).

Le catalogue est **au domaine** (`/domains/{id}/metrics`) : c'est là qu'une
métrique naît et se gère. Les relevés pendent de la métrique, et les résultats
visés du projet — trois niveaux, trois chemins.
"""

import uuid

from fastapi import APIRouter, HTTPException, status

from sophia.api.deps import DbSession
from sophia.application import domains as domain_use_cases
from sophia.application import metrics as use_cases
from sophia.application import projects as project_use_cases
from sophia.application.schemas.metric import (
    MetricCreate,
    MetricRead,
    MetricUpdate,
    MetricUsage,
    MetricValueCreate,
    MetricValueRead,
    MetricValueUpdate,
    ProjectMetricRead,
    ProjectMetricStartSet,
    ProjectMetricUpsert,
)
from sophia.infrastructure.models import (
    Activity,
    Metric,
    MetricValue,
    Project,
    ProjectMetric,
)

router = APIRouter(tags=["metrics"])


def _get_metric_or_404(db: DbSession, metric_id: uuid.UUID) -> Metric:
    metric = use_cases.get_metric(db, metric_id)
    if metric is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Métrique introuvable")
    return metric


def _get_value_or_404(db: DbSession, value_id: uuid.UUID) -> MetricValue:
    value = use_cases.get_value(db, value_id)
    if value is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Relevé introuvable")
    return value


def _get_project_or_404(db: DbSession, project_id: uuid.UUID) -> Project:
    project = project_use_cases.get_project(db, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Projet introuvable")
    return project


# --- Catalogue, au niveau du domaine ---------------------------------------


@router.get(
    "/domains/{domain_id}/metrics",
    response_model=list[MetricRead],
    operation_id="listMetrics",
)
def list_metrics(domain_id: uuid.UUID, db: DbSession) -> list[Metric]:
    if domain_use_cases.get_domain(db, domain_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Domaine introuvable")
    return use_cases.list_metrics(db, domain_id)


@router.post(
    "/domains/{domain_id}/metrics",
    response_model=MetricRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="createMetric",
)
def create_metric(domain_id: uuid.UUID, payload: MetricCreate, db: DbSession) -> Metric:
    if domain_use_cases.get_domain(db, domain_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Domaine introuvable")
    return use_cases.create_metric(db, domain_id, payload)


@router.get("/metrics/{metric_id}", response_model=MetricRead, operation_id="getMetric")
def get_metric(metric_id: uuid.UUID, db: DbSession) -> Metric:
    return _get_metric_or_404(db, metric_id)


@router.patch(
    "/metrics/{metric_id}", response_model=MetricRead, operation_id="updateMetric"
)
def update_metric(metric_id: uuid.UUID, payload: MetricUpdate, db: DbSession) -> Metric:
    return use_cases.update_metric(db, _get_metric_or_404(db, metric_id), payload)


@router.get(
    "/metrics/{metric_id}/usage",
    response_model=MetricUsage,
    operation_id="getMetricUsage",
)
def get_metric_usage(metric_id: uuid.UUID, db: DbSession) -> MetricUsage:
    """Ce qu'une suppression emporterait — sert à l'annoncer dans l'UI."""
    return use_cases.metric_usage(db, _get_metric_or_404(db, metric_id))


@router.delete(
    "/metrics/{metric_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteMetric",
)
def delete_metric(metric_id: uuid.UUID, db: DbSession) -> None:
    use_cases.delete_metric(db, _get_metric_or_404(db, metric_id))


# --- Relevés ---------------------------------------------------------------


@router.get(
    "/metrics/{metric_id}/values",
    response_model=list[MetricValueRead],
    operation_id="listMetricValues",
)
def list_values(
    metric_id: uuid.UUID, db: DbSession, include_targets: bool = False
) -> list[MetricValue]:
    """Les relevés de la métrique, du plus ancien au plus récent — ceux qui
    **comptent** seulement (la courbe, la liste des relevés) ;
    `include_targets=true` y ajoute les cibles posées sur des séances pas
    encore faites (`counts` faux)."""
    return use_cases.list_values(
        db, _get_metric_or_404(db, metric_id), include_targets=include_targets
    )


@router.post(
    "/metrics/{metric_id}/values",
    response_model=MetricValueRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="addMetricValue",
)
def add_value(
    metric_id: uuid.UUID, payload: MetricValueCreate, db: DbSession
) -> MetricValue:
    metric = _get_metric_or_404(db, metric_id)
    # Un relevé en séance se prend sur une activité qui existe, et du domaine
    # de la métrique : un squat ne se relève pas pendant une séance de cuisine.
    if payload.activity_id is not None:
        activity = db.get(Activity, payload.activity_id)
        if activity is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Activité introuvable")
        if activity.domain_id != metric.domain_id:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "Un relevé en séance se prend sur une activité du domaine de la "
                "métrique.",
            )
    return use_cases.add_value(db, metric, payload)


@router.get(
    "/activities/{activity_id}/metric-values",
    response_model=list[MetricValueRead],
    operation_id="listActivityMetricValues",
)
def list_activity_values(activity_id: uuid.UUID, db: DbSession) -> list[MetricValue]:
    """Les relevés pris au cours de cette activité (une séance fullbody en a
    plusieurs). Le client joint les noms via le catalogue du domaine."""
    return use_cases.list_values_for_activity(db, activity_id)


@router.patch(
    "/metric-values/{value_id}",
    response_model=MetricValueRead,
    operation_id="updateMetricValue",
)
def update_value(
    value_id: uuid.UUID, payload: MetricValueUpdate, db: DbSession
) -> MetricValue:
    return use_cases.update_value(db, _get_value_or_404(db, value_id), payload)


@router.delete(
    "/metric-values/{value_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="deleteMetricValue",
)
def delete_value(value_id: uuid.UUID, db: DbSession) -> None:
    use_cases.delete_value(db, _get_value_or_404(db, value_id))


# --- Résultats visés, au niveau du projet ------------------------------


@router.get(
    "/projects/{project_id}/metrics",
    response_model=list[ProjectMetricRead],
    operation_id="listProjectMetrics",
)
def list_project_metrics(project_id: uuid.UUID, db: DbSession) -> list[ProjectMetric]:
    return _get_project_or_404(db, project_id).metrics


@router.put(
    "/projects/{project_id}/metrics",
    response_model=ProjectMetricRead,
    operation_id="setProjectMetric",
)
def set_project_metric(
    project_id: uuid.UUID, payload: ProjectMetricUpsert, db: DbSession
) -> ProjectMetric:
    """Pose ou met à jour un résultat visé. `PUT` parce que c'est un upsert :
    viser deux fois la même métrique corrige la cible, ça ne duplique pas."""
    return use_cases.set_project_target(
        db,
        _get_project_or_404(db, project_id),
        _get_metric_or_404(db, payload.metric_id),
        payload.target,
    )


@router.put(
    "/projects/{project_id}/metrics/{metric_id}/start",
    response_model=ProjectMetricRead,
    operation_id="setProjectMetricStart",
)
def set_project_metric_start(
    project_id: uuid.UUID,
    metric_id: uuid.UUID,
    payload: ProjectMetricStartSet,
    db: DbSession,
) -> ProjectMetric:
    """Désigne le relevé de départ de ce Résultat pour ce projet (`value_id`),
    ou rend la main à la règle (`null`)."""
    project = _get_project_or_404(db, project_id)
    link = next((m for m in project.metrics if m.metric_id == metric_id), None)
    if link is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Résultat visé introuvable")
    value = (
        _get_value_or_404(db, payload.value_id)
        if payload.value_id is not None
        else None
    )
    return use_cases.set_project_start(db, link, value)


@router.delete(
    "/projects/{project_id}/metrics/{metric_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="unsetProjectMetric",
)
def unset_project_metric(
    project_id: uuid.UUID, metric_id: uuid.UUID, db: DbSession
) -> None:
    """Retire le résultat visé. La métrique et ses relevés restent — ils
    appartiennent au domaine, pas au projet qui les visait."""
    project = _get_project_or_404(db, project_id)
    if not use_cases.unset_project_target(db, project, metric_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Résultat visé introuvable")
