"""Modèles des **métriques** — les résultats mesurés.

Le suivi d'un projet (`unit_id` + `target`) répond à « combien j'en ai fait » :
il **cumule** les valeurs des activités faites. Il ne sait pas dire « où j'en
suis » — un squat à 90 kg, un FTP à 200 W, un 10 km en 55'00. Ces nombres ne
s'additionnent pas : ils se **relèvent**, et le dernier remplace le précédent.

Trois tables, trois rôles :

- `Metric` — ce qu'on mesure. Appartient au **domaine**, pas au projet : une
  échelle comme « 10 km : 49:30 → 47 → 44 → 42 → 40 » traverse cinq projets
  annuels, et c'est la métrique qui porte la continuité.
- `ProjectMetric` — le **résultat visé** : ce qu'un projet donné vise sur
  cette métrique.
- `MetricValue` — un **relevé**, daté, éventuellement issu d'une activité.
- `StepMetric` — le même résultat **distribué à une étape**, avec un palier
  intermédiaire éventuel.
"""

import enum
import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from sophia.infrastructure.database import Base
from sophia.infrastructure.models.base import uuid_pk

if TYPE_CHECKING:
    from sophia.infrastructure.models.activity import Activity
    from sophia.infrastructure.models.domain import Domain
    from sophia.infrastructure.models.project import Project, ProjectStep
    from sophia.infrastructure.models.unit import Unit


class MetricDirection(enum.StrEnum):
    """Dans quel sens la métrique progresse.

    Sert à dériver le **meilleur** relevé en plus du dernier : un record est le
    meilleur, pas le plus récent. Il oriente aussi le fil d'un résultat visé,
    du départ au drapeau (cf. `ProjectMetric.start`).
    """

    up = "up"  # plus haut = mieux (squat, FTP, tractions)
    down = "down"  # plus bas = mieux (temps sur 10 km, classement)


