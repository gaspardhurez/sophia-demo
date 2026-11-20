import { cn } from '@/shared/lib/utils'

import { DAY_LETTERS, PLANNING_LABELS } from '../lib/link'
import { DAY_LABELS } from '../lib/weekdays'
import type { Planning } from '../model/types'

const PLANNINGS: Planning[] = ['daily', 'weekly', 'manual']

/**
 * La planification en popover (#38, `kit/Activites types`) : Quotidienne ·
 * Hebdomadaire · Manuelle, et les sept jours en Hebdomadaire. Inerte :
 * l'appelant traduit le choix — le lien d'un projet, ou le repli d'une
 * activité type sur la page domaine.
 */
export function PlanningField({
  planning,
  weekdays,
  onPlanning,
  onToggleDay,
}: {
  planning: Planning
  weekdays: number[]
  onPlanning: (planning: Planning) => void
  onToggleDay: (day: number) => void
}) {
  return (
    <>
      <div className="grid grid-cols-3 gap-0.5 rounded-[7px] bg-muted p-0.5">
        {PLANNINGS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={planning === p}
            onClick={() => planning !== p && onPlanning(p)}
            className={cn(
              'h-7 rounded-[5px] text-xs transition',
              planning === p
                ? 'bg-card font-medium text-foreground shadow-[0_1px_2px_0_color-mix(in_oklab,var(--color-foreground)_14%,transparent)]'
                : 'text-muted-foreground',
            )}
          >
            {PLANNING_LABELS[p]}
          </button>
        ))}
      </div>
      {planning === 'weekly' && (
        <div className="grid grid-cols-7 gap-1">
          {DAY_LETTERS.map((letter, day) => (
            <button
              key={day}
              type="button"
              aria-label={DAY_LABELS[day]}
              aria-pressed={weekdays.includes(day)}
              onClick={() => onToggleDay(day)}
              className={cn(
                'h-8 rounded-md border text-xs font-medium transition-colors',
                weekdays.includes(day)
                  ? 'border-foreground/40 bg-muted'
                  : 'border-border text-muted-foreground hover:bg-muted/60',
              )}
            >
              {letter}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
