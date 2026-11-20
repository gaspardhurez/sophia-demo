"""Modèle `Activity` (V2 — Exécution) — l'unité qu'on planifie et coche.

Rattachée à un domaine (requis) et à **zéro, un ou plusieurs projets**, chacun
avec son étape (`ActivityProject`, #37). Elle alimente les Totaux de chacun
une fois `done` : par ses valeurs déclarées, sa durée ou sa seule existence. Une
activité sans projet est du suivi d'exécution pur.

Les liens sont **explicites** : posés à la création, corrigés à la main, jamais
réajustés en silence.

Elle contient aussi zéro, un ou plusieurs **actes d'apprentissage**
(`ActivityAct`, #82) : l'étude d'un savoir, son interro, un exercice. Le
calendrier reste le substrat commun de l'apprentissage, et l'historique d'une
compétence n'est qu'une projection filtrée de ces activités.
"""

import enum
import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from sophia.domain.planning import is_daily_case
from sophia.infrastructure.database import Base
from sophia.infrastructure.models.base import uuid_pk
from sophia.infrastructure.models.practice import PracticeNature

if TYPE_CHECKING:
    from sophia.infrastructure.models.activity_type import ActivityType
    from sophia.infrastructure.models.domain import Domain
    from sophia.infrastructure.models.metric import MetricValue
    from sophia.infrastructure.models.plan import AcquisitionPlan
    from sophia.infrastructure.models.practice import PracticeItem
    from sophia.infrastructure.models.project import (
        Project,
        ProjectAchievement,
        ProjectStep,
    )
    from sophia.infrastructure.models.skill import Skill
    from sophia.infrastructure.models.total import ActivityValue
    from sophia.infrastructure.models.week_preparation import WeekPreparation


