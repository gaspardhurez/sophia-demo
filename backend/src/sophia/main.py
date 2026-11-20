from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from sophia.api.activities import router as activities_router
from sophia.api.activity_types import router as activity_types_router
from sophia.api.companion import router as companion_router
from sophia.api.dictation import router as dictation_router
from sophia.api.domains import router as domains_router
from sophia.api.framing import router as framing_router
from sophia.api.ideas import router as ideas_router
from sophia.api.learning import router as learning_router
from sophia.api.media import router as media_router
from sophia.api.metrics import router as metrics_router
from sophia.api.notepad import router as notepad_router
from sophia.api.notes import router as notes_router
from sophia.api.planning import router as planning_router
from sophia.api.plans import router as plans_router
from sophia.api.practice import router as practice_router
from sophia.api.preparations import router as preparations_router
from sophia.api.projects import router as projects_router
from sophia.api.recall import router as recall_router
from sophia.api.resources import router as resources_router
from sophia.api.review import router as review_router
from sophia.api.skills import router as skills_router
from sophia.api.unavailabilities import router as unavailabilities_router
from sophia.api.units import router as units_router
from sophia.api.wishes import router as wishes_router
from sophia.application.companion import CompanionFailed, CompanionUnavailable
from sophia.domain.activity import (
    AchievementProjectNotLinked,
    ActivityError,
    ActKindMismatch,
    DuplicateAct,
    DuplicateProjectLink,
    DuplicateValueUnit,
    FeedbackOnPracticeOnly,
    GenericWithoutPlan,
    LinkedAchievementNotFound,
    LinkedPlanNotFound,
    LinkedPracticeItemNotFound,
    LinkedProjectNotFound,
    LinkedStepNotFound,
    MergeOtherDomain,
    MergeSourceCarries,
    NotPostponed,
    PostponeDone,
    PostponeUndated,
    ProjectDomainMismatch,
    RecallWithoutPlan,
    ShiftUndated,
    SkillDomainMismatch,
    StepProjectMismatch,
    SystemDomainActivity,
    ValueUnitNotFound,
)

# Même nom que l'erreur de projet, deux familles distinctes : le projet parle
# d'une condition impossible, l'activité d'un savoir introuvable.
from sophia.domain.activity import LinkedSkillNotFound as ActivitySkillNotFound
from sophia.domain.activity import PlanSkillMismatch as ActivityPlanSkillMismatch
from sophia.domain.domain import DomainError, SystemDomainLocked
from sophia.domain.ideas import IdeasError
from sophia.domain.media import MediaError, MediaNotFound, MediaTooLarge
from sophia.domain.metric import (
    DuplicateMetricName,
    MetricDomainMismatch,
    MetricError,
    StartValueOfAnotherMetric,
)
from sophia.domain.notes import NotesError, NotesSkillNotFound
from sophia.domain.plan import (
    PlanAlreadyClosed,
    PlanAlreadyOpen,
    PlanClosedProjects,
    PlanError,
    PlanHasProjects,
    PlanInvalidBirthState,
    PlanInvalidPeriod,
    PlanItemAlreadyInRamp,
    PlanItemNotInRamp,
    PlanItemSkillMismatch,
    PlanNotReopenable,
    PlanNotStarted,
    PlanProjectDomainMismatch,
    PlanProjectNotFound,
    PlanRampOrderMismatch,
    PlanResourceNotInCycle,
    PlanResourceNotOfSkill,
    PlanResourceOrderMismatch,
    PlanScopePartUnknown,
    PlanSkillNotFound,
    PlanStudyNotOpen,
    RecallActivityNotEligible,
    RecallCurveStarted,
    RecallNotDue,
    RecallNotRunning,
    RecallQuestionKnown,
    RecallSessionFinished,
    RecallWithoutQuestion,
    StudyHasQuestions,
)
from sophia.domain.practice import (
    PracticeError,
    PracticePlanMismatch,
    PracticeSkillNotFound,
)
from sophia.domain.preparation import (
    PreparationError,
    RitualAlreadyPlanned,
    WeekStartNotMonday,
)
from sophia.domain.project import (
    ActivityTypeDomainMismatch,
    LinkedSkillFromOtherDomain,
    LinkedSkillNotFound,
    ProjectDomainNotFound,
    ProjectDomainsInvalid,
    ProjectError,
    SequenceMismatch,
    StepConditionNotDeclared,
    StepsReorderMismatch,
    StepTargetsExceedProject,
    TotalUnitMismatch,
)
from sophia.domain.resource import (
    ResourceError,
    ResourcePlanMismatch,
    ResourceSkillNotFound,
)
from sophia.domain.review import (
    ReviewEmptyReply,
    ReviewError,
    ReviewNothingToReview,
    ReviewPastedTooLong,
)
from sophia.domain.skill import (
    CrossDomainParent,
    ParentNotFound,
    SkillCycle,
    SkillTreeError,
)
from sophia.domain.unavailability import (
    SlotOutsideUnavailability,
    UnavailabilityEndsBeforeStart,
    UnavailabilityError,
)
from sophia.domain.unit import DuplicateUnitName, UnitError, UnitReplacedByItself
from sophia.domain.wish import (
    DuplicateWishId,
    WishDomainNotFound,
    WishError,
    WishOfAnotherKind,
)

