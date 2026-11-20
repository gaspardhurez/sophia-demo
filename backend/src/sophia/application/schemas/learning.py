"""Schémas Pydantic de la vue d'ensemble de l'apprentissage (#152)."""

import enum
import uuid
from datetime import date, datetime

from pydantic import BaseModel

from sophia.application.schemas.activity import ActivityRead


class OverviewGroup(enum.StrEnum):
    """Les cartes « À faire » (#155), dans leur ordre d'affichage."""

    catch_up = "catch_up"
    advance = "advance"
    plan = "plan"
    start = "start"


class OverviewKind(enum.StrEnum):
    """Ce qu'est une ligne — et donc son geste."""

    # Aujourd'hui, 7 prochains jours
    session = "session"  # séance qui porte une pièce → coche (aujourd'hui)
    # Rattraper
    recall = "recall"  # interro en retard → Passer l'interro
    missed = "missed"  # séance passée non faite → faite · reporter · supprimer
    # Avancer
    next_phase = "next_phase"  # phase complète, suivante vide → Planifier
    start_recall = "start_recall"  # étudié, questions, courbe pas lancée
    close = "close"  # tout est validé → Terminer
    # Planifier
    unplanned = "unplanned"  # rien dans les 7 jours → Planifier
    # Commencer
    start = "start"  # prochain savoir d'un projet en cours → Commencer


class OverviewItemRead(BaseModel):
    """Une chose à faire. Des données, pas de phrases : l'écran compose ses
    libellés."""

    kind: OverviewKind
    skill_id: uuid.UUID
    skill_name: str
    plan_id: uuid.UUID | None = None
    # Le titre et l'emoji de la pièce, ou de la séance.
    title: str | None = None
    emoji: str | None = None
    # La séance (`missed`, `session`) : de quoi la cocher, la reporter ou la
    # supprimer sans la relire.
    activity: ActivityRead | None = None
    # `study`, `isolated` ou `situation` : la phase en cours (`next_phase`,
    # `unplanned`) ; pour `next_phase`, `previous_phase` la précède.
    phase: str | None = None
    previous_phase: str | None = None
    # L'échéance d'une interro, ou la dernière séance faite du savoir.
    since: date | None = None
    # Le projet dont il est le prochain savoir (`start`) ; `plan_id`, son
    # cycle prévu s'il en a un.
    project_id: uuid.UUID | None = None
    project_name: str | None = None


class OverviewGroupRead(BaseModel):
    group: OverviewGroup
    items: list[OverviewItemRead]


class OverviewSkillRead(BaseModel):
    """Un savoir en cours, pour la colonne de gauche."""

    skill_id: uuid.UUID
    # La prochaine séance pas faite (aujourd'hui compris) et la dernière faite.
    next_at: datetime | None
    last_done_at: datetime | None
    recall_due: bool


class LearningOverviewRead(BaseModel):
    # Les séances du jour qui portent une pièce, interro comprise, puis celles
    # des 7 jours suivants (demain → J+7), dans l'ordre du calendrier.
    today: list[OverviewItemRead]
    upcoming: list[OverviewItemRead]
    # Les quatre cartes « À faire », toujours, dans l'ordre (vides comprises).
    groups: list[OverviewGroupRead]
    skills: list[OverviewSkillRead]
