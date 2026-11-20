import { CircleCheck, Flag, GripVertical, Plus, Trash, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { DomainColorClasses } from '@/entities/domain'
import type { ActivityType } from '@/entities/activity-type'
import type { ProjectMetric } from '@/entities/metric'
import {
  currentStep,
  type Project,
  type ProjectStep,
  periodEffects,
  placeEffects,
  stepIssue,
  suggestedDates,
  totalUnit,
  useCreateStep,
  useDeleteStep,
  useReorderSteps,
  useUpdateProject,
  useUpdateStep,
} from '@/entities/project'
import { ApiError } from '@/shared/api'
import { toDateISO } from '@/shared/lib/date'
import { formatValue, unitLabel } from '@/shared/lib/units'
import { cn } from '@/shared/lib/utils'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  PeriodPicker,
  shortDay,
  toast,
} from '@/shared/ui'

import { periodOf } from './plan-step'
import { StepActivityTypesEdit } from './step-activity-types-edit'
import { StepObjectivesEdit } from './step-objectives-edit'

const fail = (err: unknown) =>
  toast.error(
    err instanceof ApiError ? err.message : "L'enregistrement a échoué",
  )

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')

const addDay = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number)
  return toDateISO(new Date(y, m - 1, d + n))
}

/**
 * Le plan en édition, vue Étapes (design #27) : le fil conservé, une carte
 * par étape avec des champs libellés, et les deux bornes du projet en
 * cartes fixes dont seule la date s'édite. Aucune date n'est bloquée par une
 * étape : l'avertissement dit ce que deviennent les autres.
 */
