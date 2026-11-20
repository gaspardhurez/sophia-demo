import { ArrowDown, ArrowUp } from 'lucide-react'
import type { ReactNode } from 'react'

import { formatDateShort } from '@/shared/lib/format'
import { formatValue, isTimeUnit, unitLabel } from '@/shared/lib/units'

import { useMetricValues } from '../api/queries'
import type { Metric, MetricValue } from '../model/types'

/**
 * Le tracé de la courbe : les relevés qui comptent, dans l'ordre des jours,
 * sur un cadre de 96 × 24. Le progrès monte toujours — une métrique qui
 * descend (un chrono) se dessine donc retournée.
 */
function curvePoints(values: MetricValue[], down: boolean): string | null {
  const kept = values
    .filter((v) => v.counts)
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at))
  if (kept.length < 2) return null
  const nums = kept.map((v) => v.value)
  const lo = Math.min(...nums)
  const hi = Math.max(...nums)
  return nums
    .map((v, i) => {
      const t = hi === lo ? 0.5 : (v - lo) / (hi - lo)
      const y = 2 + (down ? t : 1 - t) * 20
      return `${(i / (nums.length - 1)) * 92 + 2},${y}`
    })
    .join(' ')
}

/**
 * Une métrique en tuile, dans la section « En chiffres » de la page domaine
 * (#192) : son nom, le record en grand, la courbe des relevés, la date du
 * record. Même gabarit que la tuile d'un compteur, qu'elle suit dans la grille.
 */
export function MetricTile({
  metric,
  lineColor,
  actions,
  hoverActions,
}: {
  metric: Metric
  /**
   * La couleur du trait (celle du domaine). Fournie par l'appelant : une
   * entité ne peut pas en importer une autre.
   */
  lineColor: string
  /** Toujours visible, à droite du nom — le bouton des relevés. */
  actions?: ReactNode
  /** Révélés au survol de la tuile, avant `actions`. */
  hoverActions?: ReactNode
}) {
  const { data: values } = useMetricValues(metric.id)
  const best = metric.best
  const points = values
    ? curvePoints(values, metric.direction === 'down')
    : null
  const Arrow = metric.direction === 'down' ? ArrowDown : ArrowUp

  return (
    <div className="group/tile flex min-w-0 flex-col gap-1.5 rounded-[10px] border bg-card px-3.5 py-3">
      <div className="flex min-h-6 items-center gap-1.5">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs font-medium text-muted-foreground">
          {metric.emoji ? (
            <span aria-hidden>{metric.emoji}</span>
          ) : (
            <Arrow aria-hidden className="size-[13px] shrink-0" />
          )}
          <span className="truncate">{metric.name}</span>
        </span>
        {hoverActions && (
          <span className="flex opacity-0 transition-opacity group-focus-within/tile:opacity-100 group-hover/tile:opacity-100">
            {hoverActions}
          </span>
        )}
        {actions}
      </div>
      <span className="font-heading text-2xl leading-none font-semibold tracking-[-0.02em] tabular-nums">
        {best ? formatValue(best.value, metric.unit) : '—'}
        {/* L'unité suit le nombre, sauf sur une durée : `mm:ss` se lit seul. */}
        {best && metric.unit && !isTimeUnit(metric.unit) && (
          <span className="ml-1 text-sm font-medium tracking-normal text-muted-foreground">
            {unitLabel(metric.unit, best.value)}
          </span>
        )}
      </span>
      {points && (
        <svg
          width="100%"
          height="22"
          viewBox="0 0 96 24"
          preserveAspectRatio="none"
          aria-hidden
        >
          <polyline
            points={points}
            fill="none"
            stroke={lineColor}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
      <span className="text-xs text-muted-foreground">
        {best
          ? `Record le ${formatDateShort(best.measured_at)}`
          : 'Aucun relevé'}
      </span>
    </div>
  )
}
