import { Check, Link2, MapPin, Plus, X } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { type Domain, domainColor, domainColorValues } from '@/entities/domain'
import {
  MetricChart,
  type MetricValue,
  type ProjectMetric,
  useAddMetricValue,
  useDeleteMetricValue,
  useMetricValues,
  useProjectMetrics,
  resultThread,
  useSetProjectMetricStart,
} from '@/entities/metric'
import type { Project } from '@/entities/project'
import { ResultThreadBar } from '@/features/project/result'
import { ApiError } from '@/shared/api'
import { toDateISO } from '@/shared/lib/date'
import { formatDateShort } from '@/shared/lib/format'
import {
  formatValue,
  isTimeUnit,
  parseDuration,
  unitLabel,
} from '@/shared/lib/units'
import { cn } from '@/shared/lib/utils'
import { DateInput, Input, toast } from '@/shared/ui'

const today = () => toDateISO(new Date())

/**
 * Le panneau des relevés d'un Résultat (design #43, kit/Releves), ouvert
 * depuis l'icône courbe de sa carte : un volet à droite, pleine hauteur, de
 * 380 px, qui défile seul — le même geste que le panneau d'un savoir, dont il
 * partage la place. La maquette le posait en carte flottante au coin haut
 * droit, par-dessus la colonne de droite (corrigé à la demande du user, #49).
 *
 * De haut en bas : le fil du suivi (départ, bulle du record, cible) et sa
 * ligne « Record … le … » / « reste … » ; la courbe de la saison ; les
 * relevés de la saison, du plus récent au plus ancien, groupés par mois ;
 * l'ajout d'un relevé en pied.
 */
export function ResultValuesPanel({
  project,
  domain,
  metricId,
  onClose,
}: {
  project: Project
  domain: Domain | undefined
  metricId: string
  onClose: () => void
}) {
  const { data: links } = useProjectMetrics(project.id)
  const link = links?.find((l) => l.metric_id === metricId)
  // Le Résultat a pu être retiré pendant que le panneau était ouvert.
  if (!link) return null
  return (
    <div
      aria-label="Relevés du Résultat"
      className="fixed inset-y-0 right-0 z-40 w-[380px] max-w-full overflow-x-hidden overflow-y-auto border-l border-border bg-card shadow-xl duration-200 animate-in slide-in-from-right [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <Panel
        key={link.metric_id}
        project={project}
        domain={domain}
        link={link}
        onClose={onClose}
      />
    </div>
  )
}

