import { ChartLine, Pencil, Trash2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import {
  CounterTile,
  domainColorValues,
  useDomain,
  useDomainCounters,
} from '@/entities/domain'
import {
  DeleteMetricDialog,
  metricToFormValues,
  MetricForm,
  MetricTile,
  toMetricPayload,
  useCreateMetric,
  useMetrics,
  useUpdateMetric,
  type Metric,
  type MetricFormValues,
} from '@/entities/metric'
import { UnitField } from '@/entities/unit'
import { ApiError } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  ItemCard,
  SectionTitle,
  Skeleton,
  SkeletonRegion,
  toast,
} from '@/shared/ui'

/** Un petit bouton d'icône d'une tuile (24 px, la hauteur de son en-tête). */
function TileButton({
  label,
  onClick,
  pressed,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  pressed?: boolean
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted',
        danger ? 'hover:text-destructive' : 'hover:text-foreground',
        pressed && 'bg-muted text-foreground',
      )}
    >
      {children}
    </button>
  )
}

/**
 * La section « En chiffres » d'un domaine (design #192, `prod/Domaine`) : une
 * grille de tuiles, d'abord les **compteurs** (ce qui a été fait, depuis
 * toujours), puis les **métriques** (le record, la courbe des relevés ; l'icône
 * courbe ouvre le panneau des relevés, que la page monte). Seul le titre
 * change : « compteur » et « métrique » restent les noms des concepts.
 *
 * Les compteurs apparaissent seuls, dès la première valeur — pas de « + » pour
 * eux. Une métrique, elle, naît **ici**, pas dans le projet : le squat
 * appartient à Musculation et traverse les projets annuels, il ne peut donc
 * pas dépendre de celui qui le vise. Le projet viendra seulement y poser une
 * cible.
 */
export function DomainMetrics({
  domainId,
  openMetricId,
  onToggleMetric,
}: {
  domainId: string
  /** La métrique dont le panneau des relevés est ouvert. */
  openMetricId: string | null
  onToggleMetric: (metricId: string) => void
}) {
  const { data: metrics, isPending } = useMetrics(domainId)
  const { data: domain } = useDomain(domainId)
  const { data: counters, isPending: countersPending } =
    useDomainCounters(domainId)
  const create = useCreateMetric(domainId)
  const update = useUpdateMetric()

  // null = fermé ; 'new' = création ; Metric = édition.
  const [editing, setEditing] = useState<Metric | 'new' | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Metric | null>(null)

  async function onSubmit(values: MetricFormValues) {
    try {
      if (editing === 'new') {
        await create.mutateAsync(toMetricPayload(values))
        toast.success('Métrique créée')
      } else if (editing) {
        await update.mutateAsync({
          id: editing.id,
          body: toMetricPayload(values),
        })
        toast.success('Métrique mise à jour')
      }
      setEditing(null)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "L'action a échoué")
      throw err
    }
  }

  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <SectionTitle
        as="h3"
        className="mb-0"
        onAdd={() => setEditing('new')}
        addLabel="Nouvelle métrique"
      >
        En chiffres
      </SectionTitle>

      {(isPending || countersPending) && (
        <SkeletonRegion className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px] rounded-[10px]" />
          ))}
        </SkeletonRegion>
      )}

      {metrics && counters && metrics.length + counters.length === 0 && (
        <ItemCard.Empty>Rien à compter pour l'instant</ItemCard.Empty>
      )}

      {metrics && counters && metrics.length + counters.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {counters.map((counter) => (
            <CounterTile
              key={counter.unit?.id ?? 'hours'}
              counter={counter}
              colorKey={domain?.color}
            />
          ))}
          {metrics.map((metric) => {
            const open = openMetricId === metric.id
            return (
              <MetricTile
                key={metric.id}
                metric={metric}
                lineColor={domainColorValues(domain?.color).base}
                /* Éditer et supprimer une métrique ne vivent que sur cette
                   page : ils restent, au survol. */
                hoverActions={
                  <>
                    <TileButton
                      label="Éditer"
                      onClick={() => setEditing(metric)}
                    >
                      <Pencil className="size-3.5" />
                    </TileButton>
                    <TileButton
                      label="Supprimer"
                      onClick={() => setPendingDelete(metric)}
                      danger
                    >
                      <Trash2 className="size-3.5" />
                    </TileButton>
                  </>
                }
                actions={
                  <TileButton
                    label="Voir les relevés"
                    pressed={open}
                    onClick={() => onToggleMetric(metric.id)}
                  >
                    <ChartLine className="size-[15px]" />
                  </TileButton>
                }
              />
            )
          })}
        </div>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing === 'new' ? 'Nouvelle métrique' : 'Modifier la métrique'}
            </DialogTitle>
          </DialogHeader>
          <MetricForm
            defaultValues={
              editing && editing !== 'new'
                ? metricToFormValues(editing)
                : undefined
            }
            submitLabel={editing === 'new' ? 'Créer' : 'Enregistrer'}
            onSubmit={onSubmit}
            onCancel={() => setEditing(null)}
            /* `UnitField` vit dans `entities/unit` : c'est au widget de le
               rendre, une entité ne pouvant pas en importer une autre. */
            unitField={({ value, onChange, invalid }) => (
              <UnitField
                value={value}
                onChange={onChange}
                invalid={invalid}
                placeholder="kg, minutes, watts…"
              />
            )}
          />
        </DialogContent>
      </Dialog>

      <DeleteMetricDialog
        metric={pendingDelete}
        onDeleted={() => setPendingDelete(null)}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  )
}
