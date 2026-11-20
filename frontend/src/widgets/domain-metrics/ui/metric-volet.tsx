import { X } from 'lucide-react'

import { domainColor, domainColorValues, type Domain } from '@/entities/domain'
import { useMetrics } from '@/entities/metric'
import { MetricValuesPanel } from '@/features/metric/values'

/**
 * Le panneau des relevés d'une métrique du domaine (design #51), ouvert depuis
 * l'icône courbe de sa carte : le même volet que celui d'un Résultat sur la
 * page projet (droite, pleine hauteur, 380 px), mais sans saison ni cible —
 * sur la page domaine, la métrique est chez elle : le record absolu, la courbe
 * ou la liste, l'ajout d'un relevé (`MetricValuesPanel`).
 */
export function MetricValuesVolet({
  domain,
  metricId,
  onClose,
}: {
  domain: Domain
  metricId: string
  onClose: () => void
}) {
  const { data: metrics } = useMetrics(domain.id)
  const metric = metrics?.find((m) => m.id === metricId)
  // La métrique a pu être supprimée pendant que le panneau était ouvert.
  if (!metric) return null
  return (
    <aside
      aria-label="Relevés de la métrique"
      className="fixed inset-y-0 right-0 z-40 flex w-[380px] max-w-full flex-col gap-4 overflow-y-auto border-l border-border bg-card p-4 shadow-xl duration-200 animate-in slide-in-from-right"
    >
      <div className="flex items-center gap-2.5">
        <span
          className="grid size-[30px] shrink-0 place-items-center rounded-lg text-base"
          style={{ background: domainColorValues(domain.color).soft }}
        >
          {metric.emoji ?? domain.emoji}
        </span>
        <span className="min-w-0 truncate font-heading text-base font-semibold">
          {metric.name}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <X className="size-[15px]" />
        </button>
      </div>
      <MetricValuesPanel
        key={metric.id}
        metric={metric}
        accentTextClassName={domainColor(domain.color).text}
      />
    </aside>
  )
}