export function PlanStepsEdit({
  project,
  results,
  activityTypes,
  color,
  onBlankTitleChange,
}: {
  project: Project
  results: ProjectMetric[]
  activityTypes: ActivityType[]
  color: DomainColorClasses
  /** Une étape a son titre vidé (design #33 : la création ne se poursuit pas). */
  onBlankTitleChange?: (blank: boolean) => void
}) {
  const reorder = useReorderSteps()
  // Les étapes dont le champ titre est vide, le temps de la saisie.
  const [blank, setBlank] = useState<ReadonlySet<string>>(new Set())
  const markBlank = useCallback((id: string, on: boolean) => {
    setBlank((prev) => {
      if (prev.has(id) === on) return prev
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])
  const anyBlank = blank.size > 0
  useEffect(() => {
    onBlankTitleChange?.(anyBlank)
  }, [anyBlank, onBlankTitleChange])
  useEffect(() => () => onBlankTitleChange?.(false), [onBlankTitleChange])
  const create = useCreateStep()
  // L'ordre posé au lâcher tient l'écran jusqu'au retour du serveur.
  const [pending, setPending] = useState<string[] | null>(null)
  useEffect(() => setPending(null), [project.steps])
  const steps = [...project.steps].sort((a, b) =>
    pending ? pending.indexOf(a.id) - pending.indexOf(b.id) : a.order - b.order,
  )
  const today = toDateISO(new Date())
  const current = currentStep(project, today)

  // Glisser une étape (maquette « toutes les cartes repliées ») : les cartes
  // se replient sur leur en-tête, la saisie flotte sous le pointeur, son
  // emplacement reste en creux, une ligne à l'encre marque où elle tombera.
  const [drag, setDrag] = useState<{
    id: string
    y: number
    /** Le glisser ne démarre qu'après quelques pixels : un clic reste un clic. */
    from: number
    active: boolean
    left: number
    width: number
    index: number
  } | null>(null)
  const rows = useRef(new Map<string, HTMLDivElement>())
  const dragId = drag?.id ?? null

  useEffect(() => {
    if (!dragId) return
    const others = steps.filter((s) => s.id !== dragId)
    const from = steps.findIndex((s) => s.id === dragId)
    // Le rang d'arrivée parmi les autres : celles dont le milieu est au-dessus.
    const indexAt = (y: number) =>
      others.filter((s) => {
        const r = rows.current.get(s.id)?.getBoundingClientRect()
        return r ? r.top + r.height / 2 < y : false
      }).length
    const startY = drag!.from
    let active = false
    const move = (e: PointerEvent) => {
      if (!active && Math.abs(e.clientY - startY) <= 5) return
      active = true
      setDrag(
        (d) => d && { ...d, active, y: e.clientY, index: indexAt(e.clientY) },
      )
    }
    const stop = () => setDrag(null)
    const drop = (e: PointerEvent) => {
      setDrag(null)
      if (!active) return
      const to = indexAt(e.clientY)
      if (to === from) return
      const ids = others.map((s) => s.id)
      ids.splice(to, 0, dragId)
      setPending(ids)
      reorder
        .mutateAsync({ projectId: project.id, stepIds: ids })
        .catch((err) => {
          setPending(null)
          fail(err)
        })
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && stop()
    const cursor = document.body.style.cursor
    document.body.style.cursor = 'grabbing'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', drop)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('keydown', key)
    return () => {
      document.body.style.cursor = cursor
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', drop)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('keydown', key)
    }
    // Un glisser se câble une fois, à sa prise ; l'ordre ne bouge pas pendant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId])

  function grab(step: ProjectStep, e: React.PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    const card = rows.current
      .get(step.id)
      ?.querySelector<HTMLElement>('[data-card]')
      ?.getBoundingClientRect()
    if (!card) return
    setDrag({
      id: step.id,
      y: e.clientY,
      from: e.clientY,
      active: false,
      left: card.left,
      width: card.width,
      index: steps.findIndex((s) => s.id === step.id),
    })
  }

  const from = drag ? steps.findIndex((s) => s.id === drag.id) : -1
  const others = steps.filter((s) => s.id !== drag?.id)
  // La ligne se pose avant l'étape qui suivra la carte lâchée ; aucune si
  // la carte retombe à sa place.
  const lineBefore =
    drag?.active && drag.index !== from
      ? (others[drag.index]?.id ?? 'end')
      : null
  const dragged = drag ? steps.find((s) => s.id === drag.id) : undefined

  const taken = steps.flatMap((s) =>
    s.start_at && s.due_at
      ? [{ start: s.start_at, end: s.due_at, label: s.title }]
      : [],
  )

  return (
    <div className="flex flex-col">
      <BoundEdit project={project} which="start" taken={taken} />
      {steps.map((step) => (
        <div
          key={step.id}
          ref={(el) => {
            if (el) rows.current.set(step.id, el)
            else rows.current.delete(step.id)
          }}
        >
          {lineBefore === step.id && <DropLine color={color} />}
          <StepEdit
            project={project}
            step={step}
            results={results}
            activityTypes={activityTypes}
            color={color}
            current={current?.id === step.id}
            folded={Boolean(drag?.active)}
            hollow={Boolean(drag?.active) && drag?.id === step.id}
            onGrab={(e) => grab(step, e)}
            onBlankChange={markBlank}
          />
        </div>
      ))}

      {lineBefore === 'end' && <DropLine color={color} />}
      <div className="flex min-w-0 gap-3.5 pb-3">
        <div className="relative flex w-7 shrink-0 justify-center">
          <span className="absolute top-0 -bottom-3 left-1/2 w-px -translate-x-1/2 bg-border" />
          <span className="relative mt-px grid size-7 place-items-center rounded-full border border-dashed bg-muted/40 text-muted-foreground">
            <Plus className="size-[13px]" strokeWidth={2.5} />
          </span>
        </div>
        <div className="flex h-7 min-w-0 flex-1 items-center pt-px">
          <button
            type="button"
            onClick={() =>
              create
                .mutateAsync({
                  projectId: project.id,
                  body: { title: `Étape ${steps.length + 1}` },
                })
                .catch(fail)
            }
            className="h-7 rounded-md px-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Ajouter une étape
          </button>
        </div>
      </div>

      <BoundEdit project={project} which="due" taken={taken} />

      {drag?.active &&
        dragged &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50"
            style={{ top: drag.y - 20, left: drag.left, width: drag.width }}
          >
            <FoldedCard
              step={dragged}
              className="-rotate-[1.2deg] cursor-grabbing shadow-[0_12px_28px_-8px_color-mix(in_oklab,var(--color-foreground)_35%,transparent)]"
            />
          </div>,
          document.body,
        )}
    </div>
  )
}

/** Où la carte glissée tombera : un trait à l'encre, son point dans le fil. */
function DropLine({ color }: { color: DomainColorClasses }) {
  return (
    <div className="relative h-0">
      <div className="absolute inset-x-0 -top-1.5 z-[2] flex -translate-y-1/2 items-center gap-3.5">
        <span className="flex w-7 shrink-0 justify-center">
          <span className={cn('size-[7px] rounded-full', color.ink)} />
        </span>
        <span className={cn('h-0.5 flex-1 rounded-full', color.ink)} />
      </div>
    </div>
  )
}

/** Une carte d'étape repliée sur son en-tête : poignée, titre, période. */
function FoldedCard({
  step,
  className,
}: {
  step: ProjectStep
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex h-10 min-w-0 items-center gap-2.5 rounded-[10px] border bg-card px-3.5 text-sm font-semibold',
        className,
      )}
    >
      <GripVertical className="size-3 shrink-0 text-muted-foreground opacity-45" />
      <span className="min-w-0 truncate">{step.title}</span>
      {(step.start_at || step.due_at) && (
        <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
          {periodOf(step)}
        </span>
      )}
    </div>
  )
}

/** Une borne du projet en édition : une carte fixe, sa date seule s'édite. */
function BoundEdit({
  project,
  which,
  taken,
}: {
  project: Project
  which: 'start' | 'due'
  taken: { start: string; end: string; label: string }[]
}) {
  const update = useUpdateProject()
  const isStart = which === 'start'
  const value = isStart ? project.start_at : project.due_at
  const other = isStart ? project.due_at : project.start_at
  // Seul blocage : un début après la fin.
  const blocked = other
    ? [
        isStart
          ? {
              start: addDay(other, 1),
              end: '2100-01-01',
              label: 'Après la fin',
              blocked: true,
            }
          : {
              start: '2000-01-01',
              end: addDay(other, -1),
              label: 'Avant le début',
              blocked: true,
            },
      ]
    : []

  return (
    <div className="flex min-w-0 gap-3.5">
      <div className="relative flex w-7 shrink-0 justify-center">
        <span
          className={cn(
            'absolute left-1/2 w-px -translate-x-1/2 bg-border',
            isStart ? 'top-[27px] bottom-0' : 'top-0 h-[27px]',
          )}
        />
        <span className="relative mt-[13px] grid size-7 place-items-center rounded-full border bg-card">
          {isStart ? (
            <span className="size-2 rounded-full bg-muted-foreground/50" />
          ) : (
            <Flag className="size-[13px] text-muted-foreground" />
          )}
        </span>
      </div>
      <div className={cn('min-w-0 flex-1', isStart && 'pb-3')}>
        <div className="flex items-center gap-2 rounded-[10px] border bg-card p-3.5 shadow-xs">
          <h4 className="min-w-0 flex-1 font-heading text-sm leading-[34px] font-semibold">
            {isStart ? 'Début' : 'Fin'}
          </h4>
          <PeriodPicker
            mode="single"
            variant="compact"
            align="end"
            aria-label={isStart ? 'Début du projet' : 'Fin du projet'}
            // Sans fin prévue (#196) : on en ajoute une, sans dire qu'il n'y
            // en a pas.
            placeholder={
              isStart
                ? 'Date de début'
                : project.due_at
                  ? 'Date de fin'
                  : 'Ajouter une fin'
            }
            start={value}
            onChange={(x) =>
              update
                .mutateAsync({
                  id: project.id,
                  body: isStart ? { start_at: x } : { due_at: x },
                })
                .catch(fail)
            }
            taken={[...blocked, ...taken]}
            effects={(x) =>
              periodEffects(
                project,
                isStart ? x : project.start_at,
                isStart ? project.due_at : x,
                shortDay,
              )
            }
          />
        </div>
      </div>
    </div>
  )
}

function StepEdit({
  project,
  step,
  results,
  activityTypes,
  color,
  current,
  folded,
  hollow,
  onGrab,
  onBlankChange,
}: {
  project: Project
  step: ProjectStep
  results: ProjectMetric[]
  activityTypes: ActivityType[]
  color: DomainColorClasses
  current: boolean
  /** Un glisser est en cours : la carte se replie sur son en-tête. */
  folded: boolean
  /** C'est elle qu'on glisse : il ne reste que son creux. */
  hollow: boolean
  onGrab: (e: React.PointerEvent) => void
  onBlankChange: (id: string, blank: boolean) => void
}) {
  const update = useUpdateStep()
  const remove = useDeleteStep()
  const [title, setTitle] = useState(step.title)
  const isBlank = !title.trim()
  useEffect(
    () => onBlankChange(step.id, isBlank),
    [step.id, isBlank, onBlankChange],
  )
  useEffect(() => () => onBlankChange(step.id, false), [step.id, onBlankChange])
  const [description, setDescription] = useState(step.description ?? '')
  const [confirming, setConfirming] = useState(false)
  const issue = stepIssue(step, project, toDateISO(new Date()))
  const suggestion = suggestedDates(project, step.id)
  const others = project.steps.filter((s) => s.id !== step.id)
  const carried = carriedBy(project, step, results)

  function save(body: Parameters<typeof update.mutateAsync>[0]['body']) {
    update.mutateAsync({ stepId: step.id, body }).catch(fail)
  }

  async function onDelete() {
    try {
      await remove.mutateAsync({ stepId: step.id })
      setConfirming(false)
    } catch (err) {
      fail(err)
    }
  }

  if (folded)
    return (
      <div className="flex min-w-0 gap-3.5">
        <div className="relative flex w-7 shrink-0 justify-center">
          <span className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-border" />
          {!hollow && (
            <StepMark
              step={step}
              issue={issue}
              current={current}
              color={color}
              className="mt-1.5"
            />
          )}
        </div>
        <div data-card className="min-w-0 flex-1 pb-3">
          {hollow ? (
            <div className="h-10 rounded-[10px] border border-dashed bg-muted/50" />
          ) : (
            <FoldedCard step={step} />
          )}
        </div>
      </div>
    )

  return (
    <div className="group/step flex min-w-0 gap-3.5">
      <div className="relative flex w-7 shrink-0 justify-center">
        <span className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-border" />
        <StepMark
          step={step}
          issue={issue}
          current={current}
          color={color}
          className="mt-[13px]"
        />
      </div>
      <div data-card className="min-w-0 flex-1 pb-3">
        <div className="flex flex-col gap-5 rounded-[10px] border bg-card p-3.5 shadow-xs">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button
              type="button"
              aria-label="Déplacer l'étape"
              onPointerDown={onGrab}
              className="shrink-0 cursor-grab touch-none text-muted-foreground opacity-45"
            >
              <GripVertical className="size-3" />
            </button>
            <input
              value={title}
              aria-label="Titre de l'étape"
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                const t = title.trim()
                if (!t) return setTitle(step.title)
                if (t !== step.title) save({ title: t })
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              className="h-[34px] min-w-[180px] flex-[1_1_200px] rounded-md border bg-card px-2.5 font-heading text-sm font-semibold outline-none focus:border-ring"
            />
            <PeriodPicker
              variant="compact"
              align="end"
              aria-label="Période de l'étape"
              placeholder="Période"
              start={step.start_at}
              end={step.due_at}
              onChange={(s, e) => save({ start_at: s, due_at: e })}
              period={{ start: project.start_at, end: project.due_at }}
              suggestStart={suggestion.start}
              suggestEnd={suggestion.end}
              taken={others.flatMap((s) =>
                s.start_at && s.due_at
                  ? [{ start: s.start_at, end: s.due_at, label: s.title }]
                  : [],
              )}
              effects={(s, e) => placeEffects(project, step.id, s, e, shortDay)}
            />
            <button
              type="button"
              aria-label="Supprimer l'étape"
              onClick={() =>
                carried.length > 0 ? setConfirming(true) : void onDelete()
              }
              className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/step:opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100"
            >
              <Trash className="size-3.5" />
            </button>
          </div>

          <label className="flex flex-col gap-2.5">
            <span className="grid gap-0.5">
              <span className="font-heading text-sm font-semibold">
                Description
              </span>
              <span className="text-xs text-pretty text-muted-foreground">
                Ce que recouvre cette étape.
              </span>
            </span>
            <textarea
              rows={1}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => {
                const d = description.trim() || null
                if (d !== (step.description ?? null)) save({ description: d })
              }}
              // La maquette part d'une ligne ; le champ grandit avec le texte,
              // sinon une description longue s'y lit par une fente.
              className="w-full resize-y rounded-md border bg-card px-2.5 py-2 text-[13px] leading-[1.45] outline-none [field-sizing:content] focus:border-ring"
            />
          </label>

          <StepObjectivesEdit
            project={project}
            step={step}
            results={results}
            activityTypes={activityTypes}
            color={color}
          />

          <StepActivityTypesEdit project={project} step={step} color={color} />
        </div>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        {/* Ce que l'étape porte, sans destination : ce qui n'est plus
            distribué redevient disponible sur le projet. */}
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Supprimer « {step.title} » ?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col">
            {carried.map((l, i) => (
              <div
                key={i}
                className="flex min-h-[34px] items-center gap-2.5 border-t border-border/70 py-1"
              >
                <span className="w-24 shrink-0 text-[10px] font-semibold tracking-[.05em] text-muted-foreground uppercase">
                  {l.axis}
                </span>
                <span className="flex min-w-0 flex-1 items-baseline gap-[5px] tabular-nums">
                  {l.n && (
                    <span className="font-heading text-sm leading-none font-semibold">
                      {l.n}
                    </span>
                  )}
                  <span className="text-[13px] leading-[1.3] text-pretty text-muted-foreground">
                    {l.unit}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Annuler
            </Button>
            <Button
              variant="ghost"
              isPending={remove.isPending}
              className="bg-destructive/10 text-destructive hover:bg-destructive/15"
              onClick={() => void onDelete()}
            >
              Supprimer l'étape
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Le marqueur d'une étape en édition, au style de la lecture : disque plein à
 * l'encre pour l'étape en cours, contour à l'encre pour une étape ratée,
 * cercle coché pour une étape atteinte.
 */
function StepMark({
  step,
  issue,
  current,
  color,
  className,
}: {
  step: ProjectStep
  issue: ReturnType<typeof stepIssue>
  current: boolean
  color: DomainColorClasses
  className?: string
}) {
  return (
    <span
      title={issue === 'achieved' ? 'Réussie' : `Étape ${step.order}`}
      className={cn(
        'relative grid size-7 shrink-0 place-items-center rounded-full bg-background',
        className,
      )}
    >
      {issue === 'achieved' ? (
        <CircleCheck className={cn('size-6', color.text)} />
      ) : issue === 'failed' ? (
        <span
          className={cn(
            'grid size-7 place-items-center rounded-full border-[1.5px] border-current bg-card',
            color.text,
          )}
        >
          <X className="size-[13px]" strokeWidth={3} />
        </span>
      ) : (
        <span
          className={cn(
            'grid size-7 place-items-center rounded-full border text-[13px] font-semibold tabular-nums',
            current
              ? cn('text-white', color.ink)
              : 'bg-muted text-muted-foreground',
          )}
        >
          {step.order}
        </span>
      )}
    </span>
  )
}

/** Ce que porte une étape, une ligne par objectif : l'axe, puis la quantité. */
function carriedBy(
  project: Project,
  step: ProjectStep,
  results: ProjectMetric[],
): { axis: string; n: string; unit: string }[] {
  const position = (id: string) =>
    project.totals.find((t) => t.id === id)?.position ?? 0
  return [
    ...[...step.totals]
      .sort((a, b) => position(a.total_id) - position(b.total_id))
      .flatMap((share) => {
        const total = project.totals.find((t) => t.id === share.total_id)
        return total
          ? [
              {
                axis: 'Total',
                n: fmt(share.target),
                unit: unitLabel(totalUnit(total), share.target),
              },
            ]
          : []
      }),
    ...step.metrics.flatMap((m) => {
      const metric = results.find((r) => r.metric_id === m.metric_id)?.metric
      return metric && m.target !== null
        ? [
            {
              axis: 'Résultat',
              n: formatValue(m.target, metric.unit),
              unit: unitLabel(metric.unit, m.target),
            },
          ]
        : []
    }),
    ...project.achievements
      .filter((a) => a.step_id === step.id)
      .map((a) => ({
        axis: 'Réalisation',
        n: '',
        unit: `${a.emoji ? `${a.emoji} ` : ''}${a.title}`,
      })),
    ...(step.skill_ids.length > 0
      ? [
          {
            axis: 'Apprentissage',
            n: String(step.skill_ids.length),
            unit: step.skill_ids.length > 1 ? 'savoirs' : 'savoir',
          },
        ]
      : []),
  ]
}
