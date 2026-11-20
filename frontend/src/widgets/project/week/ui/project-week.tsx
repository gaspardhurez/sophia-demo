import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useActivities } from '@/entities/activity'
import { type DomainColorClasses } from '@/entities/domain'
import {
  type Project,
  weekAhead,
  weekDone,
  weekScope,
  UnitMarkGlyph,
} from '@/entities/project'
import {
  addDays,
  sameDay,
  startOfDay,
  startOfWeek,
  toDateISO,
  toLocalISO,
} from '@/shared/lib/date'
import { unitLabel } from '@/shared/lib/units'
import { cn } from '@/shared/lib/utils'

import { WeekDayDetail } from './week-day-detail'

const WD = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const DAY_NAMES = [
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
]
const MONTHS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
]
const NAMES: Record<number, string> = {
  0: 'Cette semaine',
  [-1]: 'La semaine passée',
  1: 'La semaine prochaine',
}

const day = (d: Date) => (d.getDate() === 1 ? '1er' : String(d.getDate()))

/** « 21 → 27 sept. », ou « 29 sept. → 5 oct. » à cheval sur deux mois. */
function rangeLabel(a: Date, b: Date): string {
  return a.getMonth() === b.getMonth()
    ? `${day(a)} → ${day(b)} ${MONTHS[b.getMonth()]}`
    : `${day(a)} ${MONTHS[a.getMonth()]} → ${day(b)} ${MONTHS[b.getMonth()]}`
}

/** Un nombre court : une décimale au plus, à la française. */
const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')

/**
 * « Cette semaine » (design #27) : sept cases — un créneau posé ou non —, puis
 * une barre compacte par Total. La barre est celle du calendrier : périmètre de
 * l'étape en cours sinon le projet, fait plus prévisionnel cumulé jusqu'à la
 * fin de la semaine affichée, et à droite ce que cette semaine seule apporte.
 * Une semaine passée dit ce qui y a été fait.
 *
 * Survoler un jour (#59) déplie ses activités sous la rangée, au-dessus des
 * barres : d'un jour à l'autre la zone reste ouverte, elle se referme quand
 * la souris quitte la rangée et la zone. Un jour sans activité n'ouvre rien.
 */
