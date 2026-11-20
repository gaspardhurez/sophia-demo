import { Check, ChevronRight, X } from 'lucide-react'

import type { DomainColorClasses } from '@/entities/domain'
import type { ActivityType } from '@/entities/activity-type'
import type { ProjectMetric } from '@/entities/metric'
import {
  ObjectiveCheck,
  type Project,
  type ProjectIssue,
  type ProjectStep,
  PACING_META,
  PaceDot,
  pacing,
  stepIssue,
  stepProgressLines,
  totalUnit,
  useUpdateAchievement,
} from '@/entities/project'
import { formatValue, unitLabel } from '@/shared/lib/units'
import { cn } from '@/shared/lib/utils'
import { shortDay, toast } from '@/shared/ui'

import { Mosaic, type PlanSkill, SkillRow } from './plan-skills'

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')

/** « 21 sept. → 18 oct. » — ou ce qu'on sait d'une étape à moitié datée. */
export function periodOf(step: ProjectStep): string {
  if (step.start_at && step.due_at)
    return `${shortDay(step.start_at)} → ${shortDay(step.due_at)}`
  if (step.due_at) return `→ ${shortDay(step.due_at)}`
  if (step.start_at) return `dès ${shortDay(step.start_at)}`
  return 'Sans dates'
}

/**
 * Une étape du plan (design #27) : une carte qui contient tout. Repliée, le
 * titre, la période et le rythme ; dépliée, ses objectifs d'étape — la part de
 * chaque Total, le palier de chaque résultat, ses réalisations, ses savoirs en
 * mosaïque — puis sa part de la séquence. Seule l'étape en cours s'ouvre
 * d'elle-même ; une étape close s'efface et se réveille au survol.
 */
