import { ArrowRight, CalendarDays, Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'

import { toDateISO } from '@/shared/lib/date'
import {
  PanelSection,
  PeriodPicker,
  SectionIconButton,
  SectionOk,
  Switch,
} from '@/shared/ui'

/** La date d'une activité telle que le panneau l'édite. */
export interface When {
  allDay: boolean
  start: Date
  end: Date
}

const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

function at(day: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(day)
  d.setHours(h || 0, m || 0, 0, 0)
  return d
}

function duration(start: Date, end: Date): string {
  const min = Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / 60_000),
  )
  const h = Math.floor(min / 60)
  return min % 60 ? `${h}h${pad(min % 60)}` : `${h}h`
}

const dayLabel = (d: Date) =>
  d.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  })

/**
 * **Dates** (#44) : lecture nue — l'horaire et sa durée, puis le jour ; le
 * crayon au survol déplie l'édition en place : heure de début → fin et durée,
 * le jour, l'interrupteur « Journée », « OK ». Remplace « Planifier à une
 * heure » et « Repasser en journée entière ».
 *
 * Chaque changement part tout de suite (`onChange`) : les heures à la sortie
 * du champ, le jour et l'interrupteur au clic.
 */
export function DatesSection({
  when,
  onChange,
}: {
  when: When
  onChange: (next: When) => void
}) {
  const [editing, setEditing] = useState(false)
  const [from, setFrom] = useState(hhmm(when.start))
  const [to, setTo] = useState(hhmm(when.end))

  // Une date changée ailleurs (un glisser au calendrier) se relit ici.
  const startMs = when.start.getTime()
  const endMs = when.end.getTime()
  useEffect(() => {
    setFrom(hhmm(new Date(startMs)))
    setTo(hhmm(new Date(endMs)))
  }, [startMs, endMs])

  const multiDay = when.allDay && toDateISO(when.end) > toDateISO(when.start)

  function commitTimes(f: string, t: string) {
    const start = at(when.start, f)
    let end = at(when.start, t)
    if (end < start) end = start
    if (
      start.getTime() === when.start.getTime() &&
      end.getTime() === when.end.getTime()
    )
      return
    onChange({ allDay: false, start, end })
  }

  function setDay(iso: string | null) {
    if (!iso) return
    const [y, m, d] = iso.split('-').map(Number)
    const start = new Date(when.start)
    start.setFullYear(y, m - 1, d)
    const end = new Date(
      start.getTime() + (when.end.getTime() - when.start.getTime()),
    )
    onChange({ ...when, start, end })
  }

  function toggleAllDay() {
    if (when.allDay) {
      // Une heure proche de maintenant, bornée à la journée utile : c'est ce
      // que proposait « Planifier à une heure ».
      const h = Math.min(22, Math.max(7, new Date().getHours() + 1))
      onChange({
        allDay: false,
        start: at(when.start, `${pad(h)}:00`),
        end: at(when.start, `${pad(Math.min(23, h + 1))}:00`),
      })
    } else {
      const midnight = new Date(when.start)
      midnight.setHours(0, 0, 0, 0)
      onChange({ allDay: true, start: midnight, end: midnight })
    }
  }

  return (
    <PanelSection
      icon={CalendarDays}
      title="Dates"
      large
      always={editing}
      action={
        editing ? (
          <SectionOk onClick={() => setEditing(false)} />
        ) : (
          <SectionIconButton
            label="Modifier les dates"
            icon={Pencil}
            onClick={() => setEditing(true)}
          />
        )
      }
    >
      {editing ? (
        <div className="flex flex-col gap-1.5 pb-1 pl-[34px] pr-2">
          {!when.allDay && (
            <div className="flex items-center gap-1.5 text-sm">
              <input
                type="time"
                aria-label="Début"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                onBlur={() => commitTimes(from, to)}
                className="h-7 rounded-md border border-border bg-transparent px-1.5 tabular-nums outline-none focus:border-foreground/45"
              />
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                type="time"
                aria-label="Fin"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                onBlur={() => commitTimes(from, to)}
                className="h-7 rounded-md border border-border bg-transparent px-1.5 tabular-nums outline-none focus:border-foreground/45"
              />
              <span className="text-muted-foreground">
                {duration(at(when.start, from), at(when.start, to))}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <PeriodPicker
              mode="single"
              variant="compact"
              start={toDateISO(when.start)}
              onChange={(s) => setDay(s)}
              aria-label="Jour"
            />
            <button
              type="button"
              onClick={toggleAllDay}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              <Switch on={when.allDay} />
              Journée
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col pb-1 pl-[34px] pr-2 text-sm">
          <span className="flex gap-2 tabular-nums">
            {when.allDay ? (
              'Toute la journée'
            ) : (
              <>
                <span>
                  {hhmm(when.start)} → {hhmm(when.end)}
                </span>
                <span className="text-muted-foreground">
                  {duration(when.start, when.end)}
                </span>
              </>
            )}
          </span>
          <span className="text-muted-foreground">
            {dayLabel(when.start)}
            {multiDay && ` → ${dayLabel(when.end)}`}
          </span>
        </div>
      )}
    </PanelSection>
  )
}
