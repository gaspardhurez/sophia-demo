import { cn } from '@/shared/lib/utils'

import { RECALL_INTERVALS } from '../model/recall'

/**
 * La frise de la courbe de l'interro (design #80, `prod/Interro` 3d à 3f et
 * 3h) : J+1 · J+7 · J+15 · J+30 · J+90. Les crans atteints sont pleins, le
 * cran visé cerclé, à l'encre du domaine (#102 ; passée par l'appelant :
 * l'entité ignore les domaines) ; courbe terminée, tous pleins. Après un
 * ancien raté (`setback`), les crans perdus se barrent.
 */
export function RecallCurve({
  reached,
  target,
  setback = false,
  size = 'md',
  fillClassName = 'bg-foreground',
  ringClassName = 'border-foreground',
}: {
  /** Combien de crans sont atteints (les premiers). */
  reached: number
  /** Le cran visé : l'intervalle qui court jusqu'à la prochaine interro. */
  target: number
  setback?: boolean
  size?: 'sm' | 'md'
  /** Le fond d'un cran atteint — `domainColor(...).ink`. */
  fillClassName?: string
  /** La bordure du cran visé — une classe `border-…` du domaine. */
  ringClassName?: string
}) {
  const last = RECALL_INTERVALS.length - 1
  // Au-delà du dernier cran, la courbe est terminée (#102) : plus de cran
  // visé, tous pleins.
  const goal = target > last ? -1 : target
  return (
    <ol className="flex items-center" aria-label="Courbe de l'interro">
      {RECALL_INTERVALS.map((days, i) => {
        const aimed = i === goal
        const done = !aimed && i < reached
        const lost = setback && i > goal && i < reached
        return (
          <li
            key={days}
            aria-current={aimed ? 'step' : undefined}
            className="relative flex flex-1 flex-col items-center gap-1.5"
          >
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  'absolute right-1/2 left-[-50%] h-0.5',
                  size === 'sm' ? 'top-[5px]' : 'top-1.5',
                  i <= reached || aimed
                    ? cn(fillClassName, 'opacity-35')
                    : 'bg-border',
                )}
              />
            )}
            <span
              aria-hidden
              className={cn(
                'relative rounded-full',
                size === 'sm' ? 'size-3' : 'size-3.5',
                aimed
                  ? cn('border-2', ringClassName, 'bg-card')
                  : done
                    ? fillClassName
                    : 'border-[1.5px] border-border bg-card',
              )}
            />
            <span
              className={cn(
                'tabular-nums',
                size === 'sm' ? 'text-[11px]' : 'text-xs',
                aimed
                  ? 'font-semibold text-foreground'
                  : 'text-muted-foreground',
                lost && 'line-through',
              )}
            >
              J+{days}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
