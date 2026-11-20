import { AlertTriangle, Check, ChevronDown, Trash2 } from 'lucide-react'
import { useState } from 'react'

import type { ActivityType as FullActivityType } from '@/entities/activity-type'

/** Ce que le Total lit d'une activité type : de quoi la nommer. */
type ActivityType = Pick<FullActivityType, 'id' | 'title' | 'emoji'>
import {
  ObjectiveCheck,
  BUILTIN_UNIT_ICONS,
  ObjectiveFrame,
  ObjectiveLabel,
  type Project,
  PaceDot,
  totalPacing,
  type Total,
  totalMark,
  totalUnit,
  UnitMarkGlyph,
  useCreateTotal,
  useDeleteTotal,
  useUpdateTotal,
} from '@/entities/project'
import { UnitField, useUnits } from '@/entities/unit'
import { ApiError } from '@/shared/api'
import { toDateISO } from '@/shared/lib/date'
import { unitLabel } from '@/shared/lib/units'
import { cn } from '@/shared/lib/utils'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
  toast,
} from '@/shared/ui'

import { CountWordMenu } from './count-word-menu'

/**
 * Heures et Fois ne sont pas des unités du catalogue : épinglées en tête du
 * menu (design #27), elles font le mode — Heures se lit au calendrier, Fois se
 * compte. Toute autre unité se déclare sur les activités.
 */
const HOURS = '__hours'
const TIMES = '__times'
const PINNED = [
  { id: HOURS, label: 'Heures', icon: <BUILTIN_UNIT_ICONS.hours /> },
  { id: TIMES, label: 'Fois', icon: <BUILTIN_UNIT_ICONS.times /> },
]

type Choice = Pick<Total, 'mode'> & { unit_id: string | null }

function choiceOf(id: string): Choice {
  if (id === HOURS) return { mode: 'duration', unit_id: null }
  if (id === TIMES) return { mode: 'count', unit_id: null }
  return { mode: 'value', unit_id: id }
}

function unitIdOf(total: Pick<Total, 'mode' | 'unit'>): string | null {
  if (total.mode === 'duration') return HOURS
  if (total.mode === 'count') return TIMES
  return total.unit?.id ?? null
}

/** Ce que le Total compte et dans quelle unité : sa signature de doublon. */
export function totalSignature(total: Total): string {
  const scope = [...total.activity_type_ids].sort().join(',')
  return `${unitIdOf(total)}|${scope}|${total.learning_sessions}`
}

/** Ce que compte un Total : des activités types et/ou les séances
 *  d'apprentissage ; ni l'un ni l'autre = toutes les activités. */
interface Scope {
  typeIds: string[]
  learning: boolean
}

const LEARNING = "Séances d'apprentissage"

const fr = (n: number) =>
  n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })

/** « 🏃 Run et Séances d'apprentissage » — la liste qui suit « sur ». Vide
 *  quand le Total compte toutes les activités. */
