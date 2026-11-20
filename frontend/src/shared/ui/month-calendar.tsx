import { ChevronDown, ChevronUp } from 'lucide-react'

import { addDays, sameDay, startOfDay, toDateISO } from '@/shared/lib/date'
import { cn } from '@/shared/lib/utils'

/** Ce qu'un jour porte : une séance faite, ou seulement planifiée. */
export type DayMark = 'done' | 'planned'

const WEEKDAYS = ['lu', 'ma', 'me', 'je', 've', 'sa', 'di']

/**
 * Mini-calendrier mensuel — un mois, ses jours, une pastille par jour marqué.
 *
 * Agnostique du métier : il ne sait rien des activités ni des savoirs, il
 * reçoit des marques indexées par jour. C'est ce qui lui permet de servir la
 * page d'un savoir comme n'importe quel autre écran qui a besoin d'un mois.
 *
 * Le mois affiché est **contrôlé** : l'appelant en a besoin pour ne charger que
 * la fenêtre qu'il montre.
 */
export function MonthCalendar({
  month,
  onMonthChange,
  selected,
  onSelect,
  marks,
  accentClassName = 'bg-foreground',
  accentBorderClassName = 'border-foreground',
  compact = false,
  range,
  noPast = false,
}: {
  /** N'importe quel jour du mois affiché. */
  month: Date
  onMonthChange: (month: Date) => void
  selected: Date
  onSelect: (day: Date) => void
  /** Clé = `toDateISO(jour)`. */
  marks: Map<string, DayMark>
  /** Teinte de la pastille — celle du domaine, côté appelant. */
  accentClassName?: string
  accentBorderClassName?: string
  /** Le panneau latéral a la moitié de la largeur : tout rétrécit d'un cran. */
  compact?: boolean
  /**
   * Des jours **mis en avant** (« Réviser › Cette semaine », #103) : fond
   * continu, les autres jours estompés — toujours choisissables.
   */
  range?: { from: Date; to: Date }
  /** Les jours passés ne se choisissent pas. */
  noPast?: boolean
}) {
  const today = startOfDay(new Date())
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  // La grille commence au lundi de la semaine du 1er : `getDay()` est
  // dimanche-first, d'où le décalage.
  const lead = (first.getDay() + 6) % 7
  const gridStart = addDays(first, -lead)
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  // Six rangées ne servent que les mois qui débordent : sinon la carte gagne
  // 34px de vide, et le panneau latéral les paie cher.
  const rows = days[35].getMonth() === month.getMonth() ? 6 : 5

  return (
    <div>
      <div
        className={cn(
          'flex items-center',
          compact ? 'mb-2 gap-1' : 'mb-3 gap-1.5',
        )}
      >
        <span
          className={cn(
            'min-w-0 flex-1 font-heading font-semibold capitalize',
            compact ? 'text-xs' : 'text-[13px]',
          )}
        >
          {month.toLocaleDateString('fr-FR', {
            month: 'long',
            year: 'numeric',
          })}
        </span>
        <button
          type="button"
          aria-label="Mois précédent"
          onClick={() =>
            onMonthChange(
              new Date(month.getFullYear(), month.getMonth() - 1, 1),
            )
          }
          className={cn(
            'grid shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted',
            compact ? 'size-5' : 'size-6',
          )}
        >
          <ChevronUp className={compact ? 'size-3' : 'size-3.5'} />
        </button>
        <button
          type="button"
          aria-label="Mois suivant"
          onClick={() =>
            onMonthChange(
              new Date(month.getFullYear(), month.getMonth() + 1, 1),
            )
          }
          className={cn(
            'grid shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted',
            compact ? 'size-5' : 'size-6',
          )}
        >
          <ChevronDown className={compact ? 'size-3' : 'size-3.5'} />
        </button>
      </div>

      <div
        className={cn(
          'grid grid-cols-7 gap-x-0 tabular-nums',
          compact ? 'gap-y-px' : 'gap-y-0.5',
        )}
      >
        {WEEKDAYS.map((w) => (
          <span
            key={w}
            className={cn(
              'text-center text-muted-foreground',
              compact ? 'pb-0.5 text-[10px]' : 'pb-1 text-[11px]',
            )}
          >
            {w}
          </span>
        ))}

        {days.slice(0, rows * 7).map((day) => {
          const outside = day.getMonth() !== month.getMonth()
          const isSelected = sameDay(day, selected)
          const isToday = sameDay(day, today)
          const mark = marks.get(toDateISO(day))
          const past = noPast && day < today
          const inRange =
            range !== undefined &&
            !outside &&
            day >= startOfDay(range.from) &&
            day <= startOfDay(range.to)
          // Le fond continu de la plage s'arrondit à ses bouts et aux bords
          // de la semaine.
          const col = (day.getDay() + 6) % 7
          const rangeStart = inRange && (sameDay(day, range.from) || col === 0)
          const rangeEnd = inRange && (sameDay(day, range.to) || col === 6)

          return (
            <button
              key={day.getTime()}
              type="button"
              onClick={() => onSelect(day)}
              disabled={past}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={isSelected}
              className={cn(
                'relative grid place-items-center rounded-lg',
                compact ? 'h-[26px] text-xs' : 'h-[34px] text-[13px]',
                outside && 'text-muted-foreground/60',
                range && !inRange && !outside && 'text-foreground/45',
                inRange &&
                  !isSelected &&
                  cn(
                    'rounded-none bg-muted font-semibold',
                    rangeStart && 'rounded-l-lg',
                    rangeEnd && 'rounded-r-lg',
                  ),
                past &&
                  'cursor-default text-foreground/25 hover:bg-transparent',
                isToday && 'font-semibold',
                // L'anneau dit « aujourd'hui », le remplissage dit « choisi » :
                // deux informations, deux canaux, comme sur les cartes de phase.
                isToday && !isSelected && 'ring-1 ring-inset ring-ring/60',
                isSelected
                  ? 'bg-foreground font-semibold text-background'
                  : 'hover:bg-muted',
              )}
            >
              {day.getDate()}
              {mark && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute bottom-1 size-1 rounded-full',
                    mark === 'done'
                      ? accentClassName
                      : cn('border', accentBorderClassName),
                    // Sur le jour sélectionné, la teinte du domaine passerait
                    // mal sur le fond encre : la pastille prend le fond.
                    isSelected && 'border-background bg-background',
                  )}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** La légende des pastilles — au même endroit que le calendrier qu'elle sert. */
export function MonthCalendarLegend({
  accentClassName = 'bg-foreground',
  accentBorderClassName = 'border-foreground',
}: {
  accentClassName?: string
  accentBorderClassName?: string
}) {
  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-border pt-3 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className={cn('size-1 rounded-full', accentClassName)}
        />
        séance faite
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className={cn('size-1 rounded-full border', accentBorderClassName)}
        />
        planifiée
      </span>
    </div>
  )
}
