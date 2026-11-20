import { ChevronRight } from 'lucide-react'
import { useRef, useState } from 'react'

import { type Activity, useUpdateActivity } from '@/entities/activity'
import type { DomainColorValues } from '@/entities/domain'
import {
  countsForWeekLine,
  type Project,
  type ProgressLine,
  totalMeasure,
  TotalPaceHover,
  UnitMarkGlyph,
  type WeekAhead,
  type WeekScope,
} from '@/entities/project'
import { ApiError } from '@/shared/api'
import { toDateISO } from '@/shared/lib/date'
import { unitLabel } from '@/shared/lib/units'
import { cn } from '@/shared/lib/utils'
import { ProgressMeter, toast } from '@/shared/ui'

import {
  dayLabel,
  fr,
  parseMetricValue,
  tint,
  TONE_TEXT,
} from '../model/format'

/** Les séances d'une liste, dans l'ordre du calendrier, les sans heure
 *  d'abord dans un jour. */
const byCalendar = (x: Activity, y: Activity) =>
  (x.start_at ?? '')
    .slice(0, 10)
    .localeCompare((y.start_at ?? '').slice(0, 10)) ||
  Number(!x.all_day) - Number(!y.all_day) ||
  (x.start_at ?? '').localeCompare(y.start_at ?? '')

/**
 * Un Total dans les Cibles de la semaine prochaine (#92, #147,
 * `prod/Preparation de la semaine`) : sa barre, le projeté sur la cible et
 * « +n », la part de la semaine, et un chevron. Un clic sur la ligne la
 * **déplie** : dessous, alignées sur la liste des Activités, les séances de la semaine qu'il compte (son « sur »,
 * toutes sans), chacune avec sa valeur déclarée dans l'unité du Total —
 * saisir l'écrit (à la sortie du champ ou sur Entrée), vider l'efface ; le
 * « +n » et la part prévue suivent la saisie en direct. Un Total qui se
 * compte de lui-même (durée, nombre) n'a pas de champ : chaque séance dit en
 * gris ce qu'elle apporte. Pas d'ajout de séance ici : c'est au calendrier.
 */