# Les réalisations qu'une séance prépare (05/10/2026, #92) : plusieurs séances
# par réalisation, plusieurs réalisations par séance. CASCADE des deux côtés —
# supprimer la séance ou la réalisation défait le lien, rien d'autre. Lier ne
# coche rien : cocher la réalisation reste un geste à part.
activity_achievements = Table(
    "activity_achievements",
    Base.metadata,
    Column(
        "activity_id",
        Uuid,
        ForeignKey("activities.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "achievement_id",
        Uuid,
        ForeignKey("project_achievements.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    ),
)


class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[uuid.UUID] = uuid_pk()
    domain_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("domains.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # L'activité type dont elle relève : celle qui l'a générée, ou choisie à la
    # main. Supprimer l'activité type garde l'activité, sans type (SET NULL).
    activity_type_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("activity_types.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    emoji: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # Planification : `all_day` (peut couvrir plusieurs jours) ; start/end nuls =
    # activité non datée (pool). Durée = end − start (lue par les Totaux en durée).
    all_day: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    start_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    done: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Ce qu'on a à dire de CETTE fois-là : sensations, charges, ce qui a coincé.
    # Propre à l'activité, y compris pour une occurrence générée — la règle
    # décrit ce qu'on refait, la note ce qui vient de se passer.
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Le jour d'où elle a été **reportée** (« Reporter », +7 jours), le premier
    # s'il y en a eu plusieurs ; nul pour une activité jamais reportée.
    postponed_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    domain: Mapped["Domain"] = relationship()
    # Les réalisations que cette séance prépare (#92). Partent avec elle.
    achievements: Mapped[list["ProjectAchievement"]] = relationship(
        secondary=activity_achievements,
        back_populates="activities",
        passive_deletes=True,
        order_by="ProjectAchievement.created_at",
    )
    # La préparation de semaine dont elle est l'activité du rituel, s'il y a
    # lieu. Le lien vit sur la préparation (`activity_id`, SET NULL).
    week_preparation: Mapped["WeekPreparation | None"] = relationship(
        back_populates="activity", uselist=False, passive_deletes=True
    )
    # Les projets pour lesquels elle compte, chacun avec son étape. Partent
    # avec l'activité ; `passive_deletes` laisse le CASCADE de la base agir.
    project_links: Mapped[list["ActivityProject"]] = relationship(
        back_populates="activity",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    activity_type: Mapped["ActivityType | None"] = relationship(
        back_populates="activities"
    )
    # Ses actes d'apprentissage, qui partent avec elle.
    acts: Mapped[list["ActivityAct"]] = relationship(
        back_populates="activity",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ActivityAct.created_at",
    )
    # Relevés pris au cours de cette activité — une séance fullbody en porte
    # plusieurs. Supprimer l'activité les emporte (CASCADE, cf. `MetricValue`) :
    # un relevé délié n'était atteignable par aucun écran, donc incorrigible.
    # `passive_deletes` laisse la base trancher, sans quoi l'ORM viendrait
    # d'abord poser un `activity_id = NULL` et rien ne serait supprimé.
    metric_values: Mapped[list["MetricValue"]] = relationship(
        back_populates="activity",
        passive_deletes=True,
    )
    # Valeurs déclarées, chacune dans son unité (« 10 km », « 200 m de D+ »).
    # La durée et le nombre ne se déclarent pas : ils se lisent. Partent avec
    # l'activité.
    values: Mapped[list["ActivityValue"]] = relationship(
        back_populates="activity",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    @property
    def duration_hours(self) -> float:
        """La durée, en heures — lue, jamais saisie.

        Seule une activité **placée** dans la grille a une durée. Une activité
        « toute la journée » ou non datée n'en a pas : elle compte zéro dans un
        Total en durée comme dans le compteur d'heures du domaine, ce qui est
        l'effet assumé de la décision (cf. roadmap).
        """
        if self.all_day or self.start_at is None or self.end_at is None:
            return 0.0
        return (self.end_at - self.start_at).total_seconds() / 3600

    @property
    def project_ids(self) -> list[uuid.UUID]:
        return [link.project_id for link in self.project_links]

    @property
    def ritual_week_start(self) -> date | None:
        """L'activité du rituel de semaine : le lundi de la semaine qu'elle
        prépare ; nul pour toute autre activité."""
        prep = self.week_preparation
        return prep.week_start if prep is not None else None

    @property
    def daily(self) -> bool:
        """Case du jour d'une activité type **quotidienne** : elle va dans la
        rangée « quotidien ». Une case hebdomadaire ou manuelle, non."""
        if self.activity_type is None or not self.all_day or self.start_at is None:
            return False
        return is_daily_case(
            self.activity_type, set(self.project_ids), self.start_at.date()
        )


class ActivityProject(Base):
    """Une activité **compte pour** un projet, à une étape (facultative).

    Remplace `Activity.project_id` / `step_id` uniques (#37) : une séance peut
    servir deux projets à la fois, et on peut compter une activité passée dans
    un nouveau projet sans la retirer de l'ancien. L'étape appartient toujours
    au projet du lien (tenu côté use case).

    Supprimer le projet retire le lien (CASCADE), l'activité reste. Supprimer
    l'étape la délie seulement (SET NULL) : le lien au projet demeure.
    """

    __tablename__ = "activity_projects"

    activity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"), primary_key=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    step_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("project_steps.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    activity: Mapped["Activity"] = relationship(back_populates="project_links")
    project: Mapped["Project"] = relationship()
    step: Mapped["ProjectStep | None"] = relationship()


class ActKind(enum.StrEnum):
    """Ce qu'on fait d'un savoir dans une activité : l'étudier, passer son
    interro, faire un exercice ou une application (l'objet de pratique)."""

    study = "study"
    recall = "recall"
    practice = "practice"


class ActivityAct(Base):
    """Un **acte d'apprentissage** contenu dans une activité (#82).

    Un lien, pas une entité : l'activité, le savoir, le cycle quand il y en a
    un, et ce qu'on y fait — l'étude, l'interro, ou un objet de pratique. Ni
    titre, ni date, ni durée, ni notes : tout cela est à l'activité, qui est le
    contenant (une Session Dev de 3 h peut porter l'étude d'un savoir et les
    exercices d'un autre).

    Remplace les trois champs uniques de l'activité (`skill_id`,
    `practice_item_id`, `plan_id`). Supprimer le savoir ou l'objet retire
    l'acte (CASCADE), l'activité reste ; supprimer le cycle le délie (SET
    NULL), l'acte garde son savoir.
    """

    __tablename__ = "activity_acts"

    id: Mapped[uuid.UUID] = uuid_pk()
    activity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    skill_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("skills.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Posé explicitement — le cycle en cours du savoir, au moment du geste —,
    # jamais déduit ensuite. Un savoir sans cycle s'étudie aussi.
    plan_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("acquisition_plans.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    kind: Mapped[ActKind] = mapped_column(
        Enum(ActKind, name="act_kind"), nullable=False
    )
    # L'objet travaillé, pour un acte `practice` qui en vise un.
    practice_item_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("practice_items.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # La phase d'un acte `practice` **générique** (#107, #108) : « Pratique »
    # ou « Mise en situation » sans objet visé — pour un savoir dont les exercices
    # ne sont pas cartographiés. Nulle sur un acte qui vise un objet (il tient
    # sa phase de l'objet) et sur l'étude ou l'interro.
    nature: Mapped[PracticeNature | None] = mapped_column(
        Enum(PracticeNature, name="practice_nature"), nullable=True
    )
    # Le jour où l'interro a été passée, pour un acte `recall` (20/10/2026) :
    # l'acte sait qu'il est passé, sans cocher la séance qui le porte — elle
    # peut contenir autre chose, pas fini à la fin de la passation. Nul
    # ailleurs, et tant que l'interro reste à passer.
    passed_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Le retour d'une passe (#139), pour un acte `practice` (objet ou
    # générique) : un niveau de maîtrise de 1 à 5 et une note libre, propres à
    # l'acte — la note de l'activité reste à part. Nuls tant qu'aucun retour
    # n'est donné, et sur l'étude ou l'interro.
    level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    activity: Mapped["Activity"] = relationship(back_populates="acts")
    skill: Mapped["Skill"] = relationship()
    plan: Mapped["AcquisitionPlan | None"] = relationship(back_populates="acts")
    practice_item: Mapped["PracticeItem | None"] = relationship(back_populates="acts")

    @property
    def skill_name(self) -> str:
        return self.skill.name

    @property
    def item_title(self) -> str | None:
        """Le titre de l'objet travaillé, pour un acte de pratique."""
        return self.practice_item.title if self.practice_item else None

    @property
    def item_emoji(self) -> str | None:
        return self.practice_item.emoji if self.practice_item else None

    @property
    def phase(self) -> PracticeNature | None:
        """La phase de pratique que l'acte sert : celle de son objet, sinon
        celle qu'il dit (générique). Nulle pour l'étude et l'interro."""
        if self.practice_item is not None:
            return self.practice_item.nature
        return self.nature