function Panel({
  project,
  domain,
  link,
  onClose,
}: {
  project: Project
  domain: Domain | undefined
  link: ProjectMetric
  onClose: () => void
}) {
  const { metric, target } = link
  const unit = metric.unit
  const color = domainColor(domain?.color)
  const values = domainColorValues(domain?.color)
  // Les seuls relevés qui comptent : une cible posée sur une séance pas encore
  // faite (#92) n'est pas un relevé — elle se lit au panneau de la séance et
  // à la préparation de la semaine, pas ici.
  const { data: all } = useMetricValues(metric.id)
  const remove = useDeleteMetricValue()
  const setStart = useSetProjectMetricStart(project.id)
  /** Épingler un relevé comme départ de ce projet ; le désépingler rend
   *  la main à la règle (record d'avant la saison, sinon premier relevé). */
  const pin = (v: MetricValue) => {
    const pinned = link.start_value_id === v.id
    return (
      <StartPin
        pinned={pinned}
        className={color.text}
        onClick={() =>
          setStart.mutate(
            { metricId: metric.id, valueId: pinned ? null : v.id },
            {
              onError: (err) =>
                toast.error(
                  err instanceof ApiError
                    ? err.message
                    : "Le départ n'a pas pu être changé",
                ),
            },
          )
        }
      />
    )
  }
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const from = project.start_at
  // Sans fin prévue (#196) : la saison court jusqu'à sa fin constatée, sinon
  // jusqu'à aujourd'hui.
  const to = project.due_at ?? project.ended_at ?? toDateISO(new Date())
  // La saison : ce que la courbe montre, ce que la liste montre.
  const inSeason = (all ?? []).filter(
    (v) => v.measured_at >= from && v.measured_at <= to,
  )
  const rows = [...inSeason].reverse()
  // Hors de la saison : listés à part, grisés, hors courbe et hors record
  // (#43) — un relevé ajouté à une date hors période ne disparaît pas.
  const outside = (all ?? [])
    .filter((v) => v.measured_at < from || v.measured_at > to)
    .reverse()
  const groups: { key: string; label: string; rows: MetricValue[] }[] = []
  for (const v of rows) {
    const d = new Date(`${v.measured_at}T12:00:00`)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    const last = groups[groups.length - 1]
    if (last?.key === key) last.rows.push(v)
    else
      groups.push({
        key,
        label: d.toLocaleDateString('fr-FR', { month: 'long' }),
        rows: [v],
      })
  }

  const thread = resultThread(link)
  const best = link.best_in_period
  const withUnit = (v: number) =>
    `${formatValue(v, unit)} ${unitLabel(unit, v)}`.trimEnd()
  const remaining = !best
    ? null
    : thread.reached
      ? 'cible atteinte'
      : thread.recul && thread.dep !== null
        ? `départ ${withUnit(thread.dep)}`
        : `reste ${withUnit(Math.abs(target - best.value))}`

  return (
    <aside className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2.5">
        <span
          className="grid size-[30px] shrink-0 place-items-center rounded-lg text-base"
          style={{ background: values.soft }}
        >
          {metric.emoji ?? domain?.emoji}
        </span>
        <span className="min-w-0 truncate font-heading text-base font-semibold">
          {metric.name}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <X className="size-[15px]" />
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline gap-1.5 text-xs text-muted-foreground">
          {best ? (
            <>
              Record
              <strong className="font-semibold text-foreground tabular-nums">
                {withUnit(best.value)} le {formatDateShort(best.measured_at)}
              </strong>
            </>
          ) : (
            'Aucun relevé'
          )}
          {remaining && (
            <span className="ml-auto tabular-nums">{remaining}</span>
          )}
        </div>
        <ResultThreadBar
          variant="panel"
          className="mx-2 mt-5 mb-1.5"
          pct={thread.filled}
          start={thread.dep !== null ? formatValue(thread.dep, unit) : null}
          record={best ? formatValue(best.value, unit) : null}
          target={formatValue(target, unit)}
          reached={thread.reached}
          color={color}
        />
      </div>

      <MetricChart
        metric={metric}
        target={target}
        start={thread.dep}
        from={from}
        to={to}
        tint={values.base}
        className={color.text}
        onHoverValue={setHoveredId}
      />

      <div className="flex flex-col gap-0.5">
        {groups.map((g) => (
          <div key={g.key} className="flex flex-col gap-0.5">
            <span className="px-2 pt-2 pb-0.5 text-[10px] font-semibold tracking-[.05em] text-muted-foreground uppercase">
              {g.label}
            </span>
            {g.rows.map((v) => (
              <div
                key={v.id}
                className={cn(
                  'group/value flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] hover:bg-muted',
                  hoveredId === v.id && 'bg-muted',
                )}
              >
                <span
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    best?.id === v.id ? color.ink : 'border-[1.5px] bg-card',
                  )}
                  style={
                    best?.id === v.id ? undefined : { borderColor: values.ink }
                  }
                />
                <span className="font-medium tabular-nums">
                  {withUnit(v.value)}
                </span>
                <span className="flex-1 text-right text-xs text-muted-foreground">
                  {formatDateShort(v.measured_at)}
                </span>
                {v.activity_id && (
                  <Link2
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-label="Relevé pris en séance"
                  />
                )}
                {pin(v)}
                <button
                  type="button"
                  onClick={() => remove.mutate({ id: v.id })}
                  title="Supprimer le relevé"
                  aria-label="Supprimer le relevé"
                  className={cn(
                    'grid size-5 shrink-0 place-items-center rounded text-destructive hover:bg-destructive/10',
                    hoveredId === v.id
                      ? 'visible'
                      : 'invisible group-hover/value:visible',
                  )}
                >
                  <X className="size-[13px]" />
                </button>
              </div>
            ))}
          </div>
        ))}
        <AddValue
          metricId={metric.id}
          unit={unit}
          empty={rows.length === 0}
          between={
            outside.length > 0 && (
              <>
                <span className="px-2 pt-3 pb-0.5 text-[10px] font-semibold tracking-[.05em] text-muted-foreground uppercase">
                  Hors période
                </span>
                {outside.map((v) => (
                  <div
                    key={v.id}
                    className="group/value flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground hover:bg-muted"
                  >
                    <span className="size-2 shrink-0 rounded-full border-[1.5px] border-muted-foreground/50" />
                    <span className="tabular-nums">{withUnit(v.value)}</span>
                    <span className="flex-1 text-right text-xs">
                      {/* Toujours avec l'année, que `formatDateShort` omet
                          pour l'année en cours. */}
                      {withYear(v.measured_at)}
                    </span>
                    {pin(v)}
                    <button
                      type="button"
                      onClick={() => remove.mutate({ id: v.id })}
                      title="Supprimer le relevé"
                      aria-label="Supprimer le relevé"
                      className="invisible grid size-5 shrink-0 place-items-center rounded text-destructive group-hover/value:visible hover:bg-destructive/10"
                    >
                      <X className="size-[13px]" />
                    </button>
                  </div>
                ))}
              </>
            )
          }
        />
      </div>
    </aside>
  )
}

