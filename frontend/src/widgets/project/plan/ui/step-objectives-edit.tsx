import { Flag } from 'lucide-react'
import { useRef, useState } from 'react'

import type { DomainColorClasses } from '@/entities/domain'
import type { ActivityType } from '@/entities/activity-type'
import type { ProjectMetric } from '@/entities/metric'
import {
  type Project,
  type ProjectStep,
  totalUnit,
  useSetStepMetric,
  useSetStepTotal,
  useUnsetStepMetric,
  useUnsetStepTotal,
  useUpdateAchievement,
} from '@/entities/project'
import { ApiError } from '@/shared/api'
import {
  formatDuration,
  formatValue,
  isTimeUnit,
  parseDuration,
  unitLabel,
  type UnitLike,
} from '@/shared/lib/units'
import { cn } from '@/shared/lib/utils'
import { toast } from '@/shared/ui'

const fail = (err: unknown) =>
  toast.error(
    err instanceof ApiError ? err.message : "L'enregistrement a échoué",
  )

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')

const toInput = (v: number, unit: UnitLike | null | undefined) =>
  isTimeUnit(unit) ? formatDuration(v, unit) : fmt(v)

function fromInput(text: string, unit: UnitLike | null | undefined) {
  if (!text.trim()) return null
  if (isTimeUnit(unit)) return parseDuration(text, unit)
  const n = Number(text.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const HATCH =
  'repeating-linear-gradient(135deg, color-mix(in oklab, currentColor 45%, transparent) 0 3px, color-mix(in oklab, currentColor 12%, transparent) 3px 6px)'

/**
 * « Objectifs » d'une étape en édition (design #27) : la part que
 * cette étape prend dans chaque objectif du projet. Une ligne par Total —
 * sa jauge dit ce que les étapes d'avant et d'après ont déjà pris —, par
 * résultat — le fil de ses paliers —, et par réalisation qu'aucune autre
 * étape ne porte, attribuée d'un interrupteur.
 */
export function StepObjectivesEdit({
  project,
  step,
  results,
  activityTypes,
  color,
}: {
  project: Project
  step: ProjectStep
  results: ProjectMetric[]
  activityTypes: ActivityType[]
  color: DomainColorClasses
}) {
  const steps = [...project.steps].sort((a, b) => a.order - b.order)
  const achievements = project.achievements.filter(
    (a) => a.step_id === null || a.step_id === step.id,
  )

  return (
    <div className="flex flex-col gap-0.5">
      <div className="mb-2 grid gap-0.5">
        <h4 className="font-heading text-sm font-semibold">Objectifs</h4>
        <p className="text-xs text-pretty text-muted-foreground">
          La part que cette étape prend dans les objectifs du projet.
        </p>
      </div>
      {[...project.totals]
        .sort((a, b) => a.position - b.position)
        .map((total) => (
          <TotalRow
            key={total.id}
            step={step}
            steps={steps}
            total={total}
            activityTypes={activityTypes}
            color={color}
          />
        ))}
      {results.map((link) => (
        <ResultRow
          key={link.metric_id}
          step={step}
          steps={steps}
          link={link}
          color={color}
        />
      ))}
      {achievements.map((a) => (
        <AchievementRow
          key={a.id}
          stepId={step.id}
          achievement={a}
          color={color}
        />
      ))}
    </div>
  )
}

function RowShell({
  axis,
  height = 44,
  children,
  onClick,
  onHover,
}: {
  axis: string
  height?: number
  children: React.ReactNode
  onClick?: () => void
  onHover?: (on: boolean) => void
}) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className={cn(
        'flex min-w-0 items-center gap-2.5 border-t border-border/60 px-0.5',
        onClick && 'cursor-pointer',
      )}
      style={{ height }}
    >
      <span className="w-24 shrink-0 text-[10px] font-semibold tracking-[.05em] text-muted-foreground uppercase">
        {axis}
      </span>
      {children}
    </div>
  )
}

/** La case saisissable de droite : la part, puis « / cible unité ». */
function ValueBox({
  value,
  onChange,
  onCommit,
  suffix,
  active,
  label,
}: {
  value: string
  onChange: (v: string) => void
  onCommit: () => void
  suffix: string
  active: boolean
  label: string
}) {
  return (
    <span className="flex w-[132px] shrink-0 justify-end">
      <label
        className={cn(
          'inline-flex h-8 cursor-text items-center rounded-md border px-[9px]',
          // Vide, la case reste bordée : elle attend sa part.
          active || !value ? 'border-border bg-card' : 'border-transparent',
        )}
      >
        <span className="flex items-baseline gap-[5px] tabular-nums">
          <input
            value={value}
            placeholder="—"
            aria-label={label}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            className="field-sizing-content min-w-[2ch] bg-transparent text-right font-heading text-sm leading-none font-semibold outline-none placeholder:text-muted-foreground"
          />
          <span className="text-[13px] leading-none whitespace-nowrap text-muted-foreground">
            {suffix}
          </span>
        </span>
      </label>
    </span>
  )
}

