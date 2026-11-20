import { type ProgressLine, UnitMarkGlyph } from '@/entities/project'
import { RotationDots, useRotation } from '@/shared/ui'

import { lineValue } from '../model/panel'

/**
 * La barre des Totaux qu'un lien alimente. Plusieurs : **une à la fois**, des
 * points à la couleur du domaine après la valeur, et un défilement automatique ;
 * un point grossit au survol, et un clic affiche sa barre et **fige** le
 * défilement (`useRotation`, partagé avec les cartes de projet du calendrier).
 */
export function TotalsCarousel({
  lines,
  color,
}: {
  lines: ProgressLine[]
  /** La couleur du domaine, en valeur CSS (barre et point actif). */
  color: string
}) {
  const { current, choose } = useRotation(lines.length)
  if (lines.length === 0) return null
  const line = lines[current]
  const pct = Math.min(100, Math.round((line.value / (line.max || 1)) * 100))

  return (
    <div className="flex items-center gap-2">
      <span className="grid w-3.5 shrink-0 place-items-center text-[11px] leading-none">
        <UnitMarkGlyph mark={line.mark} />
      </span>
      <span className="flex h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          className="transition-[width] duration-300"
          style={{ width: `${pct}%`, background: color }}
        />
      </span>
      <span className="shrink-0 text-[11px] whitespace-nowrap text-muted-foreground tabular-nums">
        {lineValue(line)}
      </span>
      <RotationDots
        labels={lines.map(lineValue)}
        current={current}
        color={color}
        onChoose={choose}
      />
    </div>
  )
}