app = FastAPI(title="Sophia", version="0.1.0")

# Violations d'invariant de l'arbre → réponse HTTP. Erreurs de référence (422),
# conflits structurels avec l'état de l'arbre (409).
_SKILL_ERROR_RESPONSES: dict[type[SkillTreeError], tuple[int, str]] = {
    ParentNotFound: (422, "Compétence parente introuvable."),
    CrossDomainParent: (422, "Le parent doit appartenir au même domaine."),
    SkillCycle: (409, "Cette opération créerait un cycle dans l'arbre."),
}


@app.exception_handler(SkillTreeError)
def handle_skill_tree_error(request: Request, exc: SkillTreeError) -> JSONResponse:
    status_code, detail = _SKILL_ERROR_RESPONSES.get(
        type(exc), (422, "Opération invalide sur l'arbre de compétences.")
    )
    return JSONResponse(status_code=status_code, content={"detail": detail})


# Liens de projet invalides → 422 (la donnée soumise référence de mauvaises
# compétences).
_PROJECT_ERROR_DETAILS: dict[type[ProjectError], str] = {
    LinkedSkillNotFound: "Une compétence liée est introuvable.",
    LinkedSkillFromOtherDomain: (
        "Une compétence liée doit appartenir à un des domaines du projet."
    ),
    StepsReorderMismatch: (
        "Le réordonnancement doit lister exactement les étapes du projet."
    ),
    StepTargetsExceedProject: (
        "Les tranches d'étapes dépassent la cible du Total : une étape "
        "distribue le Total, elle ne l'augmente pas."
    ),
    ActivityTypeDomainMismatch: (
        "L'activité type doit appartenir à un des domaines du projet."
    ),
    StepConditionNotDeclared: (
        "Une étape ne peut reprendre qu'une condition déjà déclarée par le projet."
    ),
    TotalUnitMismatch: (
        "Un Total en valeur se compte dans une unité ; en durée ou au nombre, "
        "l'unité ne se choisit pas."
    ),
    SequenceMismatch: (
        "La séquence ne peut ranger que les savoirs visés par le projet, chacun "
        "une fois, découpés par ses propres étapes."
    ),
    ProjectDomainsInvalid: (
        "Un projet a au moins un domaine, et chacun n'y figure qu'une fois."
    ),
    ProjectDomainNotFound: "Un domaine du projet est introuvable.",
}


@app.exception_handler(ProjectError)
def handle_project_error(request: Request, exc: ProjectError) -> JSONResponse:
    detail = _PROJECT_ERROR_DETAILS.get(type(exc), "Projet invalide.")
    return JSONResponse(status_code=422, content={"detail": detail})


