import { Check, Clock, Plus } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { toast } from 'sonner'

import type { DomainColorValues } from '@/entities/domain'
import { type Metric, useProjectMetrics } from '@/entities/metric'
import {
  type Project,
  type ProjectCounter,
  UnitMarkGlyph,
  useProjectCounters,
} from '@/entities/project'
import { useCreateUnit, useUnits } from '@/entities/unit'
import {
  defaultTone,
  formatValue,
  unitBadge,
  type UnitLike,
  unitLabel,
} from '@/shared/lib/units'
import { cn } from '@/shared/lib/utils'

import {
  type CheckGauge,
  type ResultMarks,
  reaches,
  resultMarks,
} from '../model/check-gauges'
import type { CheckDraft } from '../model/use-check-draft'
import { AddMenu } from './measures-section'
import { ValueField } from './value-field'

/**
 * Un **projet lié**, à la coche (#182, `kit/Coche seance`) : sous le filet,
 * son nom, puis ses sections en petites capitales — l'Apprentissage (rendu
 * par l'appelant : ses savoirs), ses Totaux, ses Résultats, ses Réalisations.
 * Une section sans rien à dire n'est pas là.
 *
 * - **Totaux** : une ligne par Total que la séance alimente — la jauge (le
 *   plein, où il en est ; le clair, l'apport de la séance), le chiffre après
 *   la séance, puis l'apport en pastille. Un Total en valeur se saisit au
 *   clic sur sa pastille ; au nombre ou en durée, elle se lit. Puis, **sans
 *   cible**, les compteurs du projet (#194 : ce qu'il compte sans le viser —
 *   ses km, ses heures) : le nom, le chiffre après la séance, l'apport en
 *   pastille (les heures se lisent, une unité se saisit) ; les valeurs de la
 *   séance dans une autre unité ; et « + Unité » pour en déclarer une
 *   (décision de l'utilisateur, 17/11 : sans Total, les km se saisissaient au
 *   panneau seulement).
 * - **Résultats** : nom, « Cible · Record » à droite, puis le champ
 *   pointillé ; à la cible ou au-delà du record, en vert.
 * - **Réalisations** : celles que la séance prépare et celles, non faites,
 *   du projet ; cocher = faite sur le projet.
 */
export function CheckProjectBlock({
  project,
  emoji,
  learning,
  gauges,
  draft,
  metrics,
  colors,
  hours,
}: {
  project: Project
  /** L'emoji du domaine, devant le nom du projet. */
  emoji: string
  /** Les savoirs du projet (`LearningSection`), ou rien. */
  learning: ReactNode
  gauges: CheckGauge[]
  draft: CheckDraft
  /** Les métriques du domaine : l'unité d'un relevé. */
  metrics: Metric[]
  colors: DomainColorValues
  /** La durée de la séance, en heures : son apport au compteur d'heures. */
  hours: number
}) {
  const { data: results } = useProjectMetrics(project.id)
  const { data: counters } = useProjectCounters(project.id)
  const marks = resultMarks(results ?? [])
  const resultMetrics = (results ?? []).map(
    (r) => metrics.find((m) => m.id === r.metric_id) ?? r.metric,
  )
  const linked = draft.achievements.filter((a) => a.project_id === project.id)
  const achievements = [
    ...linked,
    ...project.achievements
      .filter((a) => !a.done && !linked.some((x) => x.id === a.id))
      .map((a) => ({
        id: a.id,
        project_id: project.id,
        title: a.title,
        emoji: a.emoji,
        done: a.done,
      })),
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="h-px bg-border" />
      <span className="truncate text-[13px] font-semibold">
        {emoji ? `${emoji} ` : ''}
        {project.title}
      </span>
      {learning}
      <CheckSection title="Totaux" gap="gap-2">
        {gauges.map((g) => (
          <TotalRow
            key={g.key}
            gauge={g}
            colors={colors}
            onSet={(value) => g.unitId && setValue(draft, g.unitId, value)}
          />
        ))}
        <CountersRows
          counters={counters ?? []}
          gauges={gauges}
          draft={draft}
          colors={colors}
          hours={hours}
        />
      </CheckSection>
      {resultMetrics.length > 0 && (
        <CheckSection title="Résultats" gap="gap-1.5">
          {resultMetrics.map((m) => (
            <ResultRow
              key={m.id}
              metric={m}
              marks={marks.get(m.id)}
              draft={draft}
            />
          ))}
        </CheckSection>
      )}
      {achievements.length > 0 && (
        <CheckSection title="Réalisations" gap="gap-1.5">
          {achievements.map((a) => (
            <button
              key={a.id}
              type="button"
              role="checkbox"
              aria-checked={a.done}
              onClick={() => draft.toggleAchievement(a)}
              className="flex cursor-pointer items-center gap-2.5 text-left text-[13px] font-medium"
            >
              <span className="grid w-[18px] shrink-0 place-items-center">
                <span
                  className={cn(
                    'grid size-4 place-items-center rounded-[4px]',
                    !a.done && 'border-[1.5px] border-muted-foreground/45',
                  )}
                  style={a.done ? { background: colors.ink } : undefined}
                >
                  {a.done && (
                    <Check
                      className="size-[11px] text-white"
                      strokeWidth={3.2}
                    />
                  )}
                </span>
              </span>
              <span className="min-w-0 flex-1 truncate">
                {a.emoji ? `${a.emoji} ` : ''}
                {a.title}
              </span>
            </button>
          ))}
        </CheckSection>
      )}
    </div>
  )
}

