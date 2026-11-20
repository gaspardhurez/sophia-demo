import type { Domain } from '@/entities/domain'
import { type Project, useProjectDomainTies } from '@/entities/project'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui'

/**
 * Retirer un domaine du projet (#203) : la confirmation énumère ce qui se
 * délie — les savoirs visés de ce domaine (et leurs cycles pour ce projet),
 * ses activités types, ses Résultats, les liens de ses activités. Le projet
 * reste dans ses autres domaines ; les objets restent au domaine.
 */
export function RemoveDomainDialog({
  project,
  domain,
  remaining,
  pending,
  onConfirm,
  onClose,
}: {
  project: Project
  domain: Domain
  /** Les domaines qui restent au projet, pour le dire. */
  remaining: Domain[]
  pending: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const { data: ties } = useProjectDomainTies(project.id, domain.id)
  const groups = ties
    ? [
        { label: 'Savoirs visés', items: ties.skills.map((s) => s.title) },
        {
          label: 'Activités types',
          items: ties.activity_types.map((t) => t.title),
        },
        { label: 'Résultats', items: ties.results.map((r) => r.title) },
      ].filter((g) => g.items.length > 0)
    : []
  const nothing = ties && groups.length === 0 && ties.activities === 0

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>
            Retirer « {domain.emoji} {domain.name} » du projet ?
          </DialogTitle>
          <DialogDescription>
            Le projet reste dans{' '}
            {remaining
              .map((d) => `${d.emoji ?? ''} ${d.name}`.trim())
              .join(', ')}
            .{' '}
            {nothing
              ? 'Rien ne se délie.'
              : 'Se délient du projet, sans être supprimés :'}
          </DialogDescription>
        </DialogHeader>
        {ties && !nothing && (
          <div className="flex flex-col gap-2.5 text-[13px]">
            {groups.map((g) => (
              <div key={g.label} className="flex flex-col gap-0.5">
                <span className="text-[11px] font-semibold tracking-[.04em] text-muted-foreground uppercase">
                  {g.label}
                </span>
                <span>{g.items.join(', ')}</span>
              </div>
            ))}
            {ties.activities > 0 && (
              <span>
                {ties.activities}{' '}
                {ties.activities > 1
                  ? 'activités de ce domaine ne comptent plus pour le projet'
                  : 'activité de ce domaine ne compte plus pour le projet'}
                .
              </span>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            disabled={!ties || pending}
            onClick={onConfirm}
          >
            Retirer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
