import { CalendarDays } from 'lucide-react'
import { useEffect, useState } from 'react'

import { toDateISO } from '@/shared/lib/date'
import { PanelSection, PeriodPicker, Switch } from '@/shared/ui'

import { at, hhmm, onDay, type Period, toggleWholeDays } from '../model/time'

const TIME_INPUT =
  'h-7 rounded-md border border-border bg-transparent px-1.5 text-sm tabular-nums outline-none focus:border-foreground/45'

/**
 * **Dates** d'une indisponibilité (`kit/Panneau indispo`) : toujours dépliées
 * — début, puis fin, chacun son jour et son heure — et « Journées entières »,
 * qui retire les heures.
 *
 * Chaque changement part tout de suite : le jour au choix, l'heure à la
 * sortie du champ.
 */
export function PeriodFields({
  period,
  onChange,
}: {
  period: Period
  onChange: (next: Period) => void
}) {
  const [from, setFrom] = useState(hhmm(period.start))
  const [to, setTo] = useState(hhmm(period.end))
  const startMs = period.start.getTime()
  const endMs = period.end.getTime()
  useEffect(() => {
    setFrom(hhmm(new Date(startMs)))
    setTo(hhmm(new Date(endMs)))
  }, [startMs, endMs])

  function commitTimes() {
    const start = at(period.start, from)
    const end = at(period.end, to)
    if (start.getTime() === startMs && end.getTime() === endMs) return
    onChange({ ...period, start, end })
  }

  return (
    <PanelSection icon={CalendarDays} title="Dates" large>
      <div className="grid grid-cols-[auto_auto] justify-start gap-1.5 pb-1 pl-[34px] pr-2">
        <PeriodPicker
          mode="single"
          variant="compact"
          start={toDateISO(period.start)}
          onChange={(s) => {
            if (!s) return
            const start = onDay(s, period.start)
            // La fin suit si elle passerait avant le début.
            const end = period.end < start ? onDay(s, period.end) : period.end
            onChange({ ...period, start, end })
          }}
          aria-label="Début"
        />
        {!period.allDay ? (
          <input
            type="time"
            aria-label="Heure de début"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            onBlur={commitTimes}
            className={TIME_INPUT}
          />
        ) : (
          <span />
        )}
        <PeriodPicker
          mode="single"
          variant="compact"
          start={toDateISO(period.end)}
          onChange={(s) =>
            s && onChange({ ...period, end: onDay(s, period.end) })
          }
          aria-label="Fin"
        />
        {!period.allDay ? (
          <input
            type="time"
            aria-label="Heure de fin"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            onBlur={commitTimes}
            className={TIME_INPUT}
          />
        ) : (
          <span />
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(toggleWholeDays(period))}
        className="ml-[34px] inline-flex items-center gap-1.5 self-start pb-1 text-xs text-muted-foreground"
      >
        <Switch on={period.allDay} />
        Journées entières
      </button>
    </PanelSection>
  )
}