class Metric(Base):
    """Ce qu'on mesure : « Squat 1RM », en kg, dans Musculation."""

    __tablename__ = "metrics"
    __table_args__ = (
        # Unique **par domaine** : c'est ce qui interdit « Squat 1RM », « Squat »
        # et « Squat max » de coexister et de faire diverger la courbe. Même
        # leçon que la table `units`, un étage plus haut. Rien n'empêche en
        # revanche « Poids » d'exister dans deux domaines distincts.
        UniqueConstraint("domain_id", "name", name="uq_metrics_domain_name"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    domain_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("domains.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    # Illustration libre. Vide = la carte affiche la flèche du sens à la place :
    # le carré ne reste jamais vide, et à défaut d'emoji il porte l'information
    # qu'on a de toute façon (record en haut ou en bas).
    emoji: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # `SET NULL` comme partout ailleurs : ranger le référentiel des unités ne
    # doit pas détruire une métrique ni ses relevés.
    unit_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("units.id", ondelete="SET NULL"), nullable=True, index=True
    )
    direction: Mapped[MetricDirection] = mapped_column(
        Enum(MetricDirection, name="metric_direction"),
        nullable=False,
        default=MetricDirection.up,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    domain: Mapped["Domain"] = relationship()
    unit: Mapped["Unit | None"] = relationship(back_populates="metrics")
    values: Mapped[list["MetricValue"]] = relationship(
        back_populates="metric",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    targets: Mapped[list["ProjectMetric"]] = relationship(
        back_populates="metric",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    @property
    def counted_values(self) -> list["MetricValue"]:
        """Les relevés **qui comptent** (`MetricValue.counts`) : tout lecteur —
        dernier, record, saison, barre héritée, départ, palier — part d'ici.
        Une cible posée sur une séance pas encore faite n'est pas un relevé."""
        return [v for v in self.values if v.counts]

    def _sorted(self) -> list["MetricValue"]:
        """Relevés comptés, du plus ancien au plus récent. `created_at` départage
        deux relevés du même jour — sans quoi « le dernier » serait arbitraire."""
        return sorted(self.counted_values, key=lambda v: (v.measured_at, v.created_at))

    @property
    def latest(self) -> "MetricValue | None":
        """« Où j'en suis » : le relevé le plus récent."""
        ordered = self._sorted()
        return ordered[-1] if ordered else None

    @property
    def best(self) -> "MetricValue | None":
        """Le meilleur relevé, au sens de `direction`. Un record est le meilleur,
        pas le dernier — d'où les deux lectures côte à côte."""
        values = self.counted_values
        if not values:
            return None
        pick = min if self.direction is MetricDirection.down else max
        return pick(values, key=lambda v: v.value)


class ProjectMetric(Base):
    """Le **résultat visé** : ce que ce projet vise sur cette métrique.

    Un projet peut en viser plusieurs — un cycle de musculation vise le
    squat, le RDL, les tractions et le développé couché d'un seul tenant. C'est
    la raison d'être de cette table plutôt que de colonnes sur `projects`.
    """

    __tablename__ = "project_metrics"

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    metric_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("metrics.id", ondelete="CASCADE"), primary_key=True
    )
    target: Mapped[float] = mapped_column(Float, nullable=False)
    # Le relevé **désigné** comme départ pour ce projet, s'il y en a un :
    # il prime sur la règle de `start`. Supprimer le relevé rend la main à la
    # règle (SET NULL).
    start_value_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("metric_values.id", ondelete="SET NULL"), nullable=True
    )

    project: Mapped["Project"] = relationship(back_populates="metrics")
    metric: Mapped["Metric"] = relationship(back_populates="targets")
    start_value: Mapped["MetricValue | None"] = relationship()

    @property
    def _window_start(self) -> date:
        """Début de la fenêtre de comptage : le début du projet, obligatoire.

        **Un projet ne peut pas être satisfait par ce qui le précède.** Sans
        cette borne, un PR de juillet 2025 validait une cible posée en août 2026
        — le projet naissait atteint, sans que rien n'ait été fait.
        """
        return self.project.start_at

    def _in_window(self, value: "MetricValue") -> bool:
        """La fenêtre est **l'engagement** : `[début, échéance]`.

        Pas de tolérance après l'échéance : « sous 49:30 avant le 31 décembre »
        tenu le 15 janvier n'a pas été tenu. Tout seuil de grâce serait
        arbitraire et ne ferait que déplacer la falaise ; prolonger une saison
        est une décision, elle s'écrit en déplaçant l'échéance. C'est déjà la
        doctrine du statut dérivé — on corrige la cible, on ne se ment pas sur
        l'issue.
        """
        end = self.project.end_at
        return self._window_start <= value.measured_at and (
            end is None or value.measured_at <= end
        )

    def _pick(self, values: list["MetricValue"]) -> "MetricValue | None":
        if not values:
            return None
        pick = min if self.metric.direction is MetricDirection.down else max
        return pick(values, key=lambda v: v.value)

    @property
    def best_in_period(self) -> "MetricValue | None":
        """Le meilleur relevé **de la saison** — c'est lui qui décide de la cible.

        Distinct de `metric.best`, qui reste absolu : l'un dit ce que tu as fait
        cette saison, l'autre dit qui tu es. Les deux ont leur écran.
        """
        return self._pick([v for v in self.metric.counted_values if self._in_window(v)])

    @property
    def baseline(self) -> "MetricValue | None":
        """Le record **d'avant** la fenêtre : la barre dont le projet hérite.

        Ni cible ni progression — un fait, à afficher en repère. Sa date n'a
        aucun intérêt (elle est souvent lointaine), son niveau en a un : c'est
        ce qu'il faut battre.
        """
        return self._pick(
            [
                v
                for v in self.metric.counted_values
                if v.measured_at < self._window_start
            ]
        )

    def _at_least_as_hard(self, reference: float) -> bool:
        """La cible est-elle au moins aussi exigeante que cette valeur ?"""
        if self.metric.direction is MetricDirection.down:
            return self.target <= reference
        return self.target >= reference

    @property
    def start(self) -> "MetricValue | None":
        """Le **départ** du fil, de la barre héritée au drapeau (design #27).

        Le relevé **désigné** comme départ pour ce projet, s'il y en a un :
        un choix explicite, qui corrige la règle quand elle se trompe (record
        de 50:00 d'il y a un an, saison commencée à 55:00). Sinon, la règle :
        le record d'avant la saison, **si la cible est au moins aussi exigeante
        que lui** ; sinon le premier relevé de la saison — une reprise après
        blessure (record 50:00, cible 55:00) ne part pas d'un niveau qu'on ne
        vise plus. Sans relevé, pas de départ.

        Ne décide de rien : « atteint » reste le record de la saison contre la
        cible. Un projet ne peut pas être satisfait par ce qui le précède.
        """
        # Un relevé désigné qui ne compte pas (une cible, sa séance pas encore
        # faite) ne part de rien : la règle reprend la main.
        if self.start_value is not None and self.start_value.counts:
            return self.start_value
        baseline = self.baseline
        if baseline is not None and self._at_least_as_hard(baseline.value):
            return baseline
        season = sorted(
            (v for v in self.metric.counted_values if self._in_window(v)),
            key=lambda v: (v.measured_at, v.created_at),
        )
        return season[0] if season else None

    @property
    def is_met(self) -> bool:
        """La cible est-elle franchie ?

        C'est le **record de la fenêtre** qui compte, pas le dernier relevé : un
        PR reste acquis même si la séance suivante est moins bonne. Et le sens
        décide de ce que « franchir » veut dire — un temps se bat en descendant.
        """
        best = self.best_in_period
        if best is None:
            return False
        if self.metric.direction is MetricDirection.down:
            return best.value <= self.target
        return best.value >= self.target


class MetricValue(Base):
    """Un **relevé** : une valeur, un jour, éventuellement une activité.

    `activity_id` est optionnel — un relevé peut naître hors de toute activité
    (le point de départ « ~70 squat » précède le projet), et un domaine peut se
    suivre sans projet.

    **`CASCADE` — décision (27/08/2026).** Il était en `SET NULL` : supprimer une
    séance n'effaçait pas la mesure, « on a bien soulevé 118 ce jour-là ». À
    l'usage, l'argument ne tient pas : un relevé n'est vrai que s'il est
    atteignable. Délié, il n'apparaissait plus nulle part — le seul écran qui
    savait en supprimer un listait les relevés *d'une activité* — tout en
    continuant d'alimenter le record et la courbe. Il n'était pas conservé, il
    était enterré, et rien ne pouvait plus le corriger.

    Supprimer une séance emporte donc ce qu'elle portait. C'est la règle du
    reste du modèle : les chemins destructeurs **annoncent** ce qu'ils
    emportent (modales de retrait et de suppression) et ne devinent jamais.
    Le `SET NULL` était exactement la supposition silencieuse que ces
    chemins-là refusent.

    Une même activité en porte plusieurs (une séance fullbody relève le squat,
    le DC et le RDL) — c'est pourquoi c'est une table et non des colonnes sur
    `activities`, qui n'est pas modifiée.
    """

    __tablename__ = "metric_values"

    id: Mapped[uuid.UUID] = uuid_pk()
    metric_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("metrics.id", ondelete="CASCADE"), nullable=False, index=True
    )
    value: Mapped[float] = mapped_column(Float, nullable=False)
    measured_at: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    activity_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    metric: Mapped["Metric"] = relationship(back_populates="values")
    activity: Mapped["Activity | None"] = relationship(back_populates="metric_values")

    @property
    def counts(self) -> bool:
        """Ce relevé **compte**-t-il (05/10/2026) ?

        Lié à une activité, il ne compte qu'une fois l'activité **faite** :
        avant, c'est une **cible** posée sur la séance (« 120 au squat
        jeudi »), qu'on confirme ou ajuste en faisant la séance. Cocher la
        séance suffit à la faire compter ; la décocher la rend cible. Un
        relevé sans activité compte toujours.

        La règle s'applique ici, une fois : `Metric.counted_values` est la
        seule source des lectures (dernier, record, saison, départ, palier)."""
        return self.activity is None or self.activity.done


class StepMetric(Base):
    """Un **résultat distribué à une étape**, avec sa cible intermédiaire.

        Une étape ne crée pas de condition : elle reprend un résultat **déjà visé
        par le projet** et dit qu'il doit être franchi à ce moment-là. D'où la
        contrainte, tenue côté use case : `metric_id` doit figurer parmi les
        résultats du projet de l'étape.

    `target` porte le **palier** de l'étape : le projet vise 120 au squat,
        l'étape d'automne en demande 105. C'est ce qui permet de raconter une
        progression au lieu d'un tout-ou-rien.

        **`target` nul ne reprend PAS la cible du projet** (corrigé le
        27/08/2026). Il l'a fait, et c'était absurde : chaque étape sans palier
        exigeait alors le projet entier, si bien que distribuer un résultat sur
        trois étapes ne distribuait rien — les trois demandaient la même chose, la
        totalité. Sans palier, le lien dit seulement **« c'est ici qu'on travaille
        ce résultat »** : il situe le travail dans le plan sans inventer un
        engagement intermédiaire, et il ne conditionne donc pas l'étape.
    """

    __tablename__ = "step_metrics"

    step_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("project_steps.id", ondelete="CASCADE"), primary_key=True
    )
    metric_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("metrics.id", ondelete="CASCADE"), primary_key=True
    )
    target: Mapped[float | None] = mapped_column(Float, nullable=True)

    step: Mapped["ProjectStep"] = relationship(back_populates="metrics")
    metric: Mapped["Metric"] = relationship()

    @property
    def is_met(self) -> bool:
        """Le **palier** est-il franchi dans la saison du projet ?

        N'a de sens qu'avec un palier : sans lui, ce lien n'est pas une
        condition et `ProjectStep.done` ne le consulte pas.

        Même fenêtre que le résultat dont il dérive : une étape ne peut pas être
        validée par ce qui précède le projet, sinon elle naîtrait faite.
        """
        target = self.target
        if target is None:
            return False
        link = next(
            (
                link
                for link in self.step.project.metrics
                if link.metric_id == self.metric_id
            ),
            None,
        )
        best = link.best_in_period if link else None
        if best is None:
            return False
        if self.metric.direction is MetricDirection.down:
            return best.value <= target
        return best.value >= target