# Rattachement d'activité invalide → 422.
_ACTIVITY_ERROR_DETAILS: dict[type[ActivityError], str] = {
    DuplicateValueUnit: "Une seule valeur par unité sur une activité.",
    ValueUnitNotFound: "L'unité d'une valeur déclarée est introuvable.",
    LinkedStepNotFound: "L'étape rattachée est introuvable.",
    StepProjectMismatch: ("L'étape d'un rattachement doit appartenir à son projet."),
    DuplicateProjectLink: "Un projet ne se rattache qu'une fois à une activité.",
    LinkedProjectNotFound: "Le projet rattaché est introuvable.",
    ProjectDomainMismatch: (
        "Le domaine de l'activité doit être un des domaines du projet rattaché."
    ),
    ActivitySkillNotFound: "Le savoir travaillé est introuvable.",
    LinkedPracticeItemNotFound: "L'objet de pratique visé est introuvable.",
    LinkedPlanNotFound: "Le cycle visé est introuvable.",
    ActivityPlanSkillMismatch: (
        "Le cycle ou l'objet de pratique d'un acte n'est pas celui de son savoir."
    ),
    ActKindMismatch: (
        "Un exercice vise un objet de pratique ou une phase ; l'étude et "
        "l'interro, ni l'un ni l'autre."
    ),
    RecallWithoutPlan: "L'interro est celle d'un cycle : désigne-le.",
    FeedbackOnPracticeOnly: (
        "Un retour se donne à un exercice ou une mise en situation ; ni à "
        "l'étude ni à l'interro."
    ),
    GenericWithoutPlan: (
        "Une Pratique ou une Mise en situation sans objet est celle d'un "
        "cycle : désigne-le."
    ),
    DuplicateAct: "Cet acte est déjà dans l'activité.",
    SkillDomainMismatch: (
        "Le savoir travaillé doit appartenir au même domaine que l'activité."
    ),
    LinkedAchievementNotFound: "La réalisation à lier est introuvable.",
    AchievementProjectNotLinked: (
        "Une séance ne prépare qu'une réalisation d'un projet pour lequel elle compte."
    ),
    PostponeDone: "Une activité faite ne se reporte pas.",
    PostponeUndated: "Une activité sans date ne se reporte pas.",
    NotPostponed: "Cette activité n'a pas de report à annuler.",
    ShiftUndated: "Une activité sans date ne se déplace pas avec les autres.",
    MergeOtherDomain: "On ne fusionne que deux séances du même domaine.",
    MergeSourceCarries: (
        "La séance lâchée porte autre chose que des actes (cochée, valeurs, "
        "relevés, notes ou réalisations) : la fusion le perdrait."
    ),
    SystemDomainActivity: (
        "Le domaine Sophia est celui de l'app : on n'y ajoute ni n'en retire "
        "d'activité à la main."
    ),
}


# Nom d'unité en doublon → 422 (le référentiel existe pour l'empêcher).
@app.exception_handler(UnitError)
def handle_unit_error(request: Request, exc: UnitError) -> JSONResponse:
    detail = {
        DuplicateUnitName: "Une unité porte déjà ce nom.",
        UnitReplacedByItself: "Une unité ne se remplace pas par elle-même.",
    }.get(type(exc), "Unité invalide.")
    return JSONResponse(status_code=422, content={"detail": detail})


_METRIC_ERROR_DETAILS: dict[type[MetricError], str] = {
    DuplicateMetricName: "Ce domaine a déjà une métrique de ce nom.",
    MetricDomainMismatch: "Cette métrique n'est d'aucun des domaines du projet.",
    StartValueOfAnotherMetric: "Ce relevé n'appartient pas à la métrique visée.",
}


@app.exception_handler(MetricError)
def handle_metric_error(request: Request, exc: MetricError) -> JSONResponse:
    detail = _METRIC_ERROR_DETAILS.get(type(exc), "Métrique invalide.")
    return JSONResponse(status_code=422, content={"detail": detail})


# Objet de pratique mal rattaché → 422.
_PRACTICE_ERROR_DETAILS: dict[type[PracticeError], str] = {
    PracticeSkillNotFound: "La compétence est introuvable.",
    PracticePlanMismatch: "Ce cycle n'est pas un cycle de ce savoir.",
}


