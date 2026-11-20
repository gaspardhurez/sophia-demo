import { Clock } from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui'

import { domainColor } from '../model/color'
import { counterAmount, counterYear } from '../model/counter'
import type { DomainCounter } from '../model/types'

/**
 * Un compteur en chip, dans l'en-tête du domaine (#192) : pleine et bordée de
 * la couleur du domaine, l'horloge pour les heures, l'emoji de l'unité sinon.
 * La valeur est depuis toujours ; l'année se lit au survol. Dans l'en-tête
 * d'un projet (#194), le compteur du projet : « Pendant le projet » au survol,
 * au poids des chips d'objectif.
 */
export function CounterChip({
  counter,
  colorKey,
  hint,
  className,
}: {
  counter: DomainCounter
  colorKey: string | null | undefined
  /** Le survol, à la place de l'année. */
  hint?: string
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex h-6 items-center gap-1.5 rounded-md border px-[9px] text-xs leading-none font-semibold whitespace-nowrap tabular-nums',
            domainColor(colorKey).soft,
            className,
          )}
        >
          {counter.unit ? (
            counter.unit.emoji && <span aria-hidden>{counter.unit.emoji}</span>
          ) : (
            <Clock aria-hidden className="size-[13px] shrink-0" />
          )}
          {counterAmount(counter, counter.total)}
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint ?? counterYear(counter)}</TooltipContent>
    </Tooltip>
  )
}
