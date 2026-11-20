"""Invariants métier des projets — pur, sans dépendance framework.

La validation qui touche la base (existence et domaine des compétences liées) vit
dans `application/projects.py` ; ici, les types d'erreur et les règles qui se
lisent sans la base.
"""


class ProjectError(Exception):
    """Base des violations d'invariant sur un projet."""


class LinkedSkillNotFound(ProjectError):
    """Une compétence référencée dans les liens n'existe pas."""


class LinkedSkillFromOtherDomain(ProjectError):
    """Une compétence liée appartient à un autre domaine que le projet."""


class StepsReorderMismatch(ProjectError):
    """Le réordonnancement ne correspond pas exactement aux étapes du projet."""


class ActivityTypeDomainMismatch(ProjectError):
    """L'activité type planifiée appartient à un autre domaine que le projet.

    Même règle que les résultats visés : une activité type est un objet du
    domaine, elle ne se planifie que pour un projet de ce domaine.
    """


class StepTargetsExceedProject(ProjectError):
    """La somme des tranches d'étapes dépasse la cible du projet.

    Une étape **distribue** le suivi, elle ne l'augmente pas : promettre plus en
    tranches que la cible entière ferait d'un découpage une exigence supérieure à
    ce qu'on s'est fixé. En dessous, en revanche, c'est normal — une étape sans
    tranche porte quand même des activités qui alimentent le volume.
    """


class StepConditionNotDeclared(ProjectError):
    """Une étape distribue une condition que son projet n'a pas déclarée.

    Compétence, réalisation ou résultat : une étape ne peut reprendre que ce qui
    existe au niveau du projet. Sinon elle créerait une exigence en propre, et
    le statut du projet ne la verrait jamais — le découpage se mettrait à
    dire autre chose que ce qu'on s'est engagé à faire.
    """


class TotalUnitMismatch(ProjectError):
    """L'unité d'un Total ne va pas avec sa façon de compter.

    En mode valeur, l'unité est ce qui dit quelles valeurs déclarées
    s'additionnent : sans elle, 12 de quoi ? En durée ou au nombre, elle ne se
    choisit pas — on compte en heures, ou en fois.
    """


class SequenceMismatch(ProjectError):
    """La séquence écrite ne tient pas sur le projet.

    Elle ne peut ranger que des savoirs que le projet vise, chacun une fois, et
    ne découper que par ses propres étapes — une séquence à plat quand il n'en
    a pas (cf. `sophia.domain.sequence`).
    """


class ProjectDomainsInvalid(ProjectError):
    """Les domaines d'un projet : au moins un, chacun une fois (#203)."""


class ProjectDomainNotFound(ProjectError):
    """Un domaine du projet est introuvable."""


def check_domain_ids(domain_ids: list) -> None:
    """Un projet a au moins un domaine — le premier est le principal — et ne
    cite chacun qu'une fois (#203)."""
    if not domain_ids or len(set(domain_ids)) != len(domain_ids):
        raise ProjectDomainsInvalid