# Cycle d'acquisition mal manœuvré → 422.
_PLAN_ERROR_DETAILS: dict[type[PlanError], str] = {
    PlanSkillNotFound: "La compétence est introuvable.",
    PlanResourceNotOfSkill: "Un cycle ne choisit que des ressources de son savoir.",
    PlanResourceNotInCycle: "Cette ressource n'est pas dans l'étude du cycle.",
    PlanScopePartUnknown: (
        "Une ressource ne se lie qu'aux parties retenues du périmètre du cycle — "
        "il a changé entre-temps."
    ),
    PlanResourceOrderMismatch: (
        "L'ordre envoyé ne correspond pas aux ressources de ce cycle — elles "
        "ont changé entre-temps. Recharge-les avant de les réordonner."
    ),
    PlanStudyNotOpen: (
        "L'interro ne se lance et l'étude ne se valide que sur un cycle en cours."
    ),
    RecallCurveStarted: (
        "L'interro de ce cycle a déjà été lancée : seul « Recommencer » la "
        "ramène à J+1."
    ),
    StudyHasQuestions: (
        "Ce savoir a des questions : son étude se maîtrise par l'interro, au "
        "seuil du cycle, pas à la main."
    ),
    RecallActivityNotEligible: (
        "Le premier test se rattache à une séance non faite du domaine du "
        "savoir, de demain à dans trois jours."
    ),
    RecallNotRunning: (
        "L'interro de ce cycle n'est pas en marche : elle démarre à « Lancer "
        "le test », s'arrête après J+90 réussi, et à la clôture si elle "
        "n'est pas gardée en rétention."
    ),
    RecallNotDue: (
        "L'interro de ce cycle n'est pas encore due : elle se passe à partir "
        "du jour prévu, pas en avance."
    ),
    RecallWithoutQuestion: (
        "Les notes de ce savoir n'ont aucune question complète (posée, avec "
        "sa réponse attendue) : rien à faire passer."
    ),
    RecallSessionFinished: "Cette interro est terminée : ses réponses ne bougent plus.",
    RecallQuestionKnown: (
        "Cette question est déjà sue dans cette interro : elle ne se repasse plus."
    ),
    PlanAlreadyOpen: (
        "Un cycle est déjà en cours sur ce savoir : partage-le ou clos-le avant "
        "d'en commencer un autre."
    ),
    PlanAlreadyClosed: "Ce cycle est clos.",
    PlanClosedProjects: (
        "Un cycle clos ne change pas de projets, et un cycle déjà terminé naît "
        "sans projet : un projet se remplit en terminant son cycle."
    ),
    PlanInvalidBirthState: "Un cycle naît prévu, en cours ou déjà terminé.",
    PlanInvalidPeriod: (
        "La période d'un cycle déjà terminé : un début et une fin, dans l'ordre, "
        "sans date future."
    ),
    PlanNotReopenable: "Seul un cycle clos se rouvre.",
    PlanNotStarted: "Seul un cycle en cours voit son démarrage annulé.",
    PlanHasProjects: (
        "Un cycle qui sert un projet ne se supprime pas : modifie-le, ou "
        "détache d'abord le projet."
    ),
    PlanProjectNotFound: "Un des projets est introuvable.",
    PlanProjectDomainMismatch: (
        "Un cycle ne se rattache qu'aux projets dont le domaine de son savoir "
        "est un des domaines."
    ),
    PlanItemSkillMismatch: "Cet objet n'est pas dans la bibliothèque de ce savoir.",
    PlanItemAlreadyInRamp: "Cet objet est déjà dans la rampe du cycle.",
    PlanItemNotInRamp: "Cet objet n'est pas dans la rampe du cycle.",
    PlanRampOrderMismatch: (
        "L'ordre envoyé ne correspond pas à la rampe de ce cycle — elle a "
        "changé entre-temps. Recharge-la avant de la réordonner."
    ),
}


@app.exception_handler(PlanError)
def handle_plan_error(request: Request, exc: PlanError) -> JSONResponse:
    detail = _PLAN_ERROR_DETAILS.get(type(exc), "Plan d'acquisition invalide.")
    return JSONResponse(status_code=422, content={"detail": detail})


@app.exception_handler(PracticeError)
def handle_practice_error(request: Request, exc: PracticeError) -> JSONResponse:
    detail = _PRACTICE_ERROR_DETAILS.get(type(exc), "Objet de pratique invalide.")
    return JSONResponse(status_code=422, content={"detail": detail})


@app.exception_handler(NotesError)
def handle_notes_error(request: Request, exc: NotesError) -> JSONResponse:
    if isinstance(exc, NotesSkillNotFound):
        return JSONResponse(status_code=404, content={"detail": "Savoir introuvable"})
    return JSONResponse(status_code=422, content={"detail": "Notes invalides."})


@app.exception_handler(ResourceError)
def handle_resource_error(request: Request, exc: ResourceError) -> JSONResponse:
    if isinstance(exc, ResourceSkillNotFound):
        return JSONResponse(status_code=404, content={"detail": "Savoir introuvable"})
    detail = (
        "Ce cycle n'est pas un cycle de ce savoir."
        if isinstance(exc, ResourcePlanMismatch)
        else "Ressource invalide."
    )
    return JSONResponse(status_code=422, content={"detail": detail})


@app.exception_handler(UnavailabilityError)
def handle_unavailability_error(
    request: Request, exc: UnavailabilityError
) -> JSONResponse:
    detail = {
        UnavailabilityEndsBeforeStart: "La fin doit venir après le début.",
        SlotOutsideUnavailability: "Un créneau bloqué doit tenir dans les dates "
        "de son indisponibilité.",
    }.get(type(exc), "Indisponibilité invalide.")
    return JSONResponse(status_code=422, content={"detail": detail})


