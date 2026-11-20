import { useDeleteMetric, useMetricUsage } from '../api/queries'
import type { Metric } from '../model/types'
import { ApiError } from '@/shared/api'
import { fmtShortDate } from '@/shared/lib/date'
import { formatValue } from '@/shared/lib/units'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/ui'

const s = (n: number) => (n > 1 ? 's' : '')

/**
 * Confirmation chiffrée avant de supprimer une métrique (design #27) : une ligne par usage, et au survol des relevés
 * les derniers d'entre eux — ce qui part, nommé plutôt que compté.
 *
 * Les relevés partent avec elle — une valeur détachée de ce qu'elle mesure ne
 * veut plus rien dire. Les projets, eux, survivent et perdent seulement leur
 * résultat visé.
 */
export function DeleteMetricDialog({
  metric,
  onDeleted,
  onCancel,
}: {
  metric: Metric | null
  onDeleted: () => void
  onCancel: () => void
}) {
  const { data: usage } = useMetricUsage(metric?.id ?? null)
  const remove = useDeleteMetric()

  async function onConfirm() {
    if (!metric) return
    try {
      await remove.mutateAsync({ id: metric.id })
      toast.success(`Métrique « ${metric.name} » supprimée`)
      onDeleted()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'La suppression a échoué',
      )
    }
  }

  const projects = usage?.projects ?? 0
  const values = usage?.values ?? 0
  const recent = usage?.recent ?? []
  const others = values - recent.length

  const row =
    'flex h-[34px] items-center gap-2 border-b border-border/70 last:border-0'
  const axis =
    'w-24 shrink-0 text-[10px] uppercase tracking-[.05em] text-muted-foreground'
  const count = (n: number, word: string) => (
    <>
      <span className="font-heading text-sm font-semibold tabular-nums">
        {n}
      </span>
      <span className="text-[13px] text-muted-foreground">{word}</span>
    </>
  )

  return (
    <Dialog open={metric !== null} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Supprimer {metric ? `« ${metric.name} »` : 'cette métrique'} ?
          </DialogTitle>
        </DialogHeader>

        {projects + values > 0 && (
          <ul className="grid">
            {projects > 0 && (
              <li className={row}>
                <span className={axis}>Projets</span>
                {count(projects, `résultat${s(projects)} visé${s(projects)}`)}
              </li>
            )}
            {values > 0 && (
              <li className={row}>
                <span className={axis}>Relevés</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex items-center gap-2">
                      {count(values, `relevé${s(values)}`)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent tone="card" side="right" className="grid">
                    {recent.map((v) => (
                      <span key={v.id} className="tabular-nums">
                        {formatValue(v.value, metric?.unit)} ·{' '}
                        {fmtShortDate(new Date(`${v.measured_at}T00:00`))}
                      </span>
                    ))}
                    {others > 0 && (
                      <span>
                        et {others} autre{s(others)}
                      </span>
                    )}
                  </TooltipContent>
                </Tooltip>
              </li>
            )}
          </ul>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
          <Button
            variant="ghost"
            isPending={remove.isPending}
            className="bg-destructive/10 text-destructive hover:bg-destructive/15"
            onClick={() => void onConfirm()}
          >
            Supprimer la métrique
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
