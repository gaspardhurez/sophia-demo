import { AlertTriangle, ChartLine, ChevronDown, Trash2 } from 'lucide-react'
import { useState } from 'react'

import type { DomainColorClasses } from '@/entities/domain'
import {
  type Metric,
  type ProjectMetric,
  resultTarget,
  useSetProjectMetric,
  useUnsetProjectMetric,
} from '@/entities/metric'
import {
  ObjectiveCheck,
  isProjectOpen,
  ObjectiveFrame,
  ObjectiveLabel,
  type Project,
  principalDomainId,
} from '@/entities/project'
import { ApiError } from '@/shared/api'
import {
  formatDuration,
  isTimeUnit,
  parseDuration,
  formatValue,
  unitLabel,
  type UnitLike,
} from '@/shared/lib/units'
import { cn } from '@/shared/lib/utils'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@/shared/ui'

import { MetricMenu } from './metric-menu'
import { paliersOf, ResultThread } from './result-thread'

const fail = (err: unknown) =>
  toast.error(
    err instanceof ApiError ? err.message : "L'enregistrement a échoué",
  )

/** « ou moins » quand le record est le plus bas, « ou plus » sinon. */
const sense = (m: Pick<Metric, 'direction'>) =>
  m.direction === 'down' ? 'ou moins' : 'ou plus'

/** La cible telle qu'on la tape : `49:59` sur une durée, sinon le nombre. */
const toInput = (v: number, unit: UnitLike | null | undefined) =>
  isTimeUnit(unit) ? formatDuration(v, unit) : String(v)

/** Ce qu'on a tapé, relu dans l'unité de la métrique. */
function fromInput(text: string, unit: UnitLike | null | undefined) {
  if (isTimeUnit(unit)) return parseDuration(text, unit)
  const n = Number(text.trim().replace(',', '.'))
  return text.trim() !== '' && Number.isFinite(n) ? n : null
}

/** « 10KM à 49:59 min ou moins » — la phrase d'un résultat visé, sans emoji. */
export function resultSentence(link: ProjectMetric): string {
  return `${resultTarget(link)} ${sense(link.metric)}`
}

/**
 * Un résultat visé en **lecture** : le record, la phrase, le fil. L'icône
 * courbe de l'en-tête ouvre le panneau des relevés (design #43) ; un second
 * clic le ferme, et la carte se borde à l'encre tant qu'il est ouvert.
 */
export function ResultCardRead({
  project,
  link,
  color,
  valuesOpen = false,
  onToggleValues,
  ink,
}: {
  project: Project
  link: ProjectMetric
  color: DomainColorClasses
  /** Le panneau des relevés de ce Résultat est ouvert. */
  valuesOpen?: boolean
  /** Ouvre ou ferme le panneau ; sans lui, pas d'icône (résumé de création). */
  onToggleValues?: () => void
  /** `domainColorValues(...).ink` — le bord de la carte ouverte. */
  ink?: string
}) {
  const { metric } = link
  const rec = link.best_in_period?.value ?? null
  const dep = link.start?.value ?? null
  const down = metric.direction === 'down'
  const recul = rec !== null && dep !== null && (down ? rec > dep : rec < dep)
  return (
    <ObjectiveFrame
      style={
        valuesOpen && ink
          ? { borderColor: ink, boxShadow: `inset 0 0 0 0.5px ${ink}` }
          : undefined
      }
    >
      <div className="flex items-center gap-[9px]">
        <ObjectiveCheck
          done={link.is_met}
          failed={!isProjectOpen(project.status)}
          inkClassName={color.ink}
        />
        <ObjectiveLabel>Résultat</ObjectiveLabel>
        {onToggleValues && (
          <button
            type="button"
            onClick={onToggleValues}
            title="Voir les relevés"
            aria-label="Voir les relevés"
            aria-pressed={valuesOpen}
            className={cn(
              '-mr-1 ml-auto grid size-6 shrink-0 place-items-center rounded-md transition-colors hover:bg-muted hover:text-foreground',
              valuesOpen ? 'bg-muted text-foreground' : 'text-muted-foreground',
            )}
          >
            <ChartLine className="size-3.5" />
          </button>
        )}
        <span
          className={cn(
            'flex items-baseline gap-[5px] tabular-nums',
            !onToggleValues && 'ml-auto',
          )}
        >
          {rec === null ? (
            <span className="text-[13px] text-muted-foreground">
              aucun relevé
            </span>
          ) : (
            <>
              <span
                className={cn(
                  'font-heading text-sm leading-none font-semibold',
                  recul && 'text-[#c2410c]',
                )}
              >
                {formatValue(rec, metric.unit)}
              </span>
              <span className="text-[13px] text-muted-foreground">
                {unitLabel(metric.unit, rec)}
              </span>
            </>
          )}
        </span>
      </div>
      <p className="truncate text-[13px]">
        {/* L'emoji de la métrique devant son nom, comme en édition. */}
        {metric.emoji ? `${metric.emoji} ` : ''}
        {resultSentence(link)}
      </p>
      <ResultThread
        link={link}
        paliers={paliersOf(project, metric.id)}
        dotClassName={color.dot}
        ringClassName={color.ring}
        inkClassName={color.ink}
        textClassName={color.text}
      />
    </ObjectiveFrame>
  )
}

/**
 * Un résultat visé en **édition** : « [métrique ▾] à [cible] min ou moins ».
 * Sans `link`, c'est une carte neuve — écrite dès que la métrique et la cible
 * sont posées.
 */