@app.exception_handler(DomainError)
def handle_domain_error(request: Request, exc: DomainError) -> JSONResponse:
    detail = {
        SystemDomainLocked: "Le domaine Sophia est celui de l'app : il n'a pas de "
        "réglage.",
    }.get(type(exc), "Domaine invalide.")
    return JSONResponse(status_code=422, content={"detail": detail})


@app.exception_handler(PreparationError)
def handle_preparation_error(request: Request, exc: PreparationError) -> JSONResponse:
    detail = {
        WeekStartNotMonday: "Une semaine se désigne par son lundi.",
        RitualAlreadyPlanned: "Cette préparation a déjà son créneau.",
    }.get(type(exc), "Préparation de la semaine invalide.")
    return JSONResponse(status_code=422, content={"detail": detail})


@app.exception_handler(ActivityError)
def handle_activity_error(request: Request, exc: ActivityError) -> JSONResponse:
    detail = _ACTIVITY_ERROR_DETAILS.get(type(exc), "Activité invalide.")
    return JSONResponse(status_code=422, content={"detail": detail})


# Média refusé : trop gros (413), type refusé (415), nom inconnu ou invalide
# (404 — un nom qui n'est pas un nom de média n'existe pas).
@app.exception_handler(MediaError)
def handle_media_error(request: Request, exc: MediaError) -> JSONResponse:
    if isinstance(exc, MediaNotFound):
        return JSONResponse(status_code=404, content={"detail": "Média introuvable"})
    if isinstance(exc, MediaTooLarge):
        return JSONResponse(
            status_code=413, content={"detail": "Image trop lourde : 20 Mo au plus."}
        )
    return JSONResponse(
        status_code=415,
        content={"detail": "Type refusé : une image PNG, JPEG, GIF ou WebP."},
    )


# Compagnon appelé alors qu'il est indisponible → 503, avec le motif : la panne
# est de configuration (clé, transcription), pas dans la donnée envoyée.
@app.exception_handler(CompanionUnavailable)
def handle_companion_unavailable(
    request: Request, exc: CompanionUnavailable
) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": exc.reason})


# Le compagnon, disponible, n'a pas rendu de résultat → 502 : la panne est en
# aval (réseau, API, réponse refusée), pas dans la requête.
@app.exception_handler(CompanionFailed)
def handle_companion_failed(request: Request, exc: CompanionFailed) -> JSONResponse:
    return JSONResponse(status_code=502, content={"detail": exc.reason})


# Vérification impossible sur ce qui est envoyé → 422.
@app.exception_handler(ReviewError)
def handle_review_error(request: Request, exc: ReviewError) -> JSONResponse:
    detail = {
        ReviewNothingToReview: "Les notes de cette ressource sont vides : rien à "
        "vérifier.",
        ReviewPastedTooLong: "Le passage collé est trop long : colle seulement la "
        "partie étudiée.",
        ReviewEmptyReply: "Une réponse ne peut pas être vide.",
    }.get(type(exc), "Vérification invalide.")
    return JSONResponse(status_code=422, content={"detail": detail})


# Idées centrales demandées sur une section sans texte → 422.
@app.exception_handler(WishError)
def handle_wish_error(request: Request, exc: WishError) -> JSONResponse:
    detail = {
        DuplicateWishId: "Une puce figure deux fois dans la liste.",
        WishOfAnotherKind: "Une puce appartient à l'autre liste.",
        WishDomainNotFound: "Le domaine d'une puce est introuvable.",
    }.get(type(exc), "Liste invalide.")
    return JSONResponse(status_code=422, content={"detail": detail})


@app.exception_handler(IdeasError)
def handle_ideas_error(request: Request, exc: IdeasError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"detail": "Cette section n'a pas de texte : rien à trier."},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # serveur de dev Vite
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(domains_router)
app.include_router(skills_router)
app.include_router(projects_router)
app.include_router(activities_router)
app.include_router(activity_types_router)
app.include_router(planning_router)
app.include_router(preparations_router)
app.include_router(learning_router)
app.include_router(units_router)
app.include_router(metrics_router)
app.include_router(practice_router)
app.include_router(resources_router)
app.include_router(plans_router)
app.include_router(recall_router)
app.include_router(notepad_router)
app.include_router(notes_router)
app.include_router(media_router)
app.include_router(unavailabilities_router)
app.include_router(wishes_router)
app.include_router(companion_router)
app.include_router(dictation_router)
app.include_router(review_router)
app.include_router(ideas_router)
app.include_router(framing_router)
