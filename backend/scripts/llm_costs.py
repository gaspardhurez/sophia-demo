"""Le bilan du coût des appels au LLM, d'après le journal
(`SOPHIA_LLM_LOG_PATH`, défaut `backend/llm_calls.jsonl`).

    uv run python scripts/llm_costs.py            # par mois, puis par usage
    uv run python scripts/llm_costs.py --days     # par jour aussi

Deux colonnes : ce qui est **facturé** (les appels par l'API, `via: api`) et
ce qui passe par **l'abonnement** (Claude Code, `via: subscription` : non
facturé ; on en montre l'estimation de Claude Code, « ≈ », et les échecs
qui ont passé la main à l'API).

Les lignes d'avant le 30/10/2026 n'ont pas de coût : leur entrée ne sépare
pas le cache. Elles sont comptées **au tarif plein** (un plafond) et
signalées par « ≤ ».
"""

import json
import sys
from collections import defaultdict
from dataclasses import dataclass

from sophia.domain.llm_cost import call_cost
from sophia.infrastructure.config import settings


def _billed(entry: dict) -> tuple[float, bool]:
    """Le coût facturé de la ligne, et s'il est exact (sinon : plafond)."""
    if entry.get("cost_usd") is not None:
        return entry["cost_usd"], True
    searches = entry.get("web_searches") or (
        entry.get("context", {}).get("web_searches", 0)
        if isinstance(entry.get("context"), dict)
        else 0
    )
    cost = call_cost(
        entry["model"],
        input_tokens=entry.get("input_tokens", 0),
        cache_read_tokens=0,
        cache_write_tokens=0,
        output_tokens=entry.get("output_tokens", 0),
        web_searches=searches or 0,
    )
    return cost or 0.0, False


@dataclass
class Tally:
    api_calls: int = 0
    billed: float = 0.0
    exact: bool = True
    sub_calls: int = 0
    sub_failures: int = 0
    estimated: float = 0.0

    def add(self, entry: dict) -> None:
        # Les lignes d'avant le 30/10 n'ont pas de `via` : l'API.
        if entry.get("via", "api") == "subscription":
            self.sub_calls += 1
            self.sub_failures += "failure" in entry
            self.estimated += entry.get("estimated_cost_usd") or 0.0
            return
        cost, exact = _billed(entry)
        self.api_calls += 1
        self.billed += cost
        self.exact = self.exact and exact

    def line(self, label: str) -> str:
        mark = " " if self.exact else "≤"
        out = f"  {label:<14} {self.api_calls:>4} API  {mark}{self.billed:>7.2f} $"
        if self.sub_calls:
            failed = f", {self.sub_failures} échecs" if self.sub_failures else ""
            out += (
                f"   |  {self.sub_calls:>4} abonnement{failed}"
                f"  ≈{self.estimated:>7.2f} $ non facturés"
            )
        return out


def main() -> None:
    path = settings.llm_log_path
    if not path.exists():
        print(f"Pas de journal : {path}")
        return
    by_day = "--days" in sys.argv
    months: dict[str, Tally] = defaultdict(Tally)
    usages: dict[str, dict[str, Tally]] = defaultdict(lambda: defaultdict(Tally))
    days: dict[str, Tally] = defaultdict(Tally)
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw.strip():
            continue
        entry = json.loads(raw)
        month = entry["at"][:7]
        months[month].add(entry)
        usages[month][entry["usage"]].add(entry)
        days[entry["at"][:10]].add(entry)

    for month, total in sorted(months.items()):
        print(total.line(month).strip())
        for usage, tally in sorted(
            usages[month].items(), key=lambda kv: -(kv[1].billed + kv[1].estimated)
        ):
            print(tally.line(usage))
        if by_day:
            for day, tally in sorted(days.items()):
                if day.startswith(month):
                    print(tally.line(day))
        print()


if __name__ == "__main__":
    main()
