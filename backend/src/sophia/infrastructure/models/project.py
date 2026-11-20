"""Modèle `Project` — une intention long terme à atteindre dans un domaine.

Il se découpe en une suite ordonnée d'**étapes** (`ProjectStep`). Les
compétences se lient au projet (`project_skills`) et/ou à une étape
(`step_skills`) ; les compétences *effectives* = l'union des deux. Une étape avec
compétences est *faite* quand toutes sont acquises ; une étape-acte (sans
compétence) est cochée manuellement.

« Réalisation » est **réservé** : il nomme, dans le modèle cible arrêté le
27/08/2026, la condition de réussite
qualitative — « je l'ai fait ». Ne pas le réemployer pour désigner le découpage
d'un projet ni la date d'atteinte.
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

from sophia.domain.sequence import name_key
from sophia.infrastructure.database import Base
from sophia.infrastructure.models.base import uuid_pk
from sophia.infrastructure.models.plan import (
    AcquisitionPlan,
    PlanState,
    plan_projects,
)
from sophia.infrastructure.models.skill import Skill, SkillStatus


def _skill_is_met(skill: "Skill", project: "Project") -> bool:
    """La condition Apprentissage de ce savoir est-elle remplie pour CET
    projet ?

    Remplie quand un cycle **rattaché au projet** est clos acquis — mené
    par la pratique ou constaté. Un cycle fait pour un autre projet ne la
    remplit pas : un projet posé sur un savoir remis en cycle vise le
    nouveau niveau. Et rouvrir un savoir ne défait rien : le cycle clos reste
    clos, son projet reste atteint.
    """
    return any(
        plan.state is PlanState.completed and project in plan.projects
        for plan in skill.plans
    )


def _project_plan(skill: "Skill", project: "Project") -> AcquisitionPlan | None:
    """Le cycle non abandonné de ce savoir pour ce projet, s'il y en a un."""
    return next(
        (
            p
            for p in skill.plans
            if p.state is not PlanState.abandoned and project in p.projects
        ),
        None,
    )


if TYPE_CHECKING:
    from sophia.infrastructure.models.activity import Activity
    from sophia.infrastructure.models.activity_type import ProjectActivityType
    from sophia.infrastructure.models.metric import ProjectMetric, StepMetric
    from sophia.infrastructure.models.skill import Skill
    from sophia.infrastructure.models.total import ProjectTotal, StepTotal


def _skill_level(skill: "Skill", project: "Project | None" = None) -> int:
    """Le niveau 0–4 d'un savoir : 4 acquis, sinon la phase où en est son
    cycle en cours (1 Étude, 2 Pratique, 3 Application), sinon 1 s'il est en
    cours sans cycle actif, 0 pas commencé.

    Lu **pour un projet**, c'est son cycle à lui qui compte : acquis quand
    il est clos acquis, et sa phase quand c'est lui qui est en cours. Lu sans
    projet (le savoir seul), c'est le statut et le cycle en cours.
    """
    if project is not None:
        if _skill_is_met(skill, project):
            return 4
        plan = _project_plan(skill, project)
        if plan is not None and plan.state is PlanState.active:
            return plan.phase_level
        return 1 if skill.status is SkillStatus.in_progress else 0
    if skill.status is SkillStatus.acquired:
        return 4
    plan = skill.active_plan
    if plan is None:
        return 1 if skill.status is SkillStatus.in_progress else 0
    return plan.phase_level


class ProjectStatus(enum.StrEnum):
    """Statut d'un projet — cinq états, un seul manuel (design #32).

    Le statut **affiché** se dérive (`Project.effective_status`) : À faire,
    En cours, Réussi, Raté se lisent sur la période et les cibles. Le statut
    **stocké** ne garde que ce que rien d'autre ne dit :

    - `todo` — rien de décidé, le défaut ;
    - `achieved` — la carte « À la main » cochée, pour un projet sans cible ;
    - `abandoned` — la seule décision manuelle, qui l'emporte sur tout.

    `in_progress` et `failed` ne se stockent plus : l'un se lit sur la
    période, l'autre est un constat à l'échéance.
    """

    todo = "todo"
    in_progress = "in_progress"
    achieved = "achieved"
    failed = "failed"
    abandoned = "abandoned"