function TotalRow({
  step,
  steps,
  total,
  activityTypes,
  color,
}: {
  step: ProjectStep
  steps: ProjectStep[]
  total: Project['totals'][number]
  activityTypes: ActivityType[]
  color: DomainColorClasses
}) {
  const set = useSetStepTotal()
  const unset = useUnsetStepTotal()
  const share = step.totals.find((t) => t.total_id === total.id)
  const [text, setText] = useState(share ? fmt(share.target) : '')
  const [hover, setHover] = useState(false)
  const [drag, setDrag] = useState<number | null>(null)
  const bar = useRef<HTMLDivElement>(null)

  const T = total.target
  const shareOf = (s: ProjectStep) =>
    s.totals.find((t) => t.total_id === total.id)?.target ?? 0
  const before = steps
    .filter((s) => s.order < step.order)
    .reduce((n, s) => n + shareOf(s), 0)
  const after = steps
    .filter((s) => s.order > step.order)
    .reduce((n, s) => n + shareOf(s), 0)
  const max = Math.max(0, T - before - after)
  const part = drag ?? fromInput(text, null) ?? 0
  const pct = (v: number) =>
    T > 0 ? Math.max(0, Math.min(100, (v / T) * 100)) : 0
  const unit = totalUnit(total)
  const counted = activityTypes.filter((h) =>
    total.activity_type_ids.includes(h.id),
  )
  const label =
    counted.length > 0
      ? counted
          .map((h) => `${h.emoji ? `${h.emoji} ` : ''}${h.title}`)
          .join(', ')
      : 'Toutes les activités'
  // Un pas lisible : l'unité pour une cible qui se compte, le dixième sinon.
  const round = (v: number) =>
    T >= 20 ? Math.round(v) : Math.round(v * 10) / 10

  async function save(v: number | null) {
    try {
      if (v === null || v <= 0) {
        if (share)
          await unset.mutateAsync({ stepId: step.id, totalId: total.id })
        setText('')
      } else {
        await set.mutateAsync({ stepId: step.id, totalId: total.id, target: v })
        setText(fmt(v))
      }
    } catch (err) {
      fail(err)
      setText(share ? fmt(share.target) : '')
    }
  }

  function valueAt(clientX: number) {
    const r = bar.current!.getBoundingClientRect()
    const v = ((clientX - r.left) / r.width) * T - before
    return round(Math.max(0, Math.min(max, v)))
  }

  return (
    <RowShell axis="Total" onHover={setHover}>
      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
        <span className="truncate text-xs">{label}</span>
        <div
          ref={bar}
          className="relative flex h-[5px] items-center"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            setDrag(valueAt(e.clientX))
          }}
          onPointerMove={(e) => drag !== null && setDrag(valueAt(e.clientX))}
          onPointerUp={() => {
            if (drag === null) return
            // La valeur lâchée reste affichée : sans ça, la jauge revient à
            // l'ancienne part le temps que le serveur réponde.
            setText(drag > 0 ? fmt(drag) : '')
            void save(drag)
            setDrag(null)
          }}
        >
          {/* Hachuré à l'encre du domaine = pris par les autres étapes ; plein =
              cette étape ; vide = encore libre. `currentColor` porte l'encre :
              une classe de domaine ne se glisse pas dans un dégradé. */}
          <span
            className={cn(
              'absolute inset-x-0 flex h-[5px] overflow-hidden rounded-full bg-muted',
              color.text,
            )}
          >
            <span style={{ width: `${pct(before)}%`, background: HATCH }} />
            <span className={color.ink} style={{ width: `${pct(part)}%` }} />
            <span style={{ width: `${pct(after)}%`, background: HATCH }} />
          </span>
          {(hover || drag !== null) && (
            <span
              className="absolute top-1/2 size-[11px] -translate-1/2 cursor-grab rounded-full border border-ring bg-card shadow-sm"
              style={{ left: `${pct(before + part)}%` }}
            />
          )}
        </div>
      </div>
      <ValueBox
        value={drag !== null ? fmt(drag) : text}
        onChange={setText}
        onCommit={() => void save(fromInput(text, null))}
        suffix={`/ ${fmt(T)} ${unitLabel(unit, T)}`.trimEnd()}
        active={hover}
        label={`Part de l'étape : ${label}`}
      />
    </RowShell>
  )
}

