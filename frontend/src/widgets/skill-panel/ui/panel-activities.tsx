import { useMemo, useState } from 'react'

import { type Activity, ActivityRow, useActivities } from '@/entities/activity'
import type { DomainColorClasses } from '@/entities/domain'
import { fmtTime, sameDay, startOfDay, toDateISO } from '@/shared/lib/date'
import { type DayMark, MonthCalendar } from '@/shared/ui'

/**
 * Les activités du savoir, en deux colonnes égales.
 *
 * Le panneau est la page en miniature : mêmes objets, moins de place. Le mois
 * et le jour se partagent donc la largeur au lieu de s'empiler, et la légende
 * saute — les deux pastilles se comprennent sans elle une fois qu'on les a
 * vues sur la page.
 */
export function PanelActivities({
  skillId,
  accent,
  domainEmoji,
}: {
  skillId: string
  accent: DomainColorClasses
  domainEmoji: string
}) {
  const today = startOfDay(new Date())
  const [selected, setSelected] = useState(today)
  const [month, setMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  )
  const { data: activities } = useActivities({ skillId })

  const marks = useMemo(() => {
    const map = new Map<string, DayMark>()
    for (const a of activities ?? []) {
      if (!a.start_at) continue
      const key = toDateISO(new Date(a.start_at))
      if (a.done || !map.has(key)) map.set(key, a.done ? 'done' : 'planned')
    }
    return map
  }, [activities])

  const ofDay = (activities ?? [])
    .filter((a) => a.start_at && sameDay(new Date(a.start_at), selected))
    .sort((a, b) => (a.start_at ?? '').localeCompare(b.start_at ?? ''))

  const state = (a: Activity) =>
    a.done
      ? ('done' as const)
      : selected < today
        ? ('due' as const)
        : ('todo' as const)

  return (
    <section className="border-b border-border px-5 py-4">
      <h3 className="mb-2.5 font-heading text-[13px] font-semibold">
        Activités
      </h3>
      <div className="flex flex-wrap rounded-lg border border-border bg-card">
        <div className="min-w-0 flex-[1_1_50%] border-border p-3 max-[404px]:border-b min-[404px]:border-r">
          <MonthCalendar
            compact
            month={month}
            onMonthChange={setMonth}
            selected={selected}
            onSelect={setSelected}
            marks={marks}
            accentClassName={accent.dot}
            accentBorderClassName={accent.soft}
          />
        </div>
        <div className="min-w-0 flex-[1_1_50%] py-3">
          <h4 className="mb-1.5 px-3 font-heading text-xs font-semibold first-letter:capitalize">
            {sameDay(selected, today)
              ? "Aujourd'hui"
              : selected.toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                })}
          </h4>
          {ofDay.length === 0 ? (
            <p className="px-3 text-xs text-muted-foreground">
              Rien ce jour-là
            </p>
          ) : (
            ofDay.map((a) => (
              <ActivityRow
                key={a.id}
                dense
                state={state(a)}
                emoji={a.emoji || domainEmoji}
                title={a.title}
                trailing={
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    {a.all_day
                      ? 'journée'
                      : a.start_at
                        ? fmtTime(a.start_at)
                        : ''}
                  </span>
                }
              />
            ))
          )}
        </div>
      </div>
    </section>
  )
}