export function ProjectWeek({
  project,
  color,
  emoji,
}: {
  project: Project
  color: DomainColorClasses
  /** L'emoji du domaine, pour une activité qui n'a pas le sien. */
  emoji?: string | null
}) {
  const [offset, setOffset] = useState(0)
  // Le jour survolé, et le dernier : la zone garde son contenu en se fermant.
  const [hovered, setHovered] = useState<number | null>(null)
  const [lastDay, setLastDay] = useState<number | null>(null)
  const today = startOfDay(new Date())
  const todayStr = toDateISO(today)
  const weekStart = addDays(startOfWeek(today), offset * 7)
  const weekEnd = addDays(weekStart, 7)
  const past = weekEnd <= today

  // Le cumul part d'aujourd'hui : une semaine à venir lit aussi l'entre-deux.
  const from = weekStart < today ? weekStart : today
  const { data: activities } = useActivities({
    projectId: project.id,
    start: toLocalISO(from),
    end: toLocalISO(weekEnd),
  })

  const scope = useMemo(() => weekScope(project, todayStr), [project, todayStr])
  const list = activities ?? []
  const ahead = scope
    ? weekAhead(project, scope, list, weekStart, weekEnd, today)
    : new Map()
  const done =
    scope && past
      ? weekDone(project, scope, list, weekStart, weekEnd)
      : new Map<string, number>()

  const days = WD.map((wd, i) => {
    const d = addDays(weekStart, i)
    // La journée d'abord, puis par heure.
    const acts = list
      .filter((a) => a.start_at && sameDay(new Date(a.start_at), d))
      .sort(
        (a, b) =>
          Number(b.all_day) - Number(a.all_day) ||
          a.start_at!.localeCompare(b.start_at!),
      )
    const isToday = sameDay(d, today)
    return {
      wd,
      acts,
      posed: acts.length > 0,
      isToday,
      past: d < today,
      key: i,
    }
  })
  const shown = hovered ?? lastDay
  const detail = shown !== null ? days[shown] : null

  const name = NAMES[offset]
  const range = rangeLabel(weekStart, addDays(weekStart, 6))

  return (
    <section className="group/week shrink-0 overflow-hidden rounded-[10px] border bg-card">
      <div className="flex h-11 items-center gap-2 border-b pr-2.5 pl-3.5">
        <h3 className="font-heading text-sm font-semibold tabular-nums">
          {name ?? range}
        </h3>
        {name && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {range}
          </span>
        )}
        <div className="ml-auto flex gap-0.5 opacity-0 transition-opacity group-hover/week:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            aria-label="Semaine précédente"
            onClick={() => setOffset((o) => o - 1)}
            className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Semaine suivante"
            onClick={() => setOffset((o) => o + 1)}
            className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="grid gap-2.5 px-3.5 py-3">
        <div
          onMouseLeave={() => setHovered(null)}
          className="flex flex-col gap-2.5"
        >
          <div className="flex gap-1">
            {days.map((d) => (
              <span
                key={d.key}
                onMouseEnter={() => {
                  setHovered(d.key)
                  setLastDay(d.key)
                }}
                title={
                  d.posed
                    ? 'Créneau posé'
                    : d.isToday
                      ? "Aujourd'hui · rien de posé"
                      : 'Rien de posé'
                }
                className="flex flex-1 flex-col items-center gap-1"
              >
                <span className="text-[10px] text-muted-foreground">
                  {d.wd}
                </span>
                <span
                  className={cn(
                    'h-7 w-full rounded-[5px] border transition-shadow duration-150',
                    hovered === d.key &&
                      d.posed &&
                      cn('ring-[1.5px]', color.ring),
                    d.posed
                      ? color.soft
                      : cn(
                          'border-transparent bg-muted',
                          d.isToday && 'ring-1 ring-red-500/40 ring-inset',
                        ),
                  )}
                />
              </span>
            ))}
          </div>
          <WeekDayDetail
            open={hovered !== null && days[hovered].posed}
            title={
              detail
                ? `${DAY_NAMES[detail.key]}${detail.isToday ? " · aujourd'hui" : ''}`
                : ''
            }
            activities={detail?.acts ?? []}
            color={color}
            fallbackEmoji={emoji}
            dimDone={Boolean(detail?.past)}
          />
        </div>

        {scope?.lines.map((line) => {
          const a = ahead.get(line.key)
          const pct =
            line.max > 0 ? Math.min(100, (line.value / line.max) * 100) : 100
          const planPct =
            line.max > 0 && a
              ? Math.min(100 - pct, (a.cumul / line.max) * 100)
              : 0
          const week = past ? (done.get(line.key) ?? 0) : (a?.week ?? 0)
          return (
            <div key={line.key} className="flex h-[18px] items-center gap-2">
              <span className="grid w-3.5 shrink-0 place-items-center">
                <UnitMarkGlyph mark={line.mark} className="text-[11px]" />
              </span>
              <span className="flex h-1 flex-1 overflow-hidden rounded-full bg-muted">
                <span className={color.dot} style={{ width: `${pct}%` }} />
                <span
                  className={cn(color.dot, 'opacity-35')}
                  style={{ width: `${planPct}%` }}
                />
              </span>
              <span className="min-w-16 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">
                {fmt(line.value)}/{fmt(line.max)}{' '}
                {unitLabel(line.unit, line.max)}
              </span>
              <span
                className={cn(
                  'w-7 shrink-0 text-right text-[11px] font-semibold tabular-nums',
                  color.text,
                )}
              >
                {week > 0 ? (past ? fmt(week) : `+${fmt(week)}`) : ''}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
