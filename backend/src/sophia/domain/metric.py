"""Invariants métier des métriques — pur, sans framework."""


class MetricError(Exception):
    """Base des violations d'invariant sur une métrique."""


class DuplicateMetricName(MetricError):
    """Le domaine a déjà une métrique de ce nom (casse ignorée).

    La contrainte existe pour la même raison que sur les unités : sans elle,
    « Squat 1RM », « Squat » et « Squat max » cohabitent et la courbe se coupe
    en deux sans qu'on comprenne pourquoi. Elle est **par domaine** — « Poids »
    peut légitimement exister dans deux domaines distincts.
    """


class MetricDomainMismatch(MetricError):
    """Le projet vise une métrique d'un autre domaine.

    Une métrique appartient à son domaine ; la viser depuis ailleurs mélangerait
    des choses sans rapport (le squat de Musculation dans un projet Cuisine).
    """


class StartValueOfAnotherMetric(MetricError):
    """Le relevé désigné comme départ n'est pas un relevé de la métrique visée.

    Le départ d'un Résultat se lit sur sa propre courbe : un relevé du RDL ne
    peut pas servir de point de départ au squat.
    """
