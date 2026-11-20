import type { CSSProperties, ReactNode } from 'react'

import { CounterChip, domainColor, domainColorValues } from '@/entities/domain'
import { useProjectMetrics } from '@/entities/metric'
import { type Project, useProjectCounters } from '@/entities/project'
import { useRowOverflow } from '@/shared/lib/use-row-overflow'
import { cn } from '@/shared/lib/utils'

import { trackingChips } from '../model/tracking'
import { TrackingChips } from './tracking-chips'

/**
 * Les chips de l'en-tête d'un projet en pied de carte (#210) — la carte de
 * l'accueil et de la page domaine, celle de la colonne « Projets de la
 * semaine » du calendrier : ses compteurs, puis une chip par objectif, en
 * lecture seule, sur **une ligne**. Ce qui ne tient pas se compte en « +n ».
 *
 * Au survol de la carte (`group/card`), la ligne s'ouvre en douceur sur toutes
 * ses chips et le « +n » s'efface. La ligne est mesurée (`useRowOverflow`) ;
 * quand elle déborde, le pied porte `data-overflow` — la carte peut s'en
 * servir (une ombre à l'ouverture).
 */
export function ProjectTrackingRow({
  project,
  colorKey,
  empty = null,
  className,
}: {
  project: Project
  /** La couleur du domaine qui teinte la carte. */
  colorKey: string | null | undefined
  /** Ni objectif ni compteur : ce qui s'écrit à la place (rien par défaut). */
  empty?: ReactNode
  className?: string
}) {
  const { data: results } = useProjectMetrics(project.id)
  const { data: counters } = useProjectCounters(project.id)
  const [rowRef, overflow] = useRowOverflow<HTMLDivElement>()
  const chips = trackingChips(project, results ?? [])

  if (chips.length === 0 && (counters ?? []).length === 0) return empty
  const folds = overflow.hidden > 0
  return (
    <div
      data-overflow={folds || undefined}
      className={cn('flex min-w-0 items-start gap-1.5', className)}
    >
      <TrackingChips
        readOnly
        chips={chips}
        color={domainColor(colorKey)}
        ink={domainColorValues(colorKey).ink}
        rowRef={rowRef}
        className={cn(
          'max-h-[22px] min-w-0 flex-1 overflow-hidden transition-[max-height] duration-[320ms] ease-[cubic-bezier(.2,.8,.2,1)]',
          folds && 'group-hover/card:max-h-[var(--row-h)]',
        )}
        style={{ '--row-h': `${overflow.height}px` } as CSSProperties}
        before={counters?.map((counter) => (
          <CounterChip
            key={counter.unit?.id ?? 'hours'}
            counter={counter}
            colorKey={colorKey}
            hint="Pendant le projet"
            className="h-[22px] gap-[5px] px-[7px] text-[11.5px] font-medium"
          />
        ))}
      />
      {folds && (
        <span
          title={overflow.labels.join(' · ')}
          className="inline-flex h-[22px] shrink-0 cursor-default items-center rounded-md bg-muted px-1.5 text-[11.5px] font-medium text-muted-foreground transition-opacity duration-200 group-hover/card:opacity-0"
        >
          +{overflow.hidden}
        </span>
      )}
    </div>
  )
}
