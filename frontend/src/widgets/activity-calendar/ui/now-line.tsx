import { CELL_H, DAY_START } from '../model/constants'
import { fmtHour } from '@/shared/lib/date'

const GUTTER = '3.5rem' // largeur de la gouttière des heures

/** Indicateur « maintenant » façon Notion Calendar : trait rouge **pâle** sur
 * toutes les colonnes, **vif** sur la colonne du jour courant (avec point de
 * départ), + pastille rouge de l'heure dans la gouttière. Positionné par l'heure
 * décimale et l'index du jour ; à monter dans un conteneur `relative` couvrant
 * la grille. */
export function NowLine({
  hour,
  dayIndex,
  dayCount,
}: {
  hour: number
  dayIndex: number
  dayCount: number
}) {
  const segLeft = `calc(${GUTTER} + ${dayIndex} * (100% - ${GUTTER}) / ${dayCount})`
  const segWidth = `calc((100% - ${GUTTER}) / ${dayCount})`
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20"
      style={{ top: (hour - DAY_START) * CELL_H }}
    >
      <span className="absolute left-0.5 -translate-y-1/2 rounded bg-red-500 px-1 py-px text-[10px] font-medium tabular-nums text-white">
        {fmtHour(hour)}
      </span>
      {/* Trait pâle sur toutes les colonnes. */}
      <div className="absolute left-14 right-0 h-px -translate-y-1/2 bg-red-500/25" />
      {/* Segment vif sur la colonne du jour courant + point de départ. */}
      <div
        className="absolute h-0.5 -translate-y-1/2 rounded-full bg-red-500"
        style={{ left: segLeft, width: segWidth }}
      >
        <span className="absolute left-0 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500" />
      </div>
    </div>
  )
}