export function ResultCardEdit({
  project,
  link,
  metrics,
  domainEmoji,
  onDiscard,
}: {
  project: Project
  link?: ProjectMetric
  /** Les métriques du domaine. */
  metrics: Metric[]
  domainEmoji?: string | null
  onDiscard?: () => void
}) {
  const put = useSetProjectMetric(project.id)
  const unset = useUnsetProjectMetric(project.id)
  const [metricId, setMetricId] = useState<string | null>(
    link?.metric_id ?? null,
  )
  const [target, setTarget] = useState(
    link ? toInput(link.target, link.metric.unit) : '',
  )
  const [confirming, setConfirming] = useState(false)
  const metric = metrics.find((m) => m.id === metricId) ?? link?.metric

  async function save(next: { metricId?: string | null; target?: string }) {
    const m = next.metricId !== undefined ? next.metricId : metricId
    const unit = metrics.find((x) => x.id === m)?.unit ?? metric?.unit
    const t = fromInput(next.target ?? target, unit)
    if (!m || t === null) return
    try {
      await put.mutateAsync({ metricId: m, target: t })
      // Changer de métrique, c'est viser autre chose : l'ancienne visée part.
      if (link && link.metric_id !== m)
        await unset.mutateAsync({ metricId: link.metric_id })
      if (!link) onDiscard?.()
    } catch (err) {
      fail(err)
    }
  }

  const paliers = link ? paliersOf(project, link.metric_id) : []
  async function onDelete() {
    if (!link) return onDiscard?.()
    if (paliers.length > 0 && !confirming) return setConfirming(true)
    try {
      await unset.mutateAsync({ metricId: link.metric_id })
      setConfirming(false)
    } catch (err) {
      fail(err)
    }
  }

  // La cible n'est pas plus ambitieuse que le record d'avant la saison : le
  // fil ne part pas de lui, et on le dit (design #27, 3h).
  const t = fromInput(target, metric?.unit)
  const base = link?.baseline?.value ?? null
  const below =
    link &&
    metric &&
    base !== null &&
    t !== null &&
    (metric.direction === 'down' ? t > base : t < base)

  const word =
    'inline-flex h-7 items-center gap-1 rounded-md px-1 text-sm font-medium hover:bg-muted'

  return (
    // Une carte neuve n'a pas de survol et garde sa corbeille en vue.
    <ObjectiveFrame
      warn={Boolean(below)}
      className={link ? 'hover:border-ring' : undefined}
    >
      <div className="flex items-center gap-[9px]">
        <ObjectiveLabel editing>Résultat</ObjectiveLabel>
        <button
          type="button"
          onClick={() => void onDelete()}
          aria-label="Retirer cet objectif"
          className={cn(
            'ml-auto grid size-6 place-items-center rounded-md text-red-700 transition-opacity hover:bg-red-50',
            link && 'opacity-0 group-hover/card:opacity-100',
          )}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-sm leading-7">
        <MetricMenu
          metrics={metrics}
          domainId={principalDomainId(project)}
          domainEmoji={domainEmoji}
          value={metricId}
          onChange={(id) => {
            setMetricId(id)
            void save({ metricId: id })
          }}
          trigger={
            <button type="button" className={word}>
              {metric ? (
                <>
                  {metric.emoji && <span>{metric.emoji}</span>}
                  {metric.name}
                </>
              ) : (
                <span className="text-muted-foreground">métrique</span>
              )}
              <ChevronDown
                className="size-3 text-muted-foreground"
                strokeWidth={2.5}
              />
            </button>
          }
        />
        <span className="text-muted-foreground">à</span>
        <input
          value={target}
          autoFocus={!link}
          inputMode="decimal"
          placeholder={isTimeUnit(metric?.unit) ? '0:00' : '0'}
          aria-label="Cible"
          onChange={(e) => setTarget(e.target.value)}
          onBlur={() => void save({ target })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          className="field-sizing-content h-7 min-w-[3ch] border-0 border-b-[1.5px] border-dashed border-ring bg-transparent px-0.5 text-center font-heading font-semibold tabular-nums outline-none focus:border-foreground"
        />
        {metric && (
          <span className="text-muted-foreground">
            {unitLabel(metric.unit, t ?? 0)} {sense(metric)}
          </span>
        )}
      </div>

      {below && metric && base !== null && (
        <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          <AlertTriangle className="mt-px size-[13px] shrink-0 text-amber-600" />
          Ton record est à {formatValue(base, metric.unit)}{' '}
          {unitLabel(metric.unit, base)}
        </p>
      )}

      {link && (
        <Dialog open={confirming} onOpenChange={setConfirming}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Supprimer « {resultSentence(link)} » ?</DialogTitle>
            </DialogHeader>
            <ul className="grid">
              {paliers.map((pal) => (
                <li
                  key={`${pal.n}-${pal.value}`}
                  className="flex h-[34px] items-center gap-2.5 border-b border-border/70 last:border-0"
                >
                  <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-[.05em] text-muted-foreground">
                    Étape {pal.n}
                  </span>
                  <span className="flex min-w-0 flex-1 items-baseline gap-[5px] tabular-nums">
                    <span className="font-heading text-sm leading-none font-semibold">
                      {formatValue(pal.value, link.metric.unit)}
                    </span>
                    <span className="text-[13px] leading-none text-muted-foreground">
                      {unitLabel(link.metric.unit, pal.value)}
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
