"""Modèle `AcquisitionPlan` (V4) — un cycle d'acquisition sur un savoir.

**Une entité à part entière, pas une propriété de la compétence.** Un savoir en
porte *n* : plusieurs **prévus** peuvent coexister, **un seul en cours** à la
fois. Deux passes sur la même chandelle n'activent pas les mêmes phases, ne visent
pas le même niveau et ne composent pas la même rampe.

**Tourné vers ses projets.** Un cycle est rattaché à zéro, un ou plusieurs
projets (`plan_projects`) : c'est sa clôture « acquis » qui remplit leur
condition Apprentissage. Un projet n'a, par savoir, qu'un seul cycle non
abandonné.

**Une rampe par cycle.** Les objets de pratique appartiennent au savoir (la
bibliothèque) ; chaque cycle en pioche une rampe (`plan_items`) avec **son**
ordre, **ses** verdicts et **sa** rétention — un second cycle repart vierge.
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
    Index,
    Integer,
    String,
    Table,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from sophia.domain.mastery import (
    DEFAULT_CRITERION_LEVEL,
    DEFAULT_CRITERION_PASSES,
    DEFAULT_RECALL_TARGET,
    passes_at_level,
    piece_mastered,
    study_mastered,
)
from sophia.domain.recall import is_finished
from sophia.infrastructure.database import Base
from sophia.infrastructure.models.base import uuid_pk
from sophia.infrastructure.models.practice import PracticeNature

if TYPE_CHECKING:
    from sophia.infrastructure.models.activity import ActivityAct
    from sophia.infrastructure.models.practice import PracticeItem
    from sophia.infrastructure.models.project import Project
    from sophia.infrastructure.models.recall import RecallRestart, RecallSession
    from sophia.infrastructure.models.resource import PlanResource
    from sophia.infrastructure.models.skill import Skill


# Les projets d'un cycle (N-N). Supprimer l'un ou l'autre défait le lien.
plan_projects = Table(
    "plan_projects",
    Base.metadata,
    Column(
        "plan_id",
        Uuid,
        ForeignKey("acquisition_plans.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "project_id",
        Uuid,
        ForeignKey("projects.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


# Le réglage de naissance de tout cycle : Étude, Pratique, Application ;
# Rétention éteinte. On commence presque toujours par étudier.
DEFAULT_PHASES = (True, True, True, False)


class PlanState(enum.StrEnum):
    """Les états d'un cycle.

    `abandoned` n'est pas un échec rangé à part : c'est un cycle qu'on a arrêté
    en route, et qui se reprend. Le distinguer de `completed` importe parce que
    les deux ferment le cycle mais ne disent pas la même chose de la compétence
    — l'un l'acquiert, l'autre la laisse où elle était.
    """

    draft = "draft"
    active = "active"
    completed = "completed"
    abandoned = "abandoned"


class RetentionSpacing(enum.StrEnum):
    """Le rythme auquel le paquet de rétention revient.

    `curve` prolonge la courbe de l'interro : ses intervalles restants
    deviennent les rendez-vous du **savoir entier**. `custom` fixe un rythme
    propre, avec une fin éventuelle. Dans les deux cas un seul rendez-vous
    existe à la fois — le suivant naît quand celui-ci est jugé.
    """

    curve = "curve"
    custom = "custom"


class AcquisitionPlan(Base):
    __tablename__ = "acquisition_plans"
    # Un seul cycle **en cours** par savoir, tenu par la base : le service le
    # refuse déjà, l'index garde l'invariant si un chemin l'oubliait.
    __table_args__ = (
        Index(
            "uq_acquisition_plans_one_active",
            "skill_id",
            unique=True,
            sqlite_where=text("state = 'active'"),
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    skill_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("skills.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    state: Mapped[PlanState] = mapped_column(
        Enum(PlanState, name="plan_state"),
        nullable=False,
        default=PlanState.draft,
    )
    # Le niveau visé, en clair. Pas d'échelle de paliers ordonnés : elle
    # obligerait à déclarer le palier 3 en attaquant le palier 1, et rendrait
    # inexprimable la reprise d'un même niveau. L'échelle est émergente — la
    # suite datée des cycles fait l'historique de maîtrise.
    target_level: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Le périmètre (#173) : les grandes parties de ce qu'on va apprendre, en
    # texte libre. Facultatif — il peut s'écrire en cours ou en fin d'étude.
    # (`target_level` est affiché « Intention ».)
    scope: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Le nom du cycle, facultatif et distinct du niveau visé : ce qui le
    # désigne dans les onglets. À défaut, l'écran le nomme par ses projets,
    # sinon par son rang (« Cycle n »).
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # Les trois phases d'acquisition, activées à la carte : chaque savoir en
    # mobilise un sous-ensemble, et l'application est rare pour BFS quand elle
    # est centrale pour la julienne.
    #
    # `contextual` a été retiré le 15/09/2026 : la phase séparait un **degré**
    # de variabilité, pas une nature d'exercice. Ce qu'elle portait est devenu
    # le rang des items dans la rampe de pratique — voir `PlanItem.rank`.
    study: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=DEFAULT_PHASES[0]
    )
    isolated: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=DEFAULT_PHASES[1]
    )
    situation: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=DEFAULT_PHASES[2]
    )
    # La rétention est la quatrième phase, mais elle n'est pas une phase
    # d'acquisition : c'est ce qui vient **après**. Elle n'entre donc pas dans
    # `is_satisfied` — sinon l'activer rendrait le cycle inachevable.
    retention: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=DEFAULT_PHASES[3]
    )
    retention_spacing: Mapped[RetentionSpacing | None] = mapped_column(
        Enum(RetentionSpacing, name="retention_spacing"), nullable=True
    )
    # Le mode `custom` seul : son rythme, et sa fin si on lui en donne une.
    retention_interval_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    retention_ends_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Le rendez-vous en cours, matérialisé un seul à la fois — le suivant naît
    # quand celui-ci est jugé, jamais une file d'échéances calculées d'avance.
    retention_next_due_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Clos « acquis » par un **constat**, pas mené par la pratique : on
    # maîtrisait déjà, ou l'acquisition s'est faite hors de l'app. L'historique
    # reste honnête — rien n'a été marqué réussi.
    observed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Le seuil de l'étude (#157) : le nombre de tests de l'interro à passer
    # pour la maîtriser (1 = J+1 … 5 = J+90 ; 3, J+15, par défaut).
    recall_target: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=DEFAULT_RECALL_TARGET,
        server_default=str(DEFAULT_RECALL_TARGET),
    )
    # « Valider l'étude », à la main, pour une étude **sans questions** (#157) :
    # elle n'a pas d'interro pour la dire maîtrisée.
    study_validated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # --- L'interro du cycle (#81, `domain/recall.py`) : le rang de l'intervalle
    # à venir dans J+1…J+90 (`FINISHED` : la courbe est terminée), et la date
    # du prochain rappel. Sans date, pas de courbe en marche (pas encore
    # lancée, terminée, ou arrêtée à la clôture).
    recall_stage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recall_next_due_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Gardée en rétention à la clôture (« Terminer › Garder en rétention ›
    # Interro », #80) : la même courbe continue après l'acquis ; sinon elle
    # s'arrête. Une courbe terminée ne reprend jamais.
    recall_in_retention: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    # Le moment de « Lancer le test » (#157) — la première ligne de
    # l'historique de l'interro. Vidé seulement en annulant le démarrage.
    recall_launched_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Date de **clôture**, quelle qu'en soit l'issue : c'est l'état qui dit si
    # le cycle a abouti ou s'il a été abandonné, pas deux colonnes de dates
    # mutuellement exclusives qu'il faudrait tenir en cohérence.
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    skill: Mapped["Skill"] = relationship(back_populates="plans")
    projects: Mapped[list["Project"]] = relationship(
        secondary=plan_projects, back_populates="plans"
    )
    items: Mapped[list["PlanItem"]] = relationship(
        back_populates="plan",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="PlanItem.rank",
    )
    # Les actes d'apprentissage qui le servent (#82) : son calendrier.
    acts: Mapped[list["ActivityAct"]] = relationship(
        back_populates="plan", passive_deletes=True
    )
    # Les ressources que le cycle étudie, dans leur ordre de consommation.
    resource_links: Mapped[list["PlanResource"]] = relationship(
        back_populates="plan",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="PlanResource.position",
    )
    recall_sessions: Mapped[list["RecallSession"]] = relationship(
        back_populates="plan",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="RecallSession.started_at",
    )
    # Les « Recommencer » de l'interro (07/10/2026), lignes de son historique.
    recall_restarts: Mapped[list["RecallRestart"]] = relationship(
        back_populates="plan",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="RecallRestart.at",
    )

    @property
    def recall_session_id(self) -> uuid.UUID | None:
        """La passation commencée et pas terminée, qui se reprend."""
        return next((s.id for s in self.recall_sessions if s.is_open), None)

    @property
    def recall_finished(self) -> bool:
        """La courbe est terminée : J+90 réussi, plus d'interro."""
        return is_finished(self.recall_stage)

    @property
    def recall_restarted_at(self) -> list[datetime]:
        """Les moments où l'interro a été recommencée."""
        return [r.at for r in self.recall_restarts]

    @property
    def study_mastered(self) -> bool:
        """L'étude maîtrisée (#157) : l'interro au seuil, ou l'étude validée
        à la main (sans questions)."""
        return study_mastered(
            self.study_validated_at is not None, self.recall_stage, self.recall_target
        )

    @property
    def question_count(self) -> int:
        """Les questions complètes du savoir — ce que l'interro ferait passer
        (une question incomplète ne compte pas). Toute interro porte sur
        toutes les questions du savoir (03/10/2026)."""
        return sum(1 for q in self.skill.note_questions if q.complete)

    @property
    def resource_ids(self) -> list[uuid.UUID]:
        """Les ressources étudiées, dans leur ordre de consommation."""
        return [link.resource_id for link in self.resource_links]

    @property
    def project_ids(self) -> list[uuid.UUID]:
        return [o.id for o in self.projects]

    @property
    def is_closed(self) -> bool:
        return self.state in (PlanState.completed, PlanState.abandoned)

    @property
    def is_empty(self) -> bool:
        """Un brouillon **vide** : rien n'a été préparé depuis sa naissance —
        ni niveau, ni périmètre, ni phase ou seuil changé, ni rampe, ni étude,
        ni séance. C'est ce qui disparaît sans rien demander quand son projet
        s'en va."""
        return (
            self.state is PlanState.draft
            and self.target_level is None
            and self.scope is None
            and self.name is None
            and (self.study, self.isolated, self.situation, self.retention)
            == DEFAULT_PHASES
            and self.recall_target == DEFAULT_RECALL_TARGET
            and self.study_validated_at is None
            and self.recall_launched_at is None
            and not self.items
            and not self.acts
        )

    @property
    def active_natures(self) -> list[PracticeNature]:
        """Les natures de pratique que ce cycle mobilise."""
        return [
            nature
            for nature, on in (
                (PracticeNature.isolated, self.isolated),
                (PracticeNature.situation, self.situation),
            )
            if on
        ]

    @property
    def _active_items(self) -> list["PlanItem"]:
        """Ce que les sous-phases actives attendent : les objets de leur
        rampe. (L'interro n'y est plus, #81 : elle vit sur le cycle.)"""
        natures = set(self.active_natures)
        return [link for link in self.items if link.item.nature in natures]

    @property
    def total_items(self) -> int:
        """Objets de pratique attendus par les sous-phases actives."""
        return len(self._active_items)

    @property
    def done_items(self) -> int:
        """Ceux qui sont maîtrisés — la progression du cycle."""
        return sum(1 for link in self._active_items if link.mastered)

    def _sessions(self, kind: str, nature: PracticeNature | None = None) -> int:
        """Les séances faites du cycle qui portent ce geste (sans objet)."""
        return len(
            {
                act.activity_id
                for act in self.acts
                if act.kind == kind
                and act.practice_item_id is None
                and act.nature == nature
                and act.activity.done
            }
        )

    @property
    def study_sessions(self) -> int:
        return self._sessions("study")

    @property
    def isolated_sessions(self) -> int:
        return self._sessions("practice", PracticeNature.isolated)

    @property
    def situation_sessions(self) -> int:
        return self._sessions("practice", PracticeNature.situation)

    @property
    def phase_level(self) -> int:
        """La sous-phase où en est le cycle : 1 Étude, 2 Pratique, 3
        Application — la première active qui reste à faire. Tout fait mais
        pas encore clos : la **dernière active**, que le cycle attend de clore.
        Un cycle sans mise en situation ne se lit jamais en Application."""
        if self.study and not self.study_mastered:
            return 1
        last = 1
        for level, nature in (
            (2, PracticeNature.isolated),
            (3, PracticeNature.situation),
        ):
            if nature not in self.active_natures:
                continue
            last = level
            items = [x for x in self._active_items if x.item.nature is nature]
            if not items or not all(x.mastered for x in items):
                return level
        return last

    @property
    def is_satisfied(self) -> bool:
        """Toutes les phases actives sont-elles maîtrisées (#157) ?

        Une sous-phase de pratique activée mais **vide** n'est pas satisfaite :
        `all()` sur une liste vide vaut vrai, et le cycle se serait clos tout
        seul à l'instant où on active une sous-phase dont le catalogue reste à
        écrire. Elle dit « il y a du travail ici », pas « c'est fait ».
        """
        # `retention` est volontairement absente de ce calcul : elle n'est pas
        # une sous-phase d'acquisition mais ce qui lui succède.
        if self.study and not self.study_mastered:
            return False
        natures = set(self.active_natures)
        if not natures:
            # Un cycle qui n'active que l'étude se satisfait de l'étude seule.
            return self.study and self.study_mastered
        for nature in natures:
            items = [x for x in self._active_items if x.item.nature is nature]
            if not items or not all(x.mastered for x in items):
                return False
        return True


