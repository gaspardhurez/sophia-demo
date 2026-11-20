import {
  useDeleteActivityType,
  type ActivityType,
} from '@/entities/activity-type'
import { ApiError } from '@/shared/api'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@/shared/ui'

/**
 * Supprimer une activité type (#37, §7) : retirée de tous ses projets, ses
 * occurrences restent au calendrier, sans type. Un Total qui ne comptait
 * qu'elle est supprimé. Plus de choix à trois options : rien de ce qui a été
 * posé ne part.
 */
export function DeleteActivityTypeDialog({
  activityType,
  onClose,
}: {
  /** L'activité type à supprimer ; `null` ferme la modale. */
  activityType: ActivityType | null
  onClose: () => void
}) {
  const remove = useDeleteActivityType()
  const projects = activityType?.project_ids.length ?? 0

  async function confirm() {
    if (!activityType) return
    try {
      await remove.mutateAsync(activityType.id)
      toast.success(`« ${activityType.title} » supprimée`)
      onClose()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'La suppression a échoué',
      )
    }
  }

  return (
    <Dialog
      open={activityType !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Supprimer « {activityType?.title} » ?</DialogTitle>
          <DialogDescription>
            Ses occurrences restent au calendrier, sans activité type.
            {projects > 0 &&
              ` Elle est retirée de ${projects} projet${projects > 1 ? 's' : ''} ; un Total qui ne comptait qu'elle est supprimé.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={remove.isPending}
          >
            Annuler
          </Button>
          <Button
            variant="destructive"
            isPending={remove.isPending}
            onClick={() => void confirm()}
          >
            Supprimer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