# Ce qu'une écriture peut poser : le reste se dérive.
STORED_STATUSES = frozenset(
    {ProjectStatus.todo, ProjectStatus.achieved, ProjectStatus.abandoned}
)


def _skill_fk_column() -> Column:
    return Column(
        "skill_id", Uuid, ForeignKey("skills.id", ondelete="CASCADE"), primary_key=True
    )


# Compétences liées directement au projet (M2M). ondelete CASCADE des 2 côtés.
# `position` : le rang dans la séquence d'acquisition, nul = hors séquence
# (cf. `sophia.domain.sequence`). Un lien créé naît hors séquence.
project_skills = Table(
    "project_skills",
    Base.metadata,
    Column(
        "project_id",
        Uuid,
        ForeignKey("projects.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    _skill_fk_column(),
    Column("position", Integer, nullable=True),
)


class ProjectSkillLink(Base):
    """Le lien projet ↔ savoir **en lecture**, pour son rang.

    Les liens s'écrivent par `Project.skills` (la table en `secondary`) ; le
    rang, par la séquence (`application.sequence`). Cette classe ne sert qu'à
    lire la position sans requête à part.
    """

    __table__ = project_skills


# Compétences liées à une étape (M2M).
step_skills = Table(
    "step_skills",
    Base.metadata,
    Column(
        "step_id",
        Uuid,
        ForeignKey("project_steps.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    _skill_fk_column(),
)


class ProjectDomain(Base):
    """Un domaine d'un projet (#203). Le premier par `position` est le
    **principal** : il donne au projet sa couleur, et le supprimer supprime
    le projet. Les suivants sont secondaires : les supprimer délie le projet
    (`application.domains.delete_domain`). Les positions se suivent depuis 0.
    """

    __tablename__ = "project_domains"

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    domain_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("domains.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)

    project: Mapped["Project"] = relationship(back_populates="domain_links")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = uuid_pk()
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    # L'emoji du projet ; nul, celui de son domaine principal.
    emoji: Mapped[str | None] = mapped_column(String(16), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    precisions: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ProjectStatus] = mapped_column(
        Enum(ProjectStatus, name="project_status"),
        nullable=False,
        default=ProjectStatus.todo,
    )
    # La période : le début est obligatoire dès la création (design #32).
    # Démarrer plus tôt, c'est avancer le début ; prolonger, repousser la fin.
    start_at: Mapped[date] = mapped_column(Date, nullable=False)
    # La fin **prévue** ; nulle, le projet n'a pas de fin (#196) : pas de
    # rythme, jamais Raté ni Réussi tout seul, il se clôt à la main.
    due_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    # La fin **constatée** (#196) : le jour où le projet a été clos à la main
    # (abandonné, réussi), effacée s'il est repris. La fin d'un projet se lit
    # `due_at`, sinon `ended_at` (`end_at`).
    ended_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    achieved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    # Ses domaines (#203), dans l'ordre : le premier est le principal. Un
    # projet en a toujours au moins un.
    domain_links: Mapped[list["ProjectDomain"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ProjectDomain.position",
    )
    # Les activités types planifiées pour le projet (#37). Le lien est jetable ;
    # l'activité type appartient au domaine et lui survit — même doctrine que
    # les résultats.
    activity_types: Mapped[list["ProjectActivityType"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    # Les Totaux (Volume et Régularité réunifiés, 24/09/2026).
    totals: Mapped[list["ProjectTotal"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ProjectTotal.position",
    )
    # Compétences liées directement (facultatif) ; supprimer le projet retire
    # les liens, pas les compétences.
    skills: Mapped[list["Skill"]] = relationship(
        secondary=project_skills,
        passive_deletes=True,
    )
    # Les cycles d'acquisition rattachés (N-N) : leur clôture remplit la
    # condition Apprentissage. Le lien part avec le projet, le cycle reste.
    plans: Mapped[list[AcquisitionPlan]] = relationship(
        secondary=plan_projects,
        back_populates="projects",
        passive_deletes=True,
    )
    skill_links: Mapped[list[ProjectSkillLink]] = relationship(
        viewonly=True,
    )
    # Étapes : la suite d'accomplissements. Supprimer le projet les emporte.
    steps: Mapped[list["ProjectStep"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ProjectStep.order",
    )
    # Activités qui comptent pour le projet, à travers leurs liens
    # (`ActivityProject`). En lecture seule : un lien s'écrit côté activité.
    # Supprimer le projet retire les liens (CASCADE), pas les activités.
    activities: Mapped[list["Activity"]] = relationship(
        secondary="activity_projects",
        viewonly=True,
    )
    # Résultats visés : ce que le projet vise sur des métriques du domaine.
    # Le lien est jetable (il ne vaut que pour ce projet) ; la métrique et ses
    # relevés, eux, appartiennent au domaine et lui survivent.
    metrics: Mapped[list["ProjectMetric"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    # Réalisations : ce que le projet s'engage à AVOIR FAIT.
    #
    # Elles vivent ici, et non au niveau du domaine comme les métriques et les
    # activités types. La différence tient à la **réutilisation** : le même Squat 1RM
    # traverse cinq projets annuels, d'où une métrique de domaine et une table
    # de liaison qui porte une cible par projet. Une réalisation, elle, se
    # fait une fois et ne sert qu'à un projet — viser deux fois la même chose,
    # c'est en décrire une autre. Un objet qui n'appartient qu'à un seul
    # projet est un objet de ce projet. D'où le `delete-orphan`.
    #
    # Une vue « mur des accomplissements » au niveau du domaine reste possible
    # par jointure à travers les projets : elle ne demande pas de les y
    # rattacher.
    achievements: Mapped[list["ProjectAchievement"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ProjectAchievement.created_at",
    )

    @property
    def domain_ids(self) -> list[uuid.UUID]:
        """Ses domaines, le principal en tête (#203)."""
        return [link.domain_id for link in self.domain_links]

    @property
    def principal_domain_id(self) -> uuid.UUID:
        """Le domaine principal : sa couleur, et le projet part avec lui."""
        return self.domain_links[0].domain_id

    @property
    def is_tracked(self) -> bool:
        """Le projet s'est-il fixé quelque chose de mesurable ?

        Un suivi chiffré, des résultats visés, des réalisations, des
        compétences à acquérir — ou plusieurs à la fois. Sans rien de tout ça,
        personne ne peut conclure à sa place et le statut reste saisi à la main.

        **Lier une compétence engage** (décision du 27/08/2026) : le lien était
        de la cartographie héritée de la V1, il ne décidait de rien. Un lien qui
        ne veut rien dire est exactement ce qu'on reprochait au statut manuel —
        une information posée sans effet. Travailler une compétence sans s'y
        engager reste possible : on ne la lie pas, elle vit dans l'arbre du
        domaine.

        Une **réalisation** compte ici alors qu'elle n'a rien de chiffré : c'est
        tout son intérêt. Un projet dont la réussite est « j'ai fait le
        voyage » se déclare et se dérive comme les autres, au lieu de tomber
        dans le statut manuel faute de nombre à comparer.
        """
        return (
            bool(self.totals)
            or bool(self.metrics)
            or bool(self.achievements)
            or bool(self.skills)
        )

    @property
    def targets_met(self) -> bool:
        """Toutes les conditions sont-elles remplies — suivi, résultats **et
        réalisations** ?

        Pas de hiérarchie entre les axes : « 300 km cette saison » est un
        engagement au même titre qu'un record à 45 min, qu'un morceau exporté ou
        qu'une technique maîtrisée. Une cible devenue caduque se corrige, elle ne
        s'ignore pas — c'est ce qui lui garde son pouvoir de motivation au
        quotidien.

        Les compétences comptées sont les liens **directs** — ce qui suffit :
        une étape ne peut distribuer que ce que le projet a déclaré, donc ses
        compétences y figurent déjà. La distinction directs / effectives est
        devenue vide, et `skill_ids` n'est plus conservé que parce que le front
        s'en sert pour cadrer l'arbre.
        """
        if not all(total.is_met for total in self.totals):
            return False
        if not all(link.is_met for link in self.metrics):
            return False
        if not all(_skill_is_met(skill, self) for skill in self.skills):
            return False
        return all(achievement.done for achievement in self.achievements)

    @property
    def end_at(self) -> date | None:
        """La fin du projet : prévue, sinon constatée (#196). Nulle pour un
        projet sans fin encore ouvert."""
        return self.due_at or self.ended_at

    @property
    def has_started(self) -> bool:
        """La période est-elle ouverte ?

        Un projet dont le début est passé est en cours, qu'on y ait touché ou
        non. C'est même le cas qui compte le plus : une semaine ouverte à zéro
        est l'alerte la plus utile du cockpit, alors que la déduire du progrès
        la rangerait avec les projets pas commencés. Démarrer plus tôt, c'est
        avancer le début (design #32) : il n'y a plus de déclaration à la main.
        """
        return self.start_at <= date.today()

    @property
    def effective_status(self) -> ProjectStatus:
        """Statut affiché — cinq états, un seul manuel (design #32).

        - **Abandonné** : la seule décision manuelle, elle l'emporte sur tout.
          Distincte de Raté, qui est un constat.
        - **Réussi** : toutes les cibles tenues — ou, sans cible, la carte « À
          la main » cochée. Y compris après l'échéance, comme une activité
          cochée en retard. Décocher ou perdre une cible le fait revenir.
        - **Raté** : échéance passée sans réussite, avec ou sans cible. Un
          projet à la main non coché à l'échéance est raté, pas « à
          trancher ». Repousser la fin le rouvre.
        - **En cours** : la période est ouverte.
        - **À faire** : le début est à venir.

        Sans fin prévue (#196), rien ne se déduit : ni Réussi ni Raté tout
        seul, l'issue se règle à la main — objectifs remplis ou non.
        """
        if self.status is ProjectStatus.abandoned:
            return ProjectStatus.abandoned
        met = (
            self.targets_met
            if self.is_tracked and self.due_at is not None
            else self.status is ProjectStatus.achieved
        )
        if met:
            return ProjectStatus.achieved
        if self.due_at is not None and date.today() > self.due_at:
            return ProjectStatus.failed
        if self.has_started:
            return ProjectStatus.in_progress
        return ProjectStatus.todo

    @property
    def learning(self) -> list[dict]:
        """Les savoirs visés et leur niveau, pour la mosaïque de l'objectif
        Apprentissage (design #27) : 0 pas commencé, 1 Étude, 2 Pratique,
        3 Application, 4 acquis — la Rétention vient après l'acquis.

        Les savoirs *effectifs*, comme `skill_ids` : un savoir posé sur une
        étape est visé par le projet."""
        skills = {s.id: s for s in self.skills}
        for step in self.steps:
            skills.update({s.id: s for s in step.skills})
        rank = {link.skill_id: link.position for link in self.skill_links}
        # Dans l'ordre de la séquence ; hors séquence ensuite, par nom.
        ordered = sorted(
            skills.values(),
            key=lambda s: (
                rank.get(s.id) is None,
                rank.get(s.id) or 0,
                name_key(s.name),
            ),
        )
        return [
            {
                "skill_id": s.id,
                "name": s.name,
                "level": _skill_level(s, self),
                "position": rank.get(s.id),
            }
            for s in ordered
        ]

    @property
    def direct_skill_ids(self) -> list[uuid.UUID]:
        """Compétences rattachées *directement* au projet (hors étapes)."""
        return [skill.id for skill in self.skills]

    @property
    def skill_ids(self) -> list[uuid.UUID]:
        """Compétences *effectives* : liens directs ∪ union des étapes."""
        ids: set[uuid.UUID] = {skill.id for skill in self.skills}
        for step in self.steps:
            ids.update(skill.id for skill in step.skills)
        return list(ids)

    # --- Retirer une condition retire sa distribution (20/09/2026) -----------
    #
    # Une étape ne distribue que des conditions **déjà déclarées** par
    # le projet — la garde est posée à l'entrée (`_check_step_skills` et ses
    # équivalents pour le Total, le résultat et la réalisation). Mais rien ne
    # tenait l'invariant à la SORTIE : délier une condition du projet laissait les
    # étapes la distribuer encore. L'étape se retrouvait à porter une condition
    # que le projet ne visait plus, et l'union des compétences effectives la
    # ressuscitait — un projet « sans » ce savoir continuait de le compter.
    #
    # On répercute donc plutôt que de refuser. Une distribution n'a pas
    # d'existence propre : elle est la part d'une condition. Refuser le délien
    # tant qu'une étape tient la condition obligerait à vider les étapes une à
    # une pour arriver au même état, sans que rien à l'écran l'explique.
    #
    # Le prix est assumé : la **tranche** portée par le lien d'étape (« 30 fois
    # ce mois-ci ») disparaît avec lui, et la reposer ne la rend pas. C'est la
    # part d'une condition qu'on vient justement de retirer.

    def undistribute_skill(self, skill_id: uuid.UUID) -> None:
        """Retire ce savoir des étapes qui le distribuaient."""
        for step in self.steps:
            step.skills = [s for s in step.skills if s.id != skill_id]

    def undistribute_metric(self, metric_id: uuid.UUID) -> None:
        """Retire ce résultat des étapes, palier intermédiaire compris."""
        for step in self.steps:
            step.metrics = [
                link for link in step.metrics if link.metric_id != metric_id
            ]


class ProjectStep(Base):
    __tablename__ = "project_steps"

    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Coche manuelle (colonne "done") — ne sert que pour une étape-acte.
    done_manual: Mapped[bool] = mapped_column(
        "done", Boolean, nullable=False, default=False
    )
    start_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_at: Mapped[date | None] = mapped_column(Date, nullable=True)

    project: Mapped["Project"] = relationship(back_populates="steps")
    skills: Mapped[list["Skill"]] = relationship(
        secondary=step_skills,
        passive_deletes=True,
    )
    # Activités qui remplissent l'étape, à travers leurs liens au projet. En
    # lecture seule. Supprimer l'étape délie les liens (step_id → NULL) : les
    # activités restent rattachées au projet.
    activities: Mapped[list["Activity"]] = relationship(
        secondary="activity_projects",
        primaryjoin="ProjectStep.id == activity_projects.c.step_id",
        secondaryjoin="Activity.id == activity_projects.c.activity_id",
        viewonly=True,
    )
    # Réalisations assignées à ce moment du plan. Supprimer l'étape les **délie**
    # (`SET NULL`) : elles restent des conditions du projet, elles perdent
    # seulement leur place dans le temps.
    achievements: Mapped[list["ProjectAchievement"]] = relationship(
        back_populates="step",
        passive_deletes=True,
    )
    # Résultats à valider ici, avec une cible intermédiaire éventuelle.
    metrics: Mapped[list["StepMetric"]] = relationship(
        back_populates="step",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    # Les tranches de Totaux confiées à l'étape.
    totals: Mapped[list["StepTotal"]] = relationship(
        back_populates="step",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    @property
    def done(self) -> bool:
        """Faite quand **tout ce qui lui est assigné** est rempli.

        C'était une cascade devinée — compétences, sinon cible, sinon coche —
        où le premier objectif présent masquait les autres. Une étape portant une
        cible ET des compétences ne regardait que les compétences, et sa coche
        manuelle était inatteignable sans qu'aucun écran ne le dise.

        Une étape **ne crée aucune condition** : elle distribue celles du
        projet dans le temps. Elle n'entre donc pas dans le statut du
        projet — « toutes les étapes faites » n'implique pas « projet
        atteint », et c'est voulu : une condition peut n'être assignée à aucune
        étape, et la somme des tranches peut rester sous la cible.

        Sans rien d'assigné, elle reste un **jalon** : une borne dans le temps
        qu'on coche à la main.
        """
        conditions = self._conditions()
        return all(conditions) if conditions else self.done_manual

    def _conditions(self) -> list[bool]:
        """L'état de chaque condition assignée à l'étape, dans l'ordre des axes."""
        conditions: list[bool] = [share.is_met for share in self.totals]
        conditions.extend(_skill_is_met(skill, self.project) for skill in self.skills)
        conditions.extend(a.done for a in self.achievements)
        # Seuls les liens à palier conditionnent : sans palier, le lien dit
        # « c'est ici qu'on travaille ce résultat », pas « il doit tomber ici ».
        conditions.extend(
            link.is_met for link in self.metrics if link.target is not None
        )
        return conditions

    @property
    def is_manual(self) -> bool:
        """Cette étape est-elle un **jalon** — cochée à la main, ou dérivée ?

        Exposé parce que l'écran a besoin de le savoir : il offrait la coche
        partout, y compris là où `done` est dérivé et où l'enregistrer n'avait
        donc aucun effet visible. Dérivé ici et non redevine côté front : la
        cascade des axes est une règle métier, la recopier ailleurs la ferait
        diverger au premier axe ajouté.
        """
        return not self._conditions()

    @property
    def skill_ids(self) -> list[uuid.UUID]:
        return [skill.id for skill in self.skills]


class ProjectAchievement(Base):
    """Une **Réalisation** : ce que le projet s'engage à avoir fait.

    C'est l'axe qualitatif du tracking — « j'ai fait le voyage », « le morceau
    est exporté », « waterstart ». Ni volume, ni chiffre : une phrase, et l'état
    de savoir si c'est fait.

    **Elle existe pour combler un trou visible en usage.** Dès qu'un projet
    portait la moindre cible chiffrée, son statut se dérivait des seuls nombres,
    et ce qu'il fallait accomplir n'était plus une condition — seulement un
    titre. Un projet pouvait ainsi passer `achieved` à 30 h sur 20 alors que
    l'étape en cours n'était pas faite : le total d'heures ne dit pas que le
    travail prévu a été fait.

    **Sans date**, volontairement : la dimension temporelle appartient aux
    étapes, qui viendront distribuer ces conditions dans le temps. Une
    réalisation non distribuée n'a simplement pas de moment.

    **Elle appartient au projet** et meurt avec lui — c'est ce qui la
    distingue d'une métrique, laquelle vit au niveau du domaine parce qu'elle se
    **réutilise** : le même Squat 1RM traverse cinq projets annuels, d'où une
    table de liaison portant une cible par projet. Une réalisation se fait une
    fois et ne sert qu'à un projet ; viser deux fois la même chose, c'est en
    décrire une autre.
    """

    __tablename__ = "project_achievements"

    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    emoji: Mapped[str | None] = mapped_column(String(16), nullable=True)
    done: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Le jour où elle a été cochée (24/09/2026) — la carte le dit, « 24 sept. ».
    # Posé par la coche, effacé par la décoche. Nul sur celles cochées avant.
    done_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Pas de colonne d'ordre : l'ordre d'ajout suffit, comme pour les résultats
    # visés. Une réalisation est une condition, pas une séquence — c'est l'étape
    # qui portera la chronologie.
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    # Le moment du plan où elle doit être faite. `null` = non distribuée : elle
    # reste une condition du projet, sans place dans le temps.
    step_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("project_steps.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    project: Mapped["Project"] = relationship(back_populates="achievements")
    step: Mapped["ProjectStep | None"] = relationship(back_populates="achievements")
    # Les séances qui la préparent (#92) : une ou plusieurs, des activités
    # liées à son projet. Lier ne coche rien.
    activities: Mapped[list["Activity"]] = relationship(
        secondary="activity_achievements",
        back_populates="achievements",
        passive_deletes=True,
        order_by="Activity.start_at",
    )
