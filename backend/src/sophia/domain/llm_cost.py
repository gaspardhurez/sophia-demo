"""Le coût d'un appel au LLM, en dollars, d'après ses jetons. Pur.

Les tarifs de l'API (par million de jetons), relevés le 30/10/2026 — à
reprendre quand ils changent ou qu'un modèle s'ajoute. L'écriture en cache
(5 minutes) coûte 1,25 fois l'entrée ; la lecture, un dixième (moins encore
sur Opus 5.5). Une recherche web coûte 10 $ les 1 000.

Le repli côté serveur (`fallbacks`) peut faire répondre un autre modèle que
celui demandé : le journal note celui qui a répondu, d'où les modèles de
repli dans la table. Un modèle absent n'a pas de coût (`None`), plutôt qu'un
faux.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Price:
    """Dollars par million de jetons."""

    input: float
    output: float
    cache_read: float
    cache_write: float


PRICES: dict[str, Price] = {
    "claude-opus-5-5": Price(4.00, 20.00, 0.20, 5.00),
    "claude-opus-5": Price(5.00, 25.00, 0.50, 6.25),
    "claude-opus-4-8": Price(5.00, 25.00, 0.50, 6.25),
    "claude-sonnet-5-5": Price(2.00, 10.00, 0.20, 2.50),
    # Jusqu'à 100 000 jetons d'entrée (au-delà, le prix monte : jamais
    # atteint par la dictée).
    "claude-haiku-5-5": Price(0.10, 0.50, 0.01, 0.125),
}

#: Une recherche web (`web_search`), en dollars.
WEB_SEARCH_USD = 0.01


def call_cost(
    model: str,
    *,
    input_tokens: int,
    cache_read_tokens: int,
    cache_write_tokens: int,
    output_tokens: int,
    web_searches: int = 0,
) -> float | None:
    """Le coût de l'appel ; `input_tokens` : l'entrée **hors cache**.
    `None` pour un modèle dont on n'a pas le tarif."""
    price = PRICES.get(model)
    if price is None:
        return None
    return (
        input_tokens * price.input
        + cache_read_tokens * price.cache_read
        + cache_write_tokens * price.cache_write
        + output_tokens * price.output
    ) / 1_000_000 + web_searches * WEB_SEARCH_USD
