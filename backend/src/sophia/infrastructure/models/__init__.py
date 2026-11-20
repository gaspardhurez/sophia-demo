"""Modèles SQLAlchemy.

Tout modèle doit être importé ici pour être enregistré sur `Base.metadata`
et vu par l'autogenerate d'Alembic.
"""

from sophia.infrastructure.models.activity import (
    Activity,
    ActivityAct,
    ActivityProject,
    ActKind,
    activity_achievements,
)
from sophia.infrastructure.models.activity_type import (
    ActivityType,
    Planning,
    ProjectActivityType,
    ProjectActivityTypeStepOff,
)
from sophia.infrastructure.models.domain import Domain, DomainStatus
from sophia.infrastructure.models.metric import (
    Metric,
    MetricDirection,
    MetricValue,
    ProjectMetric,
    StepMetric,
)
from sophia.infrastructure.models.notepad import Notepad
from sophia.infrastructure.models.notes import NoteQuestion, SkillNotes
from sophia.infrastructure.models.plan import (
    DEFAULT_PHASES,
    AcquisitionPlan,
    PlanItem,
    PlanState,
    RetentionSpacing,
    plan_projects,
)
from sophia.infrastructure.models.practice import (
    ContentSource,
    EvalMode,
    PracticeItem,
    PracticeKind,
    PracticeNature,
)
from sophia.infrastructure.models.project import (
    STORED_STATUSES,
    Project,
    ProjectAchievement,
    ProjectDomain,
    ProjectSkillLink,
    ProjectStatus,
    ProjectStep,
    project_skills,
    step_skills,
)
from sophia.infrastructure.models.recall import (
    RecallAnswer,
    RecallAttempt,
    RecallRestart,
    RecallSession,
)
from sophia.infrastructure.models.resource import (
    PlanResource,
    Resource,
    ResourceNotes,
)
from sophia.infrastructure.models.review import ReviewComment, ReviewReply
from sophia.infrastructure.models.skill import (
    Skill,
    SkillStatus,
)
from sophia.infrastructure.models.total import (
    ActivityValue,
    ProjectTotal,
    StepTotal,
    TotalMode,
    total_activity_types,
)
from sophia.infrastructure.models.unavailability import (
    Unavailability,
    UnavailabilitySlot,
)
from sophia.infrastructure.models.unit import Unit, UnitKind, UnitTone
from sophia.infrastructure.models.week_preparation import (
    WeekPreparation,
    WeekPreparationProject,
    WeekPreparationState,
)
from sophia.infrastructure.models.wish import Wish, WishKind

__all__ = [
    "AcquisitionPlan",
    "DEFAULT_PHASES",
    "PlanItem",
    "plan_projects",
    "PlanResource",
    "RecallAnswer",
    "RecallAttempt",
    "RecallRestart",
    "RecallSession",
    "Resource",
    "ResourceNotes",
    "ReviewComment",
    "ReviewReply",
    "ActKind",
    "Activity",
    "ActivityAct",
    "ActivityProject",
    "ActivityValue",
    "Domain",
    "DomainStatus",
    "ActivityType",
    "Notepad",
    "NoteQuestion",
    "ProjectActivityType",
    "ProjectActivityTypeStepOff",
    "Planning",
    "Metric",
    "MetricDirection",
    "MetricValue",
    "Project",
    "ProjectSkillLink",
    "ProjectAchievement",
    "ProjectDomain",
    "ProjectMetric",
    "StepMetric",
    "StepTotal",
    "ProjectStatus",
    "STORED_STATUSES",
    "ProjectStep",
    "ProjectTotal",
    "PlanState",
    "RetentionSpacing",
    "ContentSource",
    "EvalMode",
    "PracticeItem",
    "PracticeKind",
    "PracticeNature",
    "Skill",
    "SkillNotes",
    "SkillStatus",
    "TotalMode",
    "Unavailability",
    "UnavailabilitySlot",
    "Unit",
    "UnitKind",
    "UnitTone",
    "project_skills",
    "step_skills",
    "total_activity_types",
    "activity_achievements",
    "WeekPreparation",
    "WeekPreparationProject",
    "WeekPreparationState",
    "Wish",
    "WishKind",
]