/** Une section d'un projet : son titre en petites capitales grises. */
export function CheckSection({
  title,
  gap = 'gap-1',
  children,
}: {
  title: string
  gap?: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex flex-col', gap)}>
      <span className="text-[10px] font-semibold tracking-[.06em] text-muted-foreground uppercase">
        {title}
      </span>
      {children}
    </div>
  )
}

/**
 * Les lignes sans cible de la section Totaux : les compteurs du projet, les
 * valeurs de la séance dans une autre unité, celles qu'on ajoute, puis
 * « + Unité » — le menu d'unités du panneau (recherche, catalogue, « Créer »).
 * Une durée se lit au calendrier : pas d'unité de temps au menu.
 */
function CountersRows({
  counters,
  gauges,
  draft,
  colors,
  hours,
}: {
  counters: ProjectCounter[]
  gauges: CheckGauge[]
  draft: CheckDraft
  colors: DomainColorValues
  hours: number
}) {
  const { data: units } = useUnits()
  const createUnit = useCreateUnit()
  const [opened, setOpened] = useState<string[]>([])
  const [menu, setMenu] = useState(false)
  const [query, setQuery] = useState('')
  const byId = new Map((units ?? []).map((u) => [u.id, u]))
  const valueOf = (unitId: string) =>
    draft.values.find((v) => v.unit_id === unitId)?.value ?? 0

  // Ce qui a déjà sa ligne : un Total en valeur, un compteur.
  const shown = new Set([
    ...gauges.flatMap((g) => (g.unitId ? [g.unitId] : [])),
    ...counters.flatMap((c) => (c.unit ? [c.unit.id] : [])),
  ])
  const extras = [
    ...draft.values.map((v) => v.unit_id).filter((id) => !shown.has(id)),
    ...opened.filter(
      (id) => !shown.has(id) && !draft.values.some((v) => v.unit_id === id),
    ),
  ]
  const taken = new Set([...shown, ...extras])

  function open(unitId: string) {
    setMenu(false)
    setQuery('')
    if (!taken.has(unitId)) setOpened((o) => [...o, unitId])
  }
  async function create() {
    const name = query.trim()
    try {
      const unit = await createUnit.mutateAsync({
        name,
        tone: defaultTone(name),
        kind: 'count',
      })
      open(unit.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'La création a échoué')
    }
  }
  // Échap ferme d'abord le menu, pas la coche.
  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      setMenu(false)
      setQuery('')
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [menu])

  const commit = (unitId: string, value: number | null) => {
    setOpened((o) => o.filter((id) => id !== unitId))
    setValue(draft, unitId, value)
  }

  const q = query.trim().toLowerCase()
  const catalogue = (units ?? []).filter(
    (u) =>
      !u.seconds_per_unit &&
      !taken.has(u.id) &&
      (!q ||
        u.name.toLowerCase().includes(q) ||
        !!u.effective_label?.toLowerCase().includes(q)),
  )
  const canCreate =
    q.length > 0 && !(units ?? []).some((u) => u.name.toLowerCase() === q)

  return (
    <>
      {counters.map((c) => (
        <CounterRow
          key={c.unit?.id ?? 'hours'}
          unit={c.unit}
          before={c.total}
          gain={c.unit ? valueOf(c.unit.id) : hours}
          colors={colors}
          onSet={c.unit ? (value) => commit(c.unit!.id, value) : undefined}
        />
      ))}
      {extras.map((id) => (
        <CounterRow
          key={id}
          unit={byId.get(id) ?? null}
          before={null}
          gain={valueOf(id)}
          colors={colors}
          editing={!draft.values.some((v) => v.unit_id === id)}
          onSet={(value) => commit(id, value)}
        />
      ))}
      {menu ? (
        <AddMenu
          query={query}
          onQuery={setQuery}
          placeholder="Rechercher une unité…"
          chips={[]}
          rows={catalogue.map((u) => ({
            key: u.id,
            emoji: u.emoji,
            name: unitBadge(u),
            onClick: () => open(u.id),
          }))}
          onCreate={canCreate ? () => void create() : undefined}
          empty="Aucune autre unité"
        />
      ) : (
        <button
          type="button"
          onClick={() => setMenu(true)}
          className="flex w-fit items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3" />
          Unité
        </button>
      )}
    </>
  )
}