function scopeLabel(scope: Scope, activityTypes: ActivityType[]): string {
  const names = scope.typeIds.map((id) => {
    const t = activityTypes.find((x) => x.id === id)
    return t ? `${t.emoji ? `${t.emoji} ` : ''}${t.title}` : 'activité type'
  })
  if (scope.learning) names.push(LEARNING)
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} et ${names.at(-1)}`
}

const scopeOf = (total: Total): Scope => ({
  typeIds: total.activity_type_ids,
  learning: total.learning_sessions,
})

/** Ce qui suit la cible : « km sur 🏃 Run ». */
function sentenceTail(total: Total, activityTypes: ActivityType[]): string {
  const unit = unitLabel(totalUnit(total), total.target)
  const scope = scopeLabel(scopeOf(total), activityTypes)
  return [unit, scope && `sur ${scope}`].filter(Boolean).join(' ')
}

/** La phrase du Total, telle qu'elle se lit : « 300 km sur 🏃 Run ». */
export function totalSentence(
  total: Total,
  activityTypes: ActivityType[],
): string {
  const unit = totalUnit(total)
  const base = `${fr(total.target)} ${unitLabel(unit, total.target)}`.trimEnd()
  const scope = scopeLabel(scopeOf(total), activityTypes)
  return scope ? `${base} sur ${scope}` : base
}

/** Un Total en **lecture** : la part, la phrase, la jauge. */
export function TotalCardRead({
  total,
  activityTypes,
  project,
  ink,
  inkClassName,
  barClassName,
  closed = false,
}: {
  total: Total
  activityTypes: ActivityType[]
  /** Le projet : le rythme du Total se lit sur sa période. */
  project: Project
  /** L'encre du domaine (une couleur CSS) : la carte de rythme (#112). */
  ink: string
  /** Projet clos : un Total non tenu porte l'anneau rouge à croix. */
  closed?: boolean
  /** `domainColor(...).ink` — la coche d'un Total atteint. */
  inkClassName: string
  /** `domainColor(...).dot` — le remplissage de la jauge. */
  barClassName: string
}) {
  const pct = Math.min(100, (total.progress / (total.target || 1)) * 100)
  // Le rythme du Total (fait / attendu à date), en point après « Total »
  // (design #40) ; rien une fois atteint, ni le projet clos. Avant le début,
  // un point gris « Pas commencé ». Sans fin prévue (#196) : aucun point.
  const today = toDateISO(new Date())
  const pace =
    closed || !project.due_at
      ? null
      : today < project.start_at && total.progress < total.target
        ? 'notStarted'
        : totalPacing(total, project, today)
  const rhythm =
    pace && pace !== 'notStarted' && pace !== 'done' && pace !== 'failed'
      ? pace
      : null
  return (
    <ObjectiveFrame>
      <div className="flex items-center gap-[9px]">
        <ObjectiveCheck
          done={total.is_met}
          failed={closed}
          inkClassName={inkClassName}
        />
        <ObjectiveLabel>Total</ObjectiveLabel>
        {pace === 'notStarted' && (
          <span
            title="Pas commencé"
            aria-label="Pas commencé"
            className="size-[7px] shrink-0 rounded-full bg-muted-foreground/40"
          />
        )}
        {rhythm && (
          <PaceDot
            project={project}
            scope={{ kind: 'total', total }}
            pace={rhythm}
            today={today}
            ink={ink}
            dotClassName="size-[7px]"
          />
        )}
        <span className="ml-auto flex items-baseline gap-[5px] tabular-nums">
          <span className="font-heading text-sm leading-none font-semibold">
            {fr(total.progress)}
          </span>
          <span className="text-[13px] text-muted-foreground">
            / {fr(total.target)}
          </span>
        </span>
      </div>
      {/* La marque de l'unité devant son nom, comme en édition. */}
      <p className="flex min-w-0 items-center gap-[5px] text-[13px]">
        <span className="truncate">
          {fr(total.target)}{' '}
          <UnitMarkGlyph
            mark={totalMark(total)}
            className="inline-flex align-[-1px] text-[12px]"
          />{' '}
          {sentenceTail(total, activityTypes)}
        </span>
      </p>
      <div className="mt-auto h-[34px]">
        <div className="mt-[7px] h-[5px] overflow-hidden rounded-full bg-muted">
          <div
            // Coupé net à droite : seule la piste est arrondie.
            className={cn('h-full', barClassName)}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </ObjectiveFrame>
  )
}

/**
 * Un Total en **édition** : la phrase à trous, chaque morceau s'édite sur
 * place — « [cible] [unité ▾] sur [activités ▾] » (design #27, variante 3b).
 *
 * Sans `total`, c'est une carte **neuve** : rien n'est écrit tant que la cible
 * et l'unité ne sont pas toutes deux posées.
 */
export function TotalCardEdit({
  project,
  total,
  activityTypes,
  duplicateOf,
  onDiscard,
}: {
  project: Project
  total?: Total
  activityTypes: ActivityType[]
  /** La phrase d'un autre Total qui compte exactement la même chose. */
  duplicateOf?: string
  /** Carte neuve abandonnée, ou créée : l'appelant la retire de ses brouillons. */
  onDiscard?: () => void
}) {
  const create = useCreateTotal()
  const update = useUpdateTotal()
  const remove = useDeleteTotal()
  const { data: units } = useUnits()

  const [target, setTarget] = useState(total ? String(total.target) : '')
  const [unitId, setUnitId] = useState<string | null>(
    total ? unitIdOf(total) : null,
  )
  const [scope, setScope] = useState<Scope>(
    total ? scopeOf(total) : { typeIds: [], learning: false },
  )
  const [confirming, setConfirming] = useState(false)

  const fail = (err: unknown) =>
    toast.error(
      err instanceof ApiError ? err.message : "L'enregistrement a échoué",
    )

  /** Écrit l'état voulu : crée la carte neuve dès qu'elle est complète. */
  async function save(next: {
    target?: string
    unitId?: string | null
    scope?: Scope
  }) {
    const t = Number((next.target ?? target).replace(',', '.'))
    const u = next.unitId !== undefined ? next.unitId : unitId
    const sc = next.scope ?? scope
    if (!u || !(t > 0)) return
    const body = {
      ...choiceOf(u),
      target: t,
      activity_type_ids: sc.typeIds,
      learning_sessions: sc.learning,
    }
    try {
      if (total) await update.mutateAsync({ totalId: total.id, body })
      else {
        await create.mutateAsync({ projectId: project.id, body })
        onDiscard?.()
      }
    } catch (err) {
      fail(err)
    }
  }

  const shares = total
    ? project.steps.flatMap((step) =>
        step.totals
          .filter((share) => share.total_id === total.id)
          .map((share) => ({ step, share })),
      )
    : []

  async function onDelete() {
    if (!total) return onDiscard?.()
    // Réparti dans des étapes : on annonce ce qui part avec lui. Sinon, rien
    // ne se perd — retiré tout de suite (design #27).
    if (shares.length > 0 && !confirming) return setConfirming(true)
    try {
      await remove.mutateAsync({ totalId: total.id })
      setConfirming(false)
    } catch (err) {
      fail(err)
    }
  }

  // La ligne Fois prend le mot et l'emoji du Total, et son kebab pour les
  // régler (#58) — une fois le Total enregistré au nombre.
  const pins = PINNED.map((p) =>
    p.id === TIMES && total?.mode === 'count'
      ? {
          ...p,
          label: total.count_name
            ? total.count_name[0].toUpperCase() + total.count_name.slice(1)
            : p.label,
          icon: total.count_emoji ? <span>{total.count_emoji}</span> : p.icon,
          menu: <CountWordMenu total={total} />,
        }
      : p,
  )
  const pinned = pins.find((p) => p.id === unitId)
  const catalogueUnit = units?.find((u) => u.id === unitId)
  const shownUnit = total ? totalUnit(total) : undefined
  const unitText = pinned
    ? pinned.id === TIMES && shownUnit
      ? shownUnit.effective_plural
      : pinned.label.toLowerCase()
    : (catalogueUnit?.effective_plural ?? shownUnit?.effective_plural)

  const word =
    'inline-flex h-7 items-center gap-1 rounded-md px-1 text-sm font-medium hover:bg-muted'

  return (
    // Une carte neuve n'a pas de survol et garde sa corbeille en vue.
    <ObjectiveFrame
      warn={Boolean(duplicateOf)}
      className={total ? 'hover:border-ring' : undefined}
    >
      <div className="flex items-center gap-[9px]">
        <ObjectiveLabel editing>Total</ObjectiveLabel>
        <button
          type="button"
          onClick={() => void onDelete()}
          aria-label="Retirer cet objectif"
          className={cn(
            'ml-auto grid size-6 place-items-center rounded-md text-red-700 transition-opacity hover:bg-red-50',
            total && 'opacity-0 group-hover/card:opacity-100',
          )}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-sm leading-7">
        <input
          value={target}
          autoFocus={!total}
          inputMode="decimal"
          placeholder="0"
          aria-label="Cible"
          onChange={(e) => setTarget(e.target.value)}
          onBlur={() => void save({ target })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          className="field-sizing-content h-7 min-w-[3ch] border-0 border-b-[1.5px] border-dashed border-ring bg-transparent px-0.5 text-center font-heading font-semibold tabular-nums outline-none focus:border-foreground"
        />
        <UnitField
          value={unitId}
          onChange={(id) => {
            setUnitId(id)
            void save({ unitId: id })
          }}
          pinned={pins}
          // Une durée se lit au calendrier : l'heure n'a rien à faire parmi
          // les unités qu'on déclare.
          exclude={(u) => Boolean(u.seconds_per_unit)}
          trigger={
            <button type="button" className={word}>
              {pinned ? (
                <span className="text-muted-foreground [&>svg]:size-3.5">
                  {pinned.icon}
                </span>
              ) : (
                catalogueUnit?.emoji && <span>{catalogueUnit.emoji}</span>
              )}
              {unitText ?? <span className="text-muted-foreground">unité</span>}
              <ChevronDown
                className="size-3 text-muted-foreground"
                strokeWidth={2.5}
              />
            </button>
          }
        />
        <span className="text-muted-foreground">sur</span>
        <ScopePicker
          activityTypes={activityTypes}
          value={scope}
          className={word}
          onChange={(next) => {
            setScope(next)
            void save({ scope: next })
          }}
        />
      </div>

      {duplicateOf && (
        <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          <AlertTriangle className="mt-px size-[13px] shrink-0 text-amber-600" />
          Compte la même chose que « {duplicateOf} »
        </p>
      )}

      {total && (
        <Dialog open={confirming} onOpenChange={setConfirming}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Supprimer « {totalSentence(total, activityTypes)} » ?
              </DialogTitle>
            </DialogHeader>
            <ul className="grid">
              {shares.map(({ step, share }) => (
                <li
                  key={step.id}
                  className="flex h-[34px] items-center gap-2.5 border-b border-border/70 last:border-0"
                >
                  <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-[.05em] text-muted-foreground">
                    Étape {step.order}
                  </span>
                  <span className="flex min-w-0 flex-1 items-baseline gap-[5px] tabular-nums">
                    <span className="font-heading text-sm leading-none font-semibold">
                      {fr(share.target)}
                    </span>
                    <span className="text-[13px] leading-none text-muted-foreground">
                      {unitLabel(totalUnit(total), share.target)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Annuler
              </Button>
              <Button
                variant="ghost"
                className="bg-destructive/10 text-destructive hover:bg-destructive/15"
                onClick={() => void onDelete()}
              >
                Supprimer l'objectif
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </ObjectiveFrame>
  )
}

/**
 * « sur … » : toutes les activités, ou certaines activités types et/ou les
 * séances d'apprentissage, **cumulées** (#37, §5). Cocher bascule sans fermer ;
 * « Toutes les activités » vide la sélection.
 */
function ScopePicker({
  activityTypes,
  value,
  onChange,
  className,
}: {
  activityTypes: ActivityType[]
  value: Scope
  onChange: (next: Scope) => void
  className: string
}) {
  const [open, setOpen] = useState(false)
  const everything = value.typeIds.length === 0 && !value.learning
  const options = [
    ...activityTypes.map((t) => ({
      key: t.id,
      label: `${t.emoji ? `${t.emoji} ` : ''}${t.title}`,
      on: value.typeIds.includes(t.id),
      toggle: () =>
        onChange({
          ...value,
          typeIds: value.typeIds.includes(t.id)
            ? value.typeIds.filter((id) => id !== t.id)
            : [...value.typeIds, t.id],
        }),
    })),
    {
      key: 'learning',
      label: LEARNING,
      on: value.learning,
      toggle: () => onChange({ ...value, learning: !value.learning }),
    },
  ]
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={className}>
          {everything
            ? 'toutes les activités'
            : scopeLabel(value, activityTypes)}
          <ChevronDown
            className="size-3 text-muted-foreground"
            strokeWidth={2.5}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="min-w-[220px] p-1">
        <button
          type="button"
          onClick={() => {
            onChange({ typeIds: [], learning: false })
            setOpen(false)
          }}
          className="relative flex h-[30px] w-full items-center rounded-md pl-7 pr-2 text-left text-[13px] hover:bg-muted"
        >
          {everything && (
            <Check className="absolute left-2 size-3.5" strokeWidth={2.5} />
          )}
          Toutes les activités
        </button>
        <div className="-mx-1 my-1 h-px bg-border" />
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={o.toggle}
            className="flex h-[30px] w-full items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-muted"
          >
            <span
              className={cn(
                'grid size-3.5 shrink-0 place-items-center rounded-[4px] border',
                o.on
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-ring bg-card',
              )}
            >
              {o.on && <Check className="size-2.5" strokeWidth={3.5} />}
            </span>
            {o.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