function ResultRow({
  step,
  steps,
  link,
  color,
}: {
  step: ProjectStep
  steps: ProjectStep[]
  link: ProjectMetric
  color: DomainColorClasses
}) {
  const set = useSetStepMetric()
  const unset = useUnsetStepMetric()
  const { metric } = link
  const mine = step.metrics.find((m) => m.metric_id === link.metric_id)
  const [text, setText] = useState(
    mine?.target != null ? toInput(mine.target, metric.unit) : '',
  )
  const [hover, setHover] = useState(false)
  const paliers = steps.flatMap((s) => {
    const m = s.metrics.find((x) => x.metric_id === link.metric_id)
    return m?.target != null ? [{ step: s, value: m.target }] : []
  })
  const dep = link.start?.value ?? null
  // Le fil se trace dès qu'il y a un départ, même sans palier posé.
  const fil = paliers.length > 0 || dep !== null

  async function save() {
    const v = fromInput(text, metric.unit)
    try {
      if (v === null) {
        if (mine)
          await unset.mutateAsync({ stepId: step.id, metricId: link.metric_id })
      } else {
        await set.mutateAsync({
          stepId: step.id,
          metricId: link.metric_id,
          target: v,
        })
        setText(toInput(v, metric.unit))
      }
    } catch (err) {
      fail(err)
    }
  }

  return (
    <RowShell axis="Résultat" height={fil ? 72 : 44} onHover={setHover}>
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col',
          fil ? 'gap-px' : 'gap-[5px]',
        )}
      >
        <span className="truncate text-xs">
          {metric.emoji ? `${metric.emoji} ` : ''}
          {metric.name}
        </span>
        {fil && (
          <div className="relative mx-5 h-8">
            <span className="absolute inset-x-0 top-[9px] h-px bg-border" />
            {dep !== null && (
              <Jalon
                x={0}
                title="Aujourd'hui"
                value={formatValue(dep, metric.unit)}
                valueClassName="font-medium"
              >
                <span className="mt-[5px] size-2 rounded-full border-[1.5px] border-border bg-card" />
              </Jalon>
            )}
            {paliers.map((p, i) => {
              const own = p.step.id === step.id
              return (
                <Jalon
                  key={p.step.id}
                  x={((i + 1) / (paliers.length + 1)) * 100}
                  title={own ? 'Cette étape' : `Étape ${p.step.order}`}
                  value={formatValue(p.value, metric.unit)}
                  valueClassName={own ? color.text : undefined}
                >
                  {/* Le palier d'une autre étape : cerné de l'encre du domaine
                      à 45 %, portée par `currentColor`. */}
                  <span
                    className={cn(
                      'grid size-[18px] place-items-center rounded-full border-[1.5px] text-[9px] font-bold',
                      own
                        ? cn('border-transparent text-white', color.ink)
                        : cn('border-current/45 bg-card', color.text),
                    )}
                  >
                    <span className={own ? undefined : 'text-muted-foreground'}>
                      {p.step.order}
                    </span>
                  </span>
                </Jalon>
              )
            })}
            <Jalon
              x={100}
              title="Cible"
              value={formatValue(link.target, metric.unit)}
            >
              <span className="grid size-[18px] place-items-center bg-card">
                <Flag className="size-4 text-foreground/70" />
              </span>
            </Jalon>
          </div>
        )}
      </div>
      <ValueBox
        value={text}
        onChange={setText}
        onCommit={() => void save()}
        suffix={unitLabel(metric.unit, fromInput(text, metric.unit) ?? 0)}
        active={hover}
        label={`Palier de l'étape : ${metric.name}`}
      />
    </RowShell>
  )
}

function Jalon({
  x,
  title,
  value,
  valueClassName,
  children,
}: {
  x: number
  title: string
  value: string
  valueClassName?: string
  children: React.ReactNode
}) {
  return (
    <span
      title={title}
      className="absolute top-0 -ml-5 flex w-10 flex-col items-center gap-[3px]"
      style={{ left: `${x}%` }}
    >
      {children}
      <span
        className={cn(
          'text-[10px] leading-none font-semibold text-muted-foreground tabular-nums',
          valueClassName,
        )}
      >
        {value}
      </span>
    </span>
  )
}

function AchievementRow({
  stepId,
  achievement,
  color,
}: {
  stepId: string
  achievement: Project['achievements'][number]
  color: DomainColorClasses
}) {
  const update = useUpdateAchievement()
  const on = achievement.step_id === stepId
  return (
    <RowShell
      axis="Réalisation"
      onClick={() =>
        update
          .mutateAsync({
            id: achievement.id,
            body: { step_id: on ? null : stepId },
          })
          .catch(fail)
      }
    >
      <span className="min-w-0 flex-1 truncate text-xs">
        {achievement.emoji ? `${achievement.emoji} ` : ''}
        {achievement.title}
      </span>
      <span className="flex w-[132px] shrink-0 justify-end pr-[9px]">
        <span
          role="switch"
          aria-checked={on}
          aria-label="Portée par cette étape"
          className={cn(
            'inline-flex h-[18px] w-[30px] items-center rounded-full p-0.5',
            on ? cn('justify-end', color.ink) : 'justify-start bg-border',
          )}
        >
          <span className="size-3.5 rounded-full bg-white shadow-sm" />
        </span>
      </span>
    </RowShell>
  )
}