class PlanItem(Base):
    """Un objet de la bibliothèque **dans la rampe d'un cycle**.

    Le rang, le verdict et la rétention sont ceux du cycle : un second cycle
    peut reprendre le même exercice, il le reprend non réussi, à sa place.
    """

    __tablename__ = "plan_items"

    plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("acquisition_plans.id", ondelete="CASCADE"), primary_key=True
    )
    item_id: Mapped[uuid.UUID] = mapped_column(
        "practice_item_id",
        ForeignKey("practice_items.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # La place sur la rampe de sa nature, dans ce cycle. Réordonnée à la main,
    # jamais déduite ; aucun tri par statut ne s'y superpose.
    rank: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Verdict propre à ce cycle, à la main : avoir joué le match ne dit pas que
    # le geste est fiable.
    done: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Le moment du verdict (05/10/2026) : posé quand `done` passe à vrai,
    # vidé quand il repasse à faux. Nul sur ceux validés avant.
    done_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Gardé pour la rétention de ce cycle.
    in_retention: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Le critère de maîtrise dans ce cycle (#157) : tant de passes faites au
    # niveau `criterion_level` ou plus, au total — 3 passes à 5/5 par défaut.
    criterion_passes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=DEFAULT_CRITERION_PASSES,
        server_default=str(DEFAULT_CRITERION_PASSES),
    )
    criterion_level: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=DEFAULT_CRITERION_LEVEL,
        server_default=str(DEFAULT_CRITERION_LEVEL),
    )

    plan: Mapped["AcquisitionPlan"] = relationship(back_populates="items")
    item: Mapped["PracticeItem"] = relationship(back_populates="plan_links")

    @property
    def sessions(self) -> int:
        """Les passes faites **dans ce cycle** sur cet objet : ses activités
        faites qui y portent un acte sur lui."""
        return len(
            {
                act.activity_id
                for act in self.plan.acts
                if act.practice_item_id == self.item_id and act.activity.done
            }
        )

    @property
    def passes_at_level(self) -> int:
        """Les passes faites dans ce cycle sur cet objet au niveau du critère
        ou plus — une par séance."""
        return passes_at_level(
            (
                (act.activity_id, act.level)
                for act in self.plan.acts
                if act.practice_item_id == self.item_id and act.activity.done
            ),
            self.criterion_level,
        )

    @property
    def mastered(self) -> bool:
        """Maîtrisée (#157) : le verdict à la main, ou le critère rempli."""
        return piece_mastered(self.done, self.passes_at_level, self.criterion_passes)