/**
 * Un compteur, ou une valeur sans compteur : le glyphe (l'horloge pour les
 * heures, l'emoji de l'unité), le nom, le chiffre après la séance s'il y en a
 * un, puis l'apport en pastille — qui se saisit pour une unité
 * (`onSet`), se lit pour les heures.
 */
function CounterRow({
  unit,
  before,
  gain,
  colors,
  editing: startEditing = false,
  onSet,
}: {
  unit: ProjectCounter['unit']
  /** Le compteur avant la séance ; nul sans compteur. */
  before: number | null
  gain: number
  colors: DomainColorValues
  /** Ouverte en saisie (une unité qu'on vient d'ajouter). */
  editing?: boolean
  onSet?: (value: number | null) => void
}) {
  const [editing, setEditing] = useState(startEditing)
  const shape: UnitLike = unit ?? HOURS
  const pill = 'rounded px-1.5 py-px text-[11px] font-semibold tabular-nums'
  const pillStyle = {
    background: `color-mix(in oklab, ${colors.base} 15%, transparent)`,
    color: colors.fonce,
  }
  const name = unit ? unitBadge(unit) : 'Heures'
  return (
    <div className="flex items-center gap-2.5 text-[12.5px]">
      <span className="grid w-[18px] shrink-0 place-items-center leading-none">
        {unit ? (
          (unit.emoji ?? '')
        ) : (
          <Clock aria-hidden className="size-[13px] text-muted-foreground" />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
      {before !== null && (
        <span className="shrink-0 whitespace-nowrap text-foreground/70 tabular-nums">
          {num(before + gain, shape)} {unitLabel(shape, before + gain)}
        </span>
      )}
      {!onSet ? (
        gain > 0 && (
          <span className={pill} style={pillStyle}>
            +{num(gain, shape)}
          </span>
        )
      ) : editing ? (
        <ValueField
          value={gain || null}
          unit={shape}
          autoFocus
          aria-label={`Apport en ${shape.name}`}
          onCommit={(next) => {
            setEditing(false)
            onSet(next)
          }}
          className="h-6 w-14 max-w-none text-[12px]"
        />
      ) : (
        <button
          type="button"
          title="Saisir l'apport de la séance"
          aria-label={`Apport en ${shape.name} : ${num(gain, shape)}`}
          onClick={() => setEditing(true)}
          className={cn(pill, 'cursor-pointer hover:brightness-95')}
          style={pillStyle}
        >
          +{num(gain, shape)}
        </button>
      )}
    </div>
  )
}

/** Les heures, en toutes lettres comme sur un Total en durée. */
const HOURS: UnitLike = {
  name: 'heure',
  effective_plural: 'heures',
  tone: 'default',
}

/** La valeur de la séance dans une unité : remplacée, ou retirée (`null`). */
function setValue(draft: CheckDraft, unitId: string, value: number | null) {
  const rest = draft.values.filter((v) => v.unit_id !== unitId)
  draft.setValues(value === null ? rest : [...rest, { unit_id: unitId, value }])
}

/** Un Total : jauge, chiffre après la séance, apport en pastille. */
function TotalRow({
  gauge: g,
  colors,
  onSet,
}: {
  gauge: CheckGauge
  colors: DomainColorValues
  onSet: (value: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const filled = Math.min(100, (g.before / g.max) * 100)
  const added = Math.min(100 - filled, (g.gain / g.max) * 100)
  const pill = 'rounded px-1.5 py-px text-[11px] font-semibold tabular-nums'
  const pillStyle = {
    background: `color-mix(in oklab, ${colors.base} 15%, transparent)`,
    color: colors.fonce,
  }
  return (
    <div className="flex items-center gap-2.5 text-[12.5px]">
      <span className="grid w-[18px] shrink-0 place-items-center leading-none">
        <UnitMarkGlyph mark={g.mark} />
      </span>
      <span className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <span style={{ width: `${filled}%`, background: colors.base }} />
        <span
          className="transition-[width] duration-300"
          style={{
            width: `${added}%`,
            background: `color-mix(in oklab, ${colors.base} 35%, transparent)`,
          }}
        />
      </span>
      <span className="shrink-0 whitespace-nowrap text-foreground/70 tabular-nums">
        {num(g.before + g.gain, g.unit)}/{num(g.max, g.unit)}{' '}
        {unitLabel(g.unit, g.max)}
      </span>
      {g.unitId === null ? (
        <span className={pill} style={pillStyle}>
          +{num(g.gain, g.unit)}
        </span>
      ) : editing ? (
        <ValueField
          value={g.gain || null}
          unit={g.unit}
          autoFocus
          aria-label={`Apport en ${g.unit.name}`}
          onCommit={(next) => {
            setEditing(false)
            onSet(next)
          }}
          className="h-6 w-14 max-w-none text-[12px]"
        />
      ) : (
        <button
          type="button"
          title="Saisir l'apport de la séance"
          aria-label={`Apport en ${g.unit.name} : ${num(g.gain, g.unit)}`}
          onClick={() => setEditing(true)}
          className={cn(pill, 'cursor-pointer hover:brightness-95')}
          style={pillStyle}
        >
          +{num(g.gain, g.unit)}
        </button>
      )}
    </div>
  )
}

/** Un Résultat : nom, repères, champ pointillé. */
function ResultRow({
  metric,
  marks,
  draft,
}: {
  metric: Metric
  marks: ResultMarks | undefined
  draft: CheckDraft
}) {
  const reading = draft.readings.find((r) => r.metric_id === metric.id)
  const value = reading?.value ?? null
  return (
    <div className="flex items-center gap-2.5 text-[13px]">
      <span className="w-[18px] shrink-0 text-center">
        {metric.emoji ?? ''}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{metric.name}</span>
      <ResultHint marks={marks} value={value} unit={metric.unit} />
      <ValueField
        value={value}
        unit={metric.unit}
        aria-label={`Relevé de ${metric.name}`}
        onCommit={(next) => {
          if (next === null) {
            if (reading) draft.removeReading(reading)
          } else if (reading) draft.updateReading(reading, next)
          else draft.addReading(metric.id, next)
        }}
        className="w-[70px] max-w-none border-dashed border-border bg-background px-2 text-right font-semibold [field-sizing:fixed]"
      />
    </div>
  )
}

/**
 * La cible et le record d'un relevé : « Cible 1 500 · Record 1 480 » ; à la
 * cible, « Cible atteinte (1 500) », au-delà du record, « Record battu
 * (1 480) », en vert.
 */
function ResultHint({
  marks,
  value,
  unit,
}: {
  marks: ResultMarks | undefined
  value: number | null
  unit: UnitLike | null | undefined
}) {
  if (!marks || (marks.target === null && marks.record === null)) return null
  const atTarget =
    value !== null &&
    marks.target !== null &&
    reaches(value, marks.target, marks.direction)
  const beaten =
    value !== null &&
    marks.record !== null &&
    reaches(value, marks.record, marks.direction, true)
  const text = atTarget
    ? `Cible atteinte (${num(marks.target!, unit)})`
    : beaten
      ? `Record battu (${num(marks.record!, unit)})`
      : [
          marks.target !== null && `Cible ${num(marks.target, unit)}`,
          marks.record !== null && `Record ${num(marks.record, unit)}`,
        ]
          .filter(Boolean)
          .join(' · ')
  return (
    <span
      className={cn(
        'shrink-0 text-[11px] whitespace-nowrap',
        atTarget || beaten
          ? 'font-semibold text-emerald-600 dark:text-emerald-400'
          : 'text-muted-foreground',
      )}
    >
      {text}
    </span>
  )
}

/** Un nombre lisible, à deux décimales au plus (une durée en h:mm:ss). */
const num = (n: number, unit: UnitLike | null | undefined) =>
  formatValue(Math.round(n * 100) / 100, unit)
