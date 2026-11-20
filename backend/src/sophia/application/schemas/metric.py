"""Schémas Pydantic des métriques (résultats mesurés)."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field

from sophia.application.schemas.unit import UnitRead
from sophia.infrastructure.models import MetricDirection


class MetricCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    emoji: str | None = Field(default=None, max_length=16)
    unit_id: uuid.UUID | None = None
    direction: MetricDirection = MetricDirection.up


class MetricUpdate(BaseModel):
    """Renommage, unité, sens — tout est modifiable après coup ; les relevés
    suivent, puisqu'ils pointent la métrique et non son libellé."""

    name: str | None = Field(default=None, min_length=1, max_length=80)
    emoji: str | None = Field(default=None, max_length=16)
    unit_id: uuid.UUID | None = None
    direction: MetricDirection | None = None


class MetricValueCreate(BaseModel):
    value: float
    measured_at: date
    # Activité d'où vient le relevé. Optionnel : un relevé peut naître hors de
    # toute activité (le point de départ précède souvent le projet).
    activity_id: uuid.UUID | None = None


class MetricValueUpdate(BaseModel):
    value: float | None = None
    measured_at: date | None = None


class MetricValueRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    metric_id: uuid.UUID
    value: float
    measured_at: date
    activity_id: uuid.UUID | None
    # Le relevé compte-t-il ? Lié à une activité pas encore faite, c'est une
    # **cible** posée sur la séance : il n'entre dans aucune lecture (dernier,
    # record, saison, départ) tant qu'on ne l'a pas faite.
    counts: bool
    created_at: datetime


class MetricRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    domain_id: uuid.UUID
    name: str
    emoji: str | None
    unit_id: uuid.UUID | None
    # L'unité résolue : le client a besoin du nom, du pluriel et de la teinte.
    unit: UnitRead | None
    direction: MetricDirection
    created_at: datetime
    # « Où j'en suis » (le dernier relevé) et le record (le meilleur au sens de
    # `direction`). Les deux, parce qu'un PR est le meilleur et non le plus
    # récent — et qu'après une contre-performance les deux diffèrent.
    latest: MetricValueRead | None
    best: MetricValueRead | None


class ProjectMetricUpsert(BaseModel):
    """Pose ou met à jour un résultat visé sur une métrique."""

    metric_id: uuid.UUID
    target: float


class ProjectMetricStartSet(BaseModel):
    """Désigne le relevé de départ d'un Résultat pour ce projet ; `None`
    rend la main à la règle."""

    value_id: uuid.UUID | None


class ProjectMetricRead(BaseModel):
    """Un résultat visé, avec la métrique qu'il vise (et donc « où j'en suis »).

    Trois lectures du même axe, et il en faut trois :
    `metric.best` est le record **absolu** — qui tu es, ce que montre la page
    domaine ; `best_in_period` est le meilleur **de la saison** — c'est lui qui
    franchit la cible ; `baseline` est le record **d'avant** — la barre héritée.
    `start` en déduit le départ du fil de résultat.
    """

    model_config = ConfigDict(from_attributes=True)

    metric_id: uuid.UUID
    target: float
    metric: MetricRead
    best_in_period: MetricValueRead | None
    baseline: MetricValueRead | None
    # Le départ du fil : le relevé désigné s'il y en a un, sinon la barre
    # héritée si la cible est au moins aussi exigeante, sinon le premier relevé
    # de la saison (cf. `ProjectMetric.start`).
    start: MetricValueRead | None
    # Le relevé désigné comme départ, ou `None` : le départ suit la règle.
    start_value_id: uuid.UUID | None
    is_met: bool


class MetricUsage(BaseModel):
    """Ce qu'une suppression de métrique emporterait — pour l'annoncer avant.

    Les relevés partent avec elle (CASCADE) : ils n'ont aucun sens détachés de
    ce qu'ils mesurent. Les projets, eux, perdent seulement leur résultat visé.
    """

    values: int
    projects: int
    # Les derniers relevés, du plus récent au plus ancien — ce que la modale
    # montre au survol de sa ligne « Relevés » (design #27, `Resultat` 2f).
    recent: list[MetricValueRead]
