"""Schémas Pydantic du plan d'acquisition (V4)."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from sophia.infrastructure.models import PlanState, PracticeNature, RetentionSpacing


def _blank_to_none(value: str | None) -> str | None:
    """Un niveau visé (ou un nom) vidé n'est pas une valeur : il s'enregistre nul.

    Sans quoi `""` passerait pour un niveau saisi — le déliage garderait un
    brouillon vierge, et l'en-tête afficherait une ligne vide au lieu de la
    description.
    """
    if value is None or not value.strip():
        return None
    return value


class PlanCreate(BaseModel):
    """Prévoir un cycle (brouillon), l'ouvrir d'emblée, ou le dire **déjà
    terminé** (`completed`, avec sa période, sans projet).

    Le réglage de naissance est le même partout : Étude, Pratique et
    Application ; Rétention éteinte (`DEFAULT_PHASES`).
    """

    state: PlanState = PlanState.draft
    target_level: str | None = Field(default=None, max_length=200)
    name: str | None = Field(default=None, max_length=120)
    study: bool = True
    isolated: bool = True
    situation: bool = True
    retention: bool = False
    retention_spacing: RetentionSpacing | None = None
    retention_interval_days: int | None = Field(default=None, gt=0)
    retention_ends_at: date | None = None
    #: Le seuil de l'étude (#157) : le nombre de tests de l'interro à faire
    #: (1 = J+1 … 5 = J+90) ; 3, J+15, par défaut.
    recall_target: int = Field(default=3, ge=1, le=5)
    #: Les projets que ce cycle sert. Un projet qui avait déjà un cycle
    #: pour ce savoir le quitte (vide, ce cycle disparaît).
    project_ids: list[uuid.UUID] = Field(default_factory=list)
    #: La période d'un cycle déjà terminé (`state: completed`), et d'elle seule.
    started_on: date | None = None
    finished_on: date | None = None

    blank_texts = field_validator("target_level", "name")(_blank_to_none)


class ScopeRename(BaseModel):
    """Une partie du périmètre renommée : ses liens aux ressources la
    suivent sous son nouveau nom."""

    model_config = ConfigDict(populate_by_name=True)

    from_: str = Field(alias="from")
    to: str


class PlanUpdate(BaseModel):
    #: L'intention du cycle (affichée « Intention ») : ce qu'on saura faire.
    target_level: str | None = Field(default=None, max_length=200)
    #: Le périmètre, en texte libre et facultatif (#173) ; vidé, il est nul.
    scope: str | None = None
    #: Avec `scope` seulement : les parties renommées par cette réécriture,
    #: pour que les ressources qui s'y lient les suivent (30/10). Sans eux,
    #: une partie qui n'est plus retenue perd ses liens.
    scope_renames: list[ScopeRename] | None = None
    name: str | None = Field(default=None, max_length=120)
    study: bool | None = None
    isolated: bool | None = None
    situation: bool | None = None
    retention: bool | None = None
    retention_spacing: RetentionSpacing | None = None
    retention_interval_days: int | None = Field(default=None, gt=0)
    retention_ends_at: date | None = None
    retention_next_due_at: date | None = None
    #: La liste entière des projets rattachés (même règle qu'à la création).
    project_ids: list[uuid.UUID] | None = None
    #: Les ressources étudiées (liste entière), prises dans la bibliothèque.
    #: Ajoute en fin celles qui manquent, retire (et recompacte) celles qui
    #: n'y sont plus ; **ne réordonne pas** : l'ordre a sa route.
    resource_ids: list[uuid.UUID] | None = None
    #: Le seuil de l'étude (#157), en nombre de tests (1 = J+1 … 5 = J+90).
    recall_target: int | None = Field(default=None, ge=1, le=5)

    blank_texts = field_validator("target_level", "scope", "name")(_blank_to_none)

    @model_validator(mode="after")
    def renames_need_a_scope(self) -> "PlanUpdate":
        if self.scope_renames and "scope" not in self.model_fields_set:
            raise ValueError("Des parties renommées viennent avec le périmètre.")
        return self


class PlanStart(BaseModel):
    """Commencer : le cycle de ce projet, s'il est donné."""

    project_id: uuid.UUID | None = None


class PlanComplete(BaseModel):
    """Déclarer acquis — et ce qu'on garde en rétention (la liste entière des
    objets de la rampe à garder ; absente, rien ne change)."""

    retention_item_ids: list[uuid.UUID] | None = None
    #: Garder l'interro en rétention : sa courbe continue après l'acquis ;
    #: sinon elle s'arrête à la clôture. Absent, le réglage du cycle tient.
    recall_in_retention: bool | None = None


class PlanItemAdd(BaseModel):
    """Piocher un objet de la bibliothèque : il arrive en fin de sa rampe."""

    item_id: uuid.UUID


class PlanItemUpdate(BaseModel):
    done: bool | None = None
    in_retention: bool | None = None
    #: Le critère de maîtrise de la pièce dans ce cycle (#157) : tant de
    #: passes faites au niveau ou plus.
    criterion_passes: int | None = Field(default=None, ge=1, le=10)
    criterion_level: int | None = Field(default=None, ge=3, le=5)


