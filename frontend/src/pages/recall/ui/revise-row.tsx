import { CalendarDays, X } from 'lucide-react'
import { useState } from 'react'

import { addDays, startOfDay, toDateISO } from '@/shared/lib/date'
import { cn } from '@/shared/lib/utils'
import {
  MonthCalendar,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui'

type Span = 'tomorrow' | 'week' | 'next'

const SPANS: { key: Span; label: string }[] = [
  { key: 'tomorrow', label: 'Demain' },
  { key: 'week', label: 'Cette semaine' },
  { key: 'next', label: 'La semaine prochaine' },
]

/** Les jours qu'une pilule met en avant : demain ; de demain à dimanche ;
 *  du lundi au dimanche suivants. */
function spanOf(key: Span, today: Date): { from: Date; to: Date } {
  const tomorrow = addDays(today, 1)
  const sunday = addDays(today, (7 - today.getDay()) % 7)
  if (key === 'tomorrow') return { from: tomorrow, to: tomorrow }
  if (key === 'week')
    return { from: tomorrow, to: sunday < tomorrow ? tomorrow : sunday }
  return { from: addDays(sunday, 1), to: addDays(sunday, 7) }
}

/** « ven. 9 oct. » */
function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/**
 * « Réviser » (#103, 5a), dès le 3ᵉ passage, au-dessus du champ : 📅
 * Réviser, puis les pilules Demain / Cette semaine / La semaine prochaine ;
 * chacune ouvre le mini-calendrier avec ses jours en avant (les autres
 * estompés, choisissables ; les passés non). Un jour choisi pose une séance
 * de révision du savoir et devient « 📅 Révision ven. 9 oct. × » (× la
 * retire). La question reste dans la file : la révision n'est qu'un plus.
 */
export function ReviseRow({
  revisionOn,
  onPick,
  onClear,
}: {
  /** Le jour de la révision posée, s'il y en a une. */
  revisionOn: string | null
  onPick: (day: string) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState<Span | null>(null)
  const today = startOfDay(new Date())
  const [month, setMonth] = useState(today)

  if (revisionOn)
    return (
      <div className="mb-2.5 flex text-[12.5px]">
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-muted pr-1 pl-2.5 font-semibold">
          <CalendarDays className="size-[13px]" strokeWidth={2.2} />
          Révision {dayLabel(revisionOn)}
          <button
            type="button"
            aria-label="Retirer la révision"
            onClick={onClear}
            className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <X className="size-[11px]" strokeWidth={2.4} />
          </button>
        </span>
      </div>
    )

  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
      <span className="mr-0.5 inline-flex items-center gap-1.5 text-muted-foreground">
        <CalendarDays className="size-[13px]" />
        Réviser
      </span>
      {SPANS.map(({ key, label }) => (
        <Popover
          key={key}
          open={open === key}
          onOpenChange={(o) => {
            setOpen(o ? key : null)
            if (o) setMonth(spanOf(key, today).from)
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                'h-7 rounded-full border px-2.5 font-semibold',
                open === key
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-card hover:bg-muted',
              )}
            >
              {label}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[268px] p-3.5">
            <MonthCalendar
              month={month}
              onMonthChange={setMonth}
              // Rien n'est choisi tant qu'on n'a pas cliqué un jour.
              selected={new Date(0)}
              onSelect={(day) => {
                setOpen(null)
                onPick(toDateISO(day))
              }}
              marks={new Map()}
              range={spanOf(key, today)}
              noPast
            />
          </PopoverContent>
        </Popover>
      ))}
    </div>
  )
}
