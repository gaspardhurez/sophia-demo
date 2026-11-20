"""Modèle `PracticeItem` (V4) — ce qu'on refait pour apprendre.

**La bibliothèque du savoir.** L'objet décrit l'exercice ou la mise en
situation ; il se repère sans cycle. Sa place dans une rampe, son verdict et sa
rétention appartiennent au cycle qui le pioche (`PlanItem`).

**Un seul objet pour toute la pratique.** Exercice isolé, exercice de
discrimination et mise en situation ne diffèrent pas mécaniquement : tous trois
sont une description réutilisable, replanifiée autant de fois qu'il faut, jugée
à la main. Deux ou trois tables jumelles auraient été de la duplication ; l'objet
**déclare** donc sa nature, comme un nœud d'arbre déclare la sienne.

Son verdict, porté par le cycle, reste distinct des activités qui le visent :
une séance peut avoir lieu sans que le savoir soit maîtrisé pour autant. Ce
qu'on **dit** de lui, en revanche, ne lui appartient pas : « la chandelle sort
une fois sur trois » est le compte-rendu d'une passe, il vit dans
`activities.notes` et s'y lit daté (tranché le 09/09/2026).
"""

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from sophia.infrastructure.database import Base
from sophia.infrastructure.models.base import uuid_pk

if TYPE_CHECKING:
    from sophia.infrastructure.models.activity import ActivityAct
    from sophia.infrastructure.models.plan import PlanItem
    from sophia.infrastructure.models.skill import Skill


class PracticeNature(enum.StrEnum):
    """La phase d'acquisition que cet objet sert.

    **Déclarée, jamais déduite** : rien dans le contenu d'un objet ne dit s'il
    s'exécute dans le dispositif ou dans le réel. Seul celui qui l'écrit le sait.

    `contextual` a été retiré le 15/09/2026. Il ne nommait pas une troisième
    phase mais un **degré** de variabilité — et un degré ne se déclare pas, il
    se compare. Il vit maintenant dans le **rang** de l'objet sur la rampe de
    pratique (voir `PlanItem.rank`) : les exercices de discrimination sont
    ceux qui s'y rangent en haut.
    """

    isolated = "isolated"
    situation = "situation"


class PracticeKind(enum.StrEnum):
    """Comment l'objet s'exécute — orthogonal à la sous-phase qu'il sert.

    `manual` : ça se fait dehors, Sophia n'est qu'un registre. `integrated` :
    l'énoncé et l'évaluation vivent dans l'app.

    L'interro n'en est plus une valeur (#81) : elle n'est pas un objet de la
    bibliothèque mais la courbe d'un cycle, sur les questions de ses notes
    (`AcquisitionPlan.recall_stage`, `domain/recall.py`).
    """

    manual = "manual"
    integrated = "integrated"


class EvalMode(enum.StrEnum):
    """Qui juge la passe. Vaut pour tout objet, pas seulement les intégrés —
    la ligne d'un exercice manuel affiche « auto-évalué »."""

    self_declared = "self"
    sophia = "sophia"


class ContentSource(enum.StrEnum):
    """D'où vient l'énoncé (ou la solution) d'un exercice intégré."""

    generated = "generated"
    uploaded = "uploaded"


class PracticeItem(Base):
    __tablename__ = "practice_items"

    id: Mapped[uuid.UUID] = uuid_pk()
    # Un objet de pratique n'a aucun sens sans son savoir : il part avec lui.
    skill_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("skills.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    nature: Mapped[PracticeNature] = mapped_column(
        Enum(PracticeNature, name="practice_nature"),
        nullable=False,
        default=PracticeNature.isolated,
    )
    kind: Mapped[PracticeKind] = mapped_column(
        Enum(PracticeKind, name="practice_kind"),
        nullable=False,
        default=PracticeKind.manual,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    emoji: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # La consigne. Sophia est un **registre** : elle décrit ce qu'on va faire
    # ailleurs, elle ne l'héberge pas.
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    # De quoi retrouver la source dehors — un lien, une page, une référence.
    reference: Mapped[str | None] = mapped_column(String(500), nullable=True)
    eval_mode: Mapped[EvalMode] = mapped_column(
        # `values_callable` : sans lui SQLAlchemy stockerait le **nom** du membre
        # (`self_declared`) alors que le contrat expose sa valeur (`self`). Les
        # autres enums du projet ont nom et valeur identiques, celui-ci non.
        Enum(
            EvalMode, name="eval_mode", values_callable=lambda e: [m.value for m in e]
        ),
        nullable=False,
        default=EvalMode.self_declared,
    )
    # --- L'exercice intégré seul : d'où viennent son énoncé et sa solution.
    # Rien ne les consomme avant la page d'exécution ; ils se règlent quand même
    # dans la modale, et un réglage qui ne s'enregistre pas ne vaut rien.
    statement_source: Mapped[ContentSource | None] = mapped_column(
        Enum(ContentSource, name="statement_source"), nullable=True
    )
    solution_source: Mapped[ContentSource | None] = mapped_column(
        Enum(ContentSource, name="solution_source"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    skill: Mapped["Skill"] = relationship(back_populates="practice_items")
    # Les rampes où il figure : supprimer l'objet l'en retire (CASCADE).
    plan_links: Mapped[list["PlanItem"]] = relationship(
        back_populates="item",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    # Les actes qui le travaillent (#82). Supprimer l'objet les retire
    # (CASCADE) sans toucher aux activités : elles ont eu lieu.
    acts: Mapped[list["ActivityAct"]] = relationship(
        back_populates="practice_item",
        passive_deletes=True,
    )

    @property
    def sessions(self) -> int:
        """Les passes réellement faites — dérivé du calendrier, jamais stocké.

        Distinct de `done` : on peut avoir refait un drill cinq fois sans le
        déclarer réussi, et déclarer réussi ce qu'on n'a jamais planifié ici.
        """
        return len({act.activity_id for act in self.acts if act.activity.done})