/**
 * « Ajouter un relevé » en pied, bouton secondaire pleine largeur ; ouvert :
 * la valeur (`mm:ss` sur un temps), l'unité, la date, valider ou annuler.
 */
function AddValue({
  metricId,
  unit,
  empty,
  between,
}: {
  metricId: string
  unit: ProjectMetric['metric']['unit']
  /** Aucun relevé sur la saison : « Aucun relevé » tant qu'on n'ajoute pas. */
  empty: boolean
  /** Entre la liste et l'ajout, fermé comme ouvert : les relevés hors période. */
  between?: ReactNode
}) {
  const add = useAddMetricValue()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [day, setDay] = useState(today)
  const time = isTimeUnit(unit)

  const parsed = (() => {
    if (time) return parseDuration(text, unit)
    const t = text.trim().replace(',', '.')
    const n = Number(t)
    return t !== '' && Number.isFinite(n) ? n : null
  })()

  async function save() {
    if (parsed === null || add.isPending) return
    try {
      await add.mutateAsync({ metricId, value: parsed, measuredAt: day })
      setOpen(false)
      setText('')
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Le relevé n'a pas pu être ajouté",
      )
    }
  }

  if (!open)
    return (
      <>
        {empty && (
          <span className="p-2 text-[13px] text-muted-foreground">
            Aucun relevé
          </span>
        )}
        {between}
        <button
          type="button"
          onClick={() => {
            setText('')
            setDay(today())
            setOpen(true)
          }}
          className="mt-1.5 flex h-8 items-center justify-center gap-1.5 rounded-lg border bg-card text-[13px] font-medium hover:bg-muted"
        >
          <Plus className="size-3.5" />
          Ajouter un relevé
        </button>
      </>
    )

  return (
    <>
      {between}
      <div className="mt-1.5 flex items-center gap-2 rounded-md bg-muted/60 px-2 py-1.5">
        <Input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save()
            if (e.key === 'Escape') setOpen(false)
          }}
          placeholder={time ? '49:30' : '0'}
          inputMode={time ? 'text' : 'decimal'}
          aria-label="Valeur relevée"
          className="h-8 w-[72px] px-2.5 text-[13px] tabular-nums"
        />
        <span className="shrink-0 text-xs text-muted-foreground">
          {unitLabel(unit, parsed ?? 0)}
        </span>
        <DateInput
          value={day}
          onChange={(e) => setDay(e.currentTarget.value)}
          aria-label="Date du relevé"
          className="h-8 w-[8.5rem] text-[13px]"
        />
        <span className="ml-auto flex gap-0.5">
          <button
            type="button"
            onClick={() => void save()}
            disabled={parsed === null || add.isPending}
            aria-label="Enregistrer le relevé"
            className="grid size-[26px] place-items-center rounded-md hover:bg-muted disabled:opacity-40"
          >
            <Check className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Annuler"
            className="grid size-[26px] place-items-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </span>
      </div>
    </>
  )
}

/**
 * L'épingle « départ de ce projet » d'un relevé : pleine à l'encre du
 * domaine sur le relevé désigné, toujours visible ; ailleurs, au survol de la
 * ligne. La même épingle que le départ sur la courbe.
 */
function StartPin({
  pinned,
  className,
  onClick,
}: {
  pinned: boolean
  className: string
  onClick: () => void
}) {
  const label = pinned
    ? 'Départ de ce projet — retirer pour revenir au départ automatique'
    : 'Faire de ce relevé le départ de ce projet'
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={pinned}
      className={cn(
        // Collée à la croix (la ligne espace ses éléments de 10 px) : les
        // deux gestes sur un relevé forment un groupe.
        '-mr-1.5 grid size-5 shrink-0 place-items-center rounded hover:bg-muted',
        pinned
          ? className
          : 'invisible text-muted-foreground group-hover/value:visible hover:text-foreground',
      )}
    >
      <MapPin
        className="size-[13px]"
        fill={pinned ? 'currentColor' : 'none'}
        strokeWidth={pinned ? 1.5 : 2}
      />
    </button>
  )
}

/** « 5 juil. 2025 » : la date d'un relevé hors période, toujours avec l'année. */
function withYear(day: string): string {
  const label = formatDateShort(day)
  const year = day.slice(0, 4)
  return label.endsWith(year) ? label : `${label} ${year}`
}