export function TotalRow({
  line,
  ahead,
  project,
  scope,
  activities,
  colors,
  barClass,
  domainEmoji,
}: {
  line: ProgressLine
  ahead: WeekAhead | undefined
  project: Project
  scope: WeekScope
  /** Les séances de la semaine prochaine (posées : un fantôme ne porte pas
   *  de valeur). */
  activities: Activity[]
  colors: DomainColorValues
  barClass: string
  domainEmoji: string
}) {
  const update = useUpdateActivity()
  const [open, setOpen] = useState(false)
  // La saisie en cours, par séance : ce qui n'est pas encore écrit.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  // Échap quitte le champ sans écrire.
  const skip = useRef(false)

  const total = project.totals.find((t) => t.id === line.key)
  const unitId = total?.mode === 'value' ? (total.unit?.id ?? null) : null
  const sessions = activities
    .filter((a) => !a.done && countsForWeekLine(project, scope, line.key, a))
    .sort(byCalendar)

  const saved = (a: Activity) =>
    a.values
      .filter((v) => v.unit_id === unitId)
      .reduce((sum, v) => sum + v.value, 0)
  // Ce que la saisie change, en direct, avant d'être écrite.
  const delta = sessions.reduce((sum, a) => {
    const text = drafts[a.id]
    if (text === undefined) return sum
    const n = text.trim() === '' ? 0 : parseMetricValue(text, line.unit)
    return n === null ? sum : sum + n - saved(a)
  }, 0)
  const week = (ahead?.week ?? 0) + delta
  const planned = (ahead?.cumul ?? 0) + delta
  // Ce que le Total vaudra à la fin de la semaine prochaine, si ce qui est
  // prévu se fait — le réalisé, on vient de le voir.
  const projected = line.value + planned

  function drop(id: string) {
    setDrafts(({ [id]: _, ...rest }) => rest)
  }

  async function write(a: Activity) {
    const text = drafts[a.id]
    if (skip.current) {
      skip.current = false
      return drop(a.id)
    }
    if (text === undefined || !unitId) return
    const n = text.trim() === '' ? null : parseMetricValue(text, line.unit)
    if (text.trim() !== '' && n === null) {
      toast.error('Valeur illisible')
      drop(a.id)
      return
    }
    if ((n ?? 0) === saved(a)) return drop(a.id)
    const others = a.values
      .filter((v) => v.unit_id !== unitId)
      .map((v) => ({ unit_id: v.unit_id, value: v.value }))
    try {
      await update.mutateAsync({
        id: a.id,
        body: {
          values:
            n === null ? others : [...others, { unit_id: unitId, value: n }],
        },
      })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Échec')
    }
    drop(a.id)
  }

  // La carte de rythme au survol (30/10) : la tranche si la barre en est
  // une, sinon le Total du projet.
  const inStep = scope.lineScope.get(line.key)?.step && scope.step
  return (
    <div className="flex flex-col">
      <TotalPaceHover
        project={project}
        scope={
          inStep
            ? { kind: 'step', step: scope.step! }
            : total
              ? { kind: 'total', total }
              : { kind: 'project' }
        }
        totalId={line.key}
        today={toDateISO(new Date())}
        ink={colors.ink}
        className="flex w-full min-w-0"
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full min-w-0 items-center gap-2 text-left"
        >
          <span className="grid w-5 shrink-0 place-items-center text-sm">
            <UnitMarkGlyph mark={line.mark} />
          </span>
          <ProgressMeter
            className="min-w-0 flex-1"
            value={line.value}
            max={line.max}
            planned={planned}
            barClassName={barClass}
            trailing={
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                <span>
                  <span
                    className={cn(projected > line.value && 'font-semibold')}
                    style={
                      projected > line.value ? { color: colors.ink } : undefined
                    }
                  >
                    {fr(projected)}
                  </span>
                  /{fr(line.max)}
                </span>{' '}
                {unitLabel(line.unit, line.max)}
                {week > 0 && (
                  <span
                    className={cn(
                      'rounded-[4px] px-1.5 py-px text-[11px] font-semibold',
                      TONE_TEXT,
                    )}
                    style={{ background: tint(colors.base, 15) }}
                  >
                    +{fr(week)}
                  </span>
                )}
              </span>
            }
          />
          <ChevronRight
            aria-hidden
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90',
            )}
          />
        </button>
      </TotalPaceHover>
      {open && (
        <div className="flex flex-col gap-0.5 pt-0.5 pb-1.5">
          {sessions.length === 0 && (
            <p className="py-1 text-xs text-muted-foreground">
              Aucune séance de la semaine ne le compte.
            </p>
          )}
          {sessions.map((a) => {
            const brings = total ? totalMeasure(total, a) : 0
            return (
              <div
                key={a.id}
                className="flex min-h-[30px] items-center gap-2 text-[12.5px]"
              >
                <span className="w-12 shrink-0 text-[11.5px] font-semibold whitespace-nowrap">
                  {a.start_at && dayLabel(new Date(a.start_at))}
                </span>
                <span className="text-xs">{a.emoji || domainEmoji}</span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {a.title}
                </span>
                {unitId ? (
                  <span className="inline-flex shrink-0 items-center gap-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="—"
                      value={drafts[a.id] ?? (saved(a) ? fr(saved(a)) : '')}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [a.id]: e.target.value }))
                      }
                      onBlur={() => void write(a)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') {
                          e.stopPropagation()
                          skip.current = true
                          e.currentTarget.blur()
                        }
                      }}
                      className="h-[26px] w-[46px] rounded-md border border-input bg-background px-1.5 text-right text-[12.5px] tabular-nums outline-none focus:ring-2 focus:ring-ring/40"
                    />
                    <span className="min-w-[18px] text-[11.5px] text-muted-foreground">
                      {unitLabel(line.unit, 2)}
                    </span>
                  </span>
                ) : (
                  <span className="shrink-0 text-muted-foreground tabular-nums whitespace-nowrap">
                    {fr(brings)} {unitLabel(line.unit, brings)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