export function PlanStep({
  project,
  step,
  skills,
  results,
  activityTypes,
  current,
  expanded,
  onToggle,
  color,
  ink,
  emoji,
  today,
  projectIssue,
  onOpenSkill,
}: {
  project: Project
  step: ProjectStep
  /** Les savoirs de l'étape, dans l'ordre de la séquence. */
  skills: PlanSkill[]
  results: ProjectMetric[]
  activityTypes: ActivityType[]
  current: boolean
  expanded: boolean
  onToggle: () => void
  color: DomainColorClasses
  /** L'encre du domaine (une couleur CSS) : la carte de rythme (#112). */
  ink: string
  emoji?: string | null
  today: string
  /** L'issue du projet, s'il est clos : plus de rythme à suivre. */
  projectIssue?: ProjectIssue | null
  onOpenSkill?: (skillId: string) => void
}) {
  // L'issue d'une étape reste la sienne, jugée sur ses propres activités —
  // indépendante de celle du projet (design #32).
  const issue = stepIssue(step, project, today)
  const closed = issue !== null
  // Une étape close s'efface ; sur un projet Raté ou Abandonné, toutes
  // s'effacent ; sur un projet Réussi, aucune.
  const faded =
    projectIssue === 'achieved' ? false : closed || projectIssue != null
  const bars = stepProgressLines(step, project)
  const pace =
    !closed && !projectIssue && bars[0]
      ? pacing(
          {
            target: bars[0].max,
            progress: bars[0].value,
            start_at: step.start_at,
            due_at: step.due_at,
          },
          today,
        )
      : null
  // Pas encore démarrée : aucun rythme à juger, la pastille reste neutre.
  const idle = !closed && !projectIssue && !pace && !current

  return (
    <div
      className={cn(
        'flex min-w-0 gap-3.5 transition-opacity',
        faded && 'opacity-45 hover:opacity-100',
      )}
    >
      <Gutter>
        <span
          className={cn(
            'relative z-[1] mt-[7px] grid size-7 shrink-0 place-items-center rounded-full text-xs tabular-nums',
            // Close : un rond en pointillés, vert si réussie, rouge si ratée.
            issue
              ? cn(
                  'border-[1.5px] border-dashed bg-card',
                  issue === 'achieved'
                    ? 'border-emerald-600 text-emerald-600'
                    : 'border-rose-600 text-rose-600',
                )
              : current
                ? cn(
                    'border-[1.5px] border-transparent font-semibold text-white',
                    color.ink,
                  )
                : 'border bg-muted/40 font-medium text-muted-foreground',
          )}
        >
          {issue === 'achieved' ? (
            <Check className="size-3.5" strokeWidth={3} />
          ) : issue === 'failed' ? (
            <X className="size-[13px]" strokeWidth={3} />
          ) : (
            step.order
          )}
        </span>
      </Gutter>

      <div className="min-w-0 flex-1 pb-[18px]">
        <div className="overflow-hidden rounded-[10px] border bg-card shadow-xs">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="flex w-full min-w-0 items-baseline gap-2.5 py-[11px] pr-3.5 pl-[11px] text-left hover:bg-muted/50"
          >
            <ChevronRight
              strokeWidth={2.5}
              className={cn(
                'size-3.5 shrink-0 self-center text-muted-foreground transition-transform',
                expanded && 'rotate-90',
              )}
            />
            <span
              className={cn(
                'min-w-0 truncate font-heading text-[15px] font-semibold',
                !current && 'text-foreground/75',
              )}
            >
              {step.title}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {periodOf(step)}
            </span>
            {pace && pace !== 'done' && pace !== 'failed' ? (
              <PaceDot
                project={project}
                scope={{ kind: 'step', step }}
                pace={pace}
                today={today}
                ink={ink}
                className="self-center"
              />
            ) : (
              pace && (
                <span
                  title={PACING_META[pace].label}
                  className={cn(
                    'size-2 shrink-0 self-center rounded-full',
                    PACING_META[pace].dot,
                  )}
                />
              )
            )}
            {idle && (
              <span
                title="Pas commencée"
                className="size-2 shrink-0 self-center rounded-full bg-muted-foreground/40"
              />
            )}
          </button>

          {expanded && (
            <div className="grid gap-2.5 border-t border-border/70 px-3.5 py-2">
              {step.description && (
                <p className="border-b pb-3 text-xs leading-normal text-pretty text-foreground/75">
                  {step.description}
                </p>
              )}
              <StepObjectives
                project={project}
                step={step}
                skills={skills}
                results={results}
                activityTypes={activityTypes}
                color={color}
              />
              {skills.length > 0 && (
                <div
                  className={cn(
                    'grid',
                    hasObjectives(project, step)
                      ? '-mx-3.5 border-t border-border/70 px-2 pt-1.5'
                      : '-mx-1.5',
                  )}
                >
                  {skills.map((s) => (
                    <SkillRow
                      key={s.skill_id}
                      skill={s}
                      emoji={emoji}
                      color={color}
                      projectId={project.id}
                      onOpen={onOpenSkill}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Le rail vertical du fil, et ce qu'il porte. */
export function Gutter({
  children,
  line = 'top-0 bottom-0',
}: {
  children: React.ReactNode
  line?: string
}) {
  return (
    <div className="relative flex w-[26px] shrink-0 justify-center">
      <span
        aria-hidden
        className={cn(
          'absolute left-1/2 w-px -translate-x-1/2 bg-border',
          line,
        )}
      />
      {children}
    </div>
  )
}

function hasObjectives(project: Project, step: ProjectStep) {
  return (
    step.totals.length > 0 ||
    step.metrics.some((m) => m.target !== null) ||
    project.achievements.some((a) => a.step_id === step.id)
  )
}

/** Les objectifs d'une étape — même vocabulaire que ceux du projet. */
function StepObjectives({
  project,
  step,
  skills,
  results,
  activityTypes,
  color,
}: {
  project: Project
  step: ProjectStep
  skills: PlanSkill[]
  results: ProjectMetric[]
  activityTypes: ActivityType[]
  color: DomainColorClasses
}) {
  const update = useUpdateAchievement()
  const totals = [...step.totals].sort((a, b) => {
    const pa = project.totals.find((t) => t.id === a.total_id)?.position ?? 0
    const pb = project.totals.find((t) => t.id === b.total_id)?.position ?? 0
    return pa - pb
  })
  const acquired = skills.filter((s) => s.level >= 4).length

  return (
    <div className="grid">
      {totals.map((share) => {
        const total = project.totals.find((t) => t.id === share.total_id)
        if (!total) return null
        // Un Total n'a pas de nom propre : seules les activités types qu'il compte
        // s'écrivent.
        const counted = activityTypes.filter((h) =>
          total.activity_type_ids.includes(h.id),
        )
        const label =
          counted.length > 0
            ? counted
                .map((h) => `${h.emoji ? `${h.emoji} ` : ''}${h.title}`)
                .join(', ')
            : undefined
        const unit = totalUnit(total)
        return (
          <Row
            key={share.total_id}
            axis="Total"
            done={share.is_met}
            color={color}
            label={label}
            pct={share.target > 0 ? (share.progress / share.target) * 100 : 0}
            part={fmt(share.progress)}
            total={`/ ${fmt(share.target)} ${unitLabel(unit, share.target)}`.trimEnd()}
          />
        )
      })}
      {step.metrics
        .filter((m) => m.target !== null)
        .map((m) => {
          const link = results.find((r) => r.metric_id === m.metric_id)
          if (!link) return null
          const { metric } = link
          const palier = m.target as number
          const dep = link.start?.value ?? null
          const rec = link.best_in_period?.value ?? null
          const down = metric.direction === 'down'
          // Du départ au palier de l'étape, dans le sens de la métrique.
          const pct =
            rec === null || dep === null || dep === palier
              ? 0
              : Math.max(
                  0,
                  Math.min(
                    100,
                    ((down ? dep - rec : rec - dep) /
                      (down ? dep - palier : palier - dep)) *
                      100,
                  ),
                )
          return (
            <Row
              key={m.metric_id}
              axis="Résultat"
              done={m.is_met}
              color={color}
              label={`${metric.emoji ? `${metric.emoji} ` : ''}${metric.name}`}
              pct={pct}
              part={formatValue(palier, metric.unit)}
              total={unitLabel(metric.unit, palier)}
            />
          )
        })}
      {project.achievements
        .filter((a) => a.step_id === step.id)
        .map((a) => (
          <Row
            key={a.id}
            axis="Réalisation"
            done={a.done}
            color={color}
            label={`${a.emoji ? `${a.emoji} ` : ''}${a.title}`}
            onToggle={() =>
              update
                .mutateAsync({ id: a.id, body: { done: !a.done } })
                .catch(() => toast.error("L'enregistrement a échoué"))
            }
          />
        ))}
      {skills.length > 0 && (
        <Row
          axis="Apprentissage"
          done={acquired === skills.length}
          color={color}
          mosaic={<Mosaic skills={skills} color={color} />}
          part={String(acquired)}
          total={`/ ${skills.length} savoir${skills.length > 1 ? 's' : ''}`}
        />
      )}
    </div>
  )
}

function Row({
  axis,
  done,
  color,
  label,
  pct,
  mosaic,
  part,
  total,
  onToggle,
}: {
  axis: string
  done: boolean
  color: DomainColorClasses
  label?: string
  pct?: number
  mosaic?: React.ReactNode
  part?: string
  total?: string
  onToggle?: () => void
}) {
  return (
    <div className="flex min-h-7 min-w-0 items-center gap-2.5 py-1">
      <ObjectiveCheck
        done={done}
        inkClassName={color.ink}
        hoverClassName={color.softHover}
        onToggle={onToggle}
        label={
          onToggle ? (done ? 'Décocher' : 'Cocher : c’est fait') : undefined
        }
      />
      <span className="w-24 shrink-0 text-[10px] font-semibold tracking-[.05em] text-muted-foreground uppercase">
        {axis}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
        {label && <span className="min-w-0 truncate text-xs">{label}</span>}
        {mosaic}
        {pct !== undefined && (
          <span className="flex h-[5px] min-w-10 overflow-hidden rounded-full bg-muted">
            <span className={color.dot} style={{ width: `${pct}%` }} />
          </span>
        )}
      </div>
      {part !== undefined && (
        <span className="flex min-w-24 shrink-0 items-baseline justify-end gap-[5px] whitespace-nowrap tabular-nums">
          <span className="font-heading text-sm leading-none font-semibold">
            {part}
          </span>
          <span className="text-[13px] leading-none text-muted-foreground">
            {total}
          </span>
        </span>
      )}
    </div>
  )
}
