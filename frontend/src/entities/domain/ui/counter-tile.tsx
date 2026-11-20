import { Clock } from 'lucide-react'

import { formatValue } from '@/shared/lib/units'
import { cn } from '@/shared/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui'

import { domainColor } from '../model/color'
import {
  counterAmount,
  counterName,
  counterSince,
  counterYear,
} from '../model/counter'
import type { DomainCounter } from '../model/types'

/**
 * Un compteur en tuile, dans la section « En chiffres » de la page domaine
 * (#192) : son nom, le grand chiffre à l'encre du domaine, depuis quand il
 * tourne. L'année se lit au survol. Même gabarit que `MetricTile`, qu'elle
 * précède dans la grille.
 */
export function CounterTile({
  counter,
  colorKey,
}: {
  counter: DomainCounter
  colorKey: string | null | undefined
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex min-w-0 flex-col gap-1.5 rounded-[10px] border bg-card px-3.5 py-3">
          <span className="flex min-h-6 min-w-0 items-center gap-1.5 truncate text-xs font-medium text-muted-foreground">
            {counter.unit ? (
              counter.unit.emoji && (
                <span aria-hidden>{counter.unit.emoji}</span>
              )
            ) : (
              <Clock aria-hidden className="size-[13px] shrink-0" />
            )}
            {counterName(counter)}
          </span>
          <span
            className={cn(
              'font-heading text-2xl leading-none font-semibold tracking-[-0.02em] tabular-nums',
              domainColor(colorKey).text,
            )}
          >
            {counter.unit
              ? formatValue(counter.total, counter.unit)
              : counterAmount(counter, counter.total)}
          </span>
          <span className="text-xs text-muted-foreground">
            {counterSince(counter)}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>{counterYear(counter)}</TooltipContent>
    </Tooltip>
  )
}