class RecallLaunch(BaseModel):
    """« Lancer le test » (#157) : le premier test demain, en journée entière
    (sans séance), ou rattaché à une séance non faite du domaine du savoir,
    de J+1 à J+3 — la courbe part alors de son jour."""

    activity_id: uuid.UUID | None = None


class PlanRampOrder(BaseModel):
    """L'ordre voulu pour une rampe du cycle — tous ses ids, dans l'ordre,
    pour une nature."""

    nature: PracticeNature
    item_ids: list[uuid.UUID] = Field(min_length=1)


class PlanResourceOrder(BaseModel):
    """L'ordre de consommation voulu — toutes les ressources du cycle, dans
    l'ordre."""

    resource_ids: list[uuid.UUID] = Field(min_length=1)


class PlanResourceUpdate(BaseModel):
    """Cocher ou décocher « consommée », ou lier la ressource à des parties
    du périmètre (la liste entière ; vide, plus aucun lien). Absent, un
    champ ne change rien."""

    consumed: bool | None = None
    #: Des parties **retenues** du périmètre courant, sinon 422 (30/10).
    scope_parts: list[str] | None = None


class PlanResourceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    resource_id: uuid.UUID
    #: L'ordre de consommation, de 0 à n-1.
    position: int
    #: Le moment où elle a été cochée consommée ; nulle sinon.
    consumed_at: datetime | None
    #: Les parties du périmètre qu'elle couvre, dans l'ordre du périmètre.
    scope_parts: list[str]


class PlanItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    item_id: uuid.UUID
    rank: int
    done: bool
    # Le moment du verdict ; nul s'il n'est pas validé (ou l'a été avant
    # que la date se garde).
    done_at: datetime | None
    in_retention: bool
    #: Passes faites dans ce cycle sur cet objet.
    sessions: int
    #: Le critère de maîtrise (#157) : `criterion_passes` passes faites au
    #: niveau `criterion_level` ou plus ; `passes_at_level`, celles qui y
    #: sont. `mastered` : le verdict à la main, ou le critère rempli.
    criterion_passes: int
    criterion_level: int
    passes_at_level: int
    mastered: bool


class PlanRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    skill_id: uuid.UUID
    state: PlanState
    #: Affiché « Intention » : ce qu'on saura faire à la fin du cycle.
    target_level: str | None
    #: Le périmètre (#173), facultatif.
    scope: str | None
    name: str | None
    study: bool
    isolated: bool
    situation: bool
    retention: bool
    retention_spacing: RetentionSpacing | None
    retention_interval_days: int | None
    retention_ends_at: date | None
    retention_next_due_at: date | None
    #: L'étude maîtrisée (#157) : l'interro au seuil, ou l'étude validée à la
    #: main (sans questions).
    study_mastered: bool
    #: Le seuil, en nombre de tests (1 = J+1 … 5 = J+90 ; 3 par défaut).
    recall_target: int
    #: La courbe de l'interro : rang de l'intervalle à venir (J+1…J+90 ; 5
    #: une fois terminée) et date du prochain rappel — sans date, pas de
    #: courbe en marche.
    recall_stage: int | None
    recall_next_due_at: date | None
    #: La courbe est terminée (J+90 réussi) : plus d'interro.
    recall_finished: bool
    #: Les « Recommencer » de l'interro, lignes de son historique.
    recall_restarted_at: list[datetime]
    #: L'interro gardée en rétention (sa courbe continue après la clôture).
    recall_in_retention: bool
    #: La passation commencée et pas terminée, qui se reprend.
    recall_session_id: uuid.UUID | None
    #: « Lancer le test » : le jour où la courbe a été lancée (première ligne
    #: de l'historique de l'interro) ; nul avant.
    recall_launched_at: datetime | None
    #: « Valider l'étude », à la main, quand le savoir n'a pas de questions.
    study_validated_at: datetime | None
    #: Les questions complètes du savoir — ce que l'interro ferait passer.
    question_count: int
    #: Les ressources étudiées, dans l'ordre de consommation.
    resource_ids: list[uuid.UUID]
    #: Les mêmes avec leur place et leur case « consommée » (#173).
    resources: list[PlanResourceRead] = Field(validation_alias="resource_links")
    observed: bool
    project_ids: list[uuid.UUID]
    #: La rampe du cycle, par rang (les deux natures mêlées : l'objet dit la
    #: sienne dans la bibliothèque).
    items: list[PlanItemRead]
    opened_at: datetime | None
    closed_at: datetime | None
    created_at: datetime
    #: Objets de pratique maîtrisés / attendus sur les sous-phases actives.
    done_items: int
    total_items: int
    #: Toutes les phases actives sont maîtrisées — oriente, ne tranche pas.
    is_satisfied: bool
    #: Les séances faites du cycle qui portent son étude, et celles qui
    #: portent sa pièce générique de Pratique / d'Application (#107) : la
    #: phase passe « en cours » à la première (point 11).
    study_sessions: int
    isolated_sessions: int
    situation_sessions: int
