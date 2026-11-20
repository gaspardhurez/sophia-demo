import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui'

import { carries, type PendingDeletion } from '../model/use-activity-deletion'
import { DeletionLines, MeasuresLostNote } from './deletion-lines'

const s = (n: number) => (n > 1 ? 's' : '')

interface DeleteActivitiesDialogProps {
  /** `null` = fermée. Non nulle, elle porte déjà ce qui va disparaître. */
  pending: PendingDeletion[] | null
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmation de suppression d'**une sélection** dont au moins une séance
 * porte quelque chose : la modale d'une séance (`DeleteActivityDialog`),
 * répétée pour chacune de celles qui portent — nommée, puis ce qu'elle
 * emporte. Les autres partent sans être citées.
 */
export function DeleteActivitiesDialog({
  pending,
  isPending,
  onConfirm,
  onCancel,
}: DeleteActivitiesDialogProps) {
  const items = pending ?? []
  const carrying = items.filter((x) => carries(x.activity, x.values))
  const measures = items.reduce(
    (n, x) => n + x.values.filter((v) => v.counts).length,
    0,
  )

  return (
    <Dialog open={pending !== null} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Supprimer {items.length} séances ?</DialogTitle>
          <DialogDescription>
            {carrying.length > 1
              ? `${carrying.length} d’entre elles portent des données saisies. Elles partent avec elles.`
              : 'L’une d’elles porte des données saisies. Elles partent avec elle.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {carrying.map((x) => (
            <div key={x.activity.id} className="grid gap-1.5">
              <p className="text-sm font-medium">
                {x.activity.emoji && `${x.activity.emoji} `}
                {x.activity.title}
              </p>
              <DeletionLines pending={x} />
            </div>
          ))}
        </div>
        <MeasuresLostNote count={measures} />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
          >
            Annuler
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            Supprimer
            {measures > 0 && ` (${measures} relevé${s(measures)})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
