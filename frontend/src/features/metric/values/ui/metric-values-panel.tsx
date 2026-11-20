import { Check, ChartLine, Link2, List, Plus, X } from 'lucide-react'
import { useState } from 'react'

import {
  MetricChart,
  useAddMetricValue,
  useDeleteMetricValue,
  useMetricValues,
  type Metric,
} from '@/entities/metric'
import { ApiError } from '@/shared/api'
import { toDateISO } from '@/shared/lib/date'
import { formatDateShort } from '@/shared/lib/format'
import { formatValue, isTimeUnit, unitLabel } from '@/shared/lib/units'
import { cn } from '@/shared/lib/utils'
import { DateInput, DurationInput, NumberStepper, toast } from '@/shared/ui'

/** Hauteur commune aux deux vues : basculer ne fait pas sauter la carte. */
const BODY_H = 200

const today = () => toDateISO(new Date())

interface MetricValuesPanelProps {
  metric: Metric
  /** Classe de couleur du domaine, transmise au tracé. */
  accentTextClassName?: string
}

/**
 * Les relevés d'une métrique : la courbe **ou** la liste, et de quoi en
 * ajouter / en retirer.
 *
 * Montée sur la page domaine, où la métrique est chez elle : pas de cible ni
 * de saison, le record absolu. La bascule remplace le compromis qui aurait
 * consisté à ne donner que la liste ou que la courbe.
 *
 * **Ajouter un relevé sans passer par une séance** est le second manque que ça
 * comble. Le modèle le prévoyait depuis toujours (`activity_id` nullable, pour
 * « le point de départ ~70 squat qui précède le projet »), mais la seule
 * saisie ouverte était celle du panneau d'activité : impossible de noter un
 * départ sans inventer une séance qui n'a pas eu lieu, ni de corriger un relevé
 * dont la séance avait disparu.
 */
export function MetricValuesPanel({
  metric,
  accentTextClassName,
}: MetricValuesPanelProps) {
  // Les seuls relevés qui comptent : les cibles des séances pas encore faites
  // (#92) n'y sont pas.
  const { data: values } = useMetricValues(metric.id)
  const add = useAddMetricValue()
  const remove = useDeleteMetricValue()

  const [view, setView] = useState<'chart' | 'list'>('chart')
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState<number | null>(null)
  const [day, setDay] = useState(today)

  // Plus récent en haut : c'est « où j'en suis » qu'on vient lire. La courbe,
  // elle, va dans l'autre sens — le temps y coule de gauche à droite.
  const rows = [...(values ?? [])].reverse()
  const best = metric.best

  async function onAdd() {
    if (value === null) return
    try {
      await add.mutateAsync({ metricId: metric.id, value, measuredAt: day })
      setValue(null)
      setDay(today())
      setAdding(false)
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "Le relevé n'a pas pu être ajouté",
      )
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        {/* Le record se lit dans les deux vues : c'est lui qui décide qu'une
            cible est atteinte, il ne peut pas dépendre de l'onglet ouvert. */}
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {best ? (
            <>
              Record{' '}
              <span className="font-medium text-foreground tabular-nums">
                {formatValue(best.value, metric.unit)}{' '}
                {unitLabel(metric.unit, best.value)}
              </span>{' '}
              le {formatDateShort(best.measured_at)}
            </>
          ) : (
            'Aucun relevé'
          )}
        </p>

        <div
          role="group"
          aria-label="Affichage des relevés"
          className="flex shrink-0 items-center gap-0.5 rounded-md border p-0.5"
        >
          {(
            [
              ['chart', ChartLine, 'Voir la courbe'],
              ['list', List, 'Voir la liste'],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              aria-label={label}
              aria-pressed={view === key}
              title={label}
              className={cn(
                'grid size-6 place-items-center rounded transition-colors',
                view === key
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" />
            </button>
          ))}
        </div>
      </div>

      {view === 'chart' ? (
        <MetricChart metric={metric} className={accentTextClassName} />
      ) : (
        <div
          className="overflow-y-auto pr-1"
          style={{ height: BODY_H }}
          // Le défilement de la liste ne doit pas emporter la page avec lui.
          onWheel={(e) => e.stopPropagation()}
        >
          {adding ? (
            <div className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5">
              {/* Un chrono se tape « 49:30 », pas « 49,5 » — la conversion
                  est le seul écart entre les deux champs. */}
              {isTimeUnit(metric.unit) ? (
                <DurationInput
                  value={value}
                  onValueChange={setValue}
                  unit={metric.unit}
                  aria-label="Temps relevé"
                />
              ) : (
                <NumberStepper
                  value={value}
                  onValueChange={setValue}
                  aria-label="Valeur relevée"
                />
              )}
              <span className="shrink-0 text-xs text-muted-foreground">
                {unitLabel(metric.unit, value ?? 0)}
              </span>
              <DateInput
                value={day}
                onChange={(e) => setDay(e.currentTarget.value)}
                aria-label="Date du relevé"
                /* Largeur posée sur le champ : `DateInput` rend son propre
                   conteneur, un `flex-1` d'ici n'atteindrait que l'input. */
                className="h-8 w-[8.5rem] text-sm"
              />
              <button
                type="button"
                onClick={onAdd}
                disabled={value === null || add.isPending}
                aria-label="Enregistrer le relevé"
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-40"
              >
                <Check className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                aria-label="Annuler"
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted/60"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            >
              <Plus className="size-4 shrink-0" />
              Ajouter un relevé
            </button>
          )}

          {rows.map((v) => {
            return (
              <div
                key={v.id}
                /* Groupe NOMMÉ : la carte qui contient ce panneau est
                   elle-même un `group`, et un `group-hover` anonyme répondrait
                   à son survol — tous les X apparaîtraient d'un coup. */
                className="group/value flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm"
              >
                <span className="shrink-0 font-medium tabular-nums">
                  {formatValue(v.value, metric.unit)}{' '}
                  {unitLabel(metric.unit, v.value)}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {formatDateShort(v.measured_at)}
                </span>
                {/* Relevé pris au cours d'une séance : l'icône dit d'où il
                    vient, sans ouvrir un second chemin d'édition. */}
                {v.activity_id && (
                  <Link2
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-label="Relevé pris en séance"
                  />
                )}
                <button
                  type="button"
                  onClick={() => remove.mutate({ id: v.id })}
                  aria-label="Supprimer le relevé"
                  className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/value:opacity-100 hover:bg-muted/60 hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )
          })}

          {rows.length === 0 && !adding && (
            <p className="px-2 py-4 text-sm text-muted-foreground">
              Aucun relevé — commence par le point de départ.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
