"""Invariants métier du plan d'acquisition (V4). Pur, sans framework."""

from datetime import date


class PlanError(Exception):
    """Base des violations d'invariant sur un plan d'acquisition."""


class PlanSkillNotFound(PlanError):
    """La compétence à laquelle rattacher le plan n'existe pas."""


class PlanAlreadyOpen(PlanError):
    """Un cycle est déjà **en cours** sur cette compétence.

    Plusieurs cycles peuvent être prévus, mais **un seul en cours à la fois** :
    deux cycles ouverts ensemble sur le même savoir ne sauraient pas dire
    lequel des deux niveaux visés on est en train d'atteindre. Refusé à
    l'ouverture (commencer, reprendre), jamais à la préparation.
    """


class PlanAlreadyClosed(PlanError):
    """Le cycle est clos — abouti ou abandonné : il ne se commence, ne se
    termine ni ne s'abandonne plus. Il se règle encore (nom, niveau, phases,
    rampe), pour remplir après coup un cycle déjà terminé."""


class PlanClosedProjects(PlanError):
    """Un cycle clos ne change pas de projets, et un cycle déjà terminé naît
    sans projet : seule la clôture d'un cycle remplit la condition
    Apprentissage d'un projet, on ne la rattache pas après coup."""


class PlanInvalidBirthState(PlanError):
    """Un cycle naît prévu, en cours ou déjà terminé — jamais abandonné."""


class PlanInvalidPeriod(PlanError):
    """La période d'un cycle déjà terminé : un début, une fin, le début avant
    la fin, rien dans le futur."""


def check_period(start: date | None, end: date | None, today: date) -> None:
    """La période d'un cycle déjà terminé est complète, dans l'ordre, et
    passée."""
    if start is None or end is None or start > end or end > today:
        raise PlanInvalidPeriod(f"{start} → {end}")


class PlanNotReopenable(PlanError):
    """Seul un cycle **clos** — acquis ou abandonné — se rouvre.

    Le statut d'un cycle est manuel (design #67) : la complétion ne fait que
    suggérer la clôture, on peut donc revenir sur un acquis. Il ne remplit plus
    ses projets tant qu'il n'est pas terminé à nouveau.
    """


class PlanNotStarted(PlanError):
    """Seul un cycle **en cours** voit son démarrage annulé."""


class PlanHasProjects(PlanError):
    """Un cycle qui sert un projet ne se supprime pas : on le modifie. Pour
    l'en défaire, on détache le projet."""


class PlanProjectNotFound(PlanError):
    """Un projet à rattacher au cycle n'existe pas."""


class PlanProjectDomainMismatch(PlanError):
    """Un cycle ne se rattache qu'aux projets du domaine de son savoir."""


class PlanItemSkillMismatch(PlanError):
    """Une rampe ne pioche que dans la bibliothèque de son propre savoir."""


class PlanItemAlreadyInRamp(PlanError):
    """L'objet est déjà dans la rampe de ce cycle."""


class PlanItemNotInRamp(PlanError):
    """L'objet n'est pas dans la rampe de ce cycle."""


class PlanRampOrderMismatch(PlanError):
    """L'ordre envoyé ne décrit pas la rampe de ce cycle pour cette nature.

    Même doctrine que l'ancienne rampe du savoir : on envoie **la liste
    entière** ; un id étranger, un doublon ou une liste incomplète veut dire que
    la vue a divergé de la base.
    """


class PlanResourceNotOfSkill(PlanError):
    """Un cycle ne choisit que des ressources de son propre savoir."""


class PlanResourceNotInCycle(PlanError):
    """La ressource n'est pas dans l'étude de ce cycle."""


class PlanScopePartUnknown(PlanError):
    """Une ressource ne se lie qu'aux parties **retenues** du périmètre de son
    cycle — pas à un bord (« Hors de ce cycle »), ni à une partie disparue."""


class PlanResourceOrderMismatch(PlanError):
    """L'ordre envoyé ne décrit pas les ressources de ce cycle : on envoie la
    liste entière, sans doublon — elle a pu changer entre-temps."""


class PlanStudyNotOpen(PlanError):
    """L'interro ne se lance et l'étude ne se valide que sur le cycle **en
    cours** : un cycle prévu n'a pas commencé, un cycle clos ne bouge plus."""


class RecallCurveStarted(PlanError):
    """La courbe de l'interro de ce cycle a déjà été lancée : « Lancer le
    test » ne vaut qu'une fois ; seul « Recommencer » la ramène à J+1."""


class StudyHasQuestions(PlanError):
    """Le savoir a des questions : son étude se maîtrise par l'interro, au
    seuil du cycle — elle ne se valide pas à la main (#157)."""


class RecallActivityNotEligible(PlanError):
    """La séance choisie pour porter le premier test n'y convient pas : elle
    doit exister, être du domaine du savoir, ne pas être faite, et tomber de
    J+1 à J+3 (#157)."""


class RecallNotRunning(PlanError):
    """L'interro ne se passe que sur une courbe **en marche** : pas encore
    lancée (« Lancer le test »), en pause (étude rouverte), ou arrêtée à la
    clôture du cycle."""


class RecallNotDue(PlanError):
    """L'interro n'est pas encore due : une nouvelle passation ne s'ouvre
    qu'à partir du jour prévu (#138, plus de passation en avance). Une
    passation déjà ouverte, elle, se reprend toujours."""


class RecallWithoutQuestion(PlanError):
    """Le savoir du cycle n'a aucune question complète : rien à faire
    passer."""


class RecallSessionFinished(PlanError):
    """Cette passation est terminée : ses réponses ne bougent plus."""


class RecallQuestionKnown(PlanError):
    """Cette question a déjà été sue dans cette passation : elle ne se
    repasse plus."""
