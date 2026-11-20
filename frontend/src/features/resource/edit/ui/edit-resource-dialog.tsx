import {
  type Resource,
  ResourceForm,
  useDeleteResource,
  useUpdateResource,
} from '@/entities/resource'
import { ApiError } from '@/shared/api'
import { Button, Dialog, DialogContent, toast } from '@/shared/ui'

/**
 * « Modifier la ressource » (design #85, `prod/Savoir`) : les champs de
 * Nouvelle ressource, préremplis ; Supprimer en rouge à gauche, Annuler /
 * Enregistrer. Supprimer retire la ressource de la bibliothèque du savoir et
 * de ses cycles, sans confirmation.
 */
export function EditResourceDialog({
  resource,
  onClose,
}: {
  resource: Resource
  onClose: () => void
}) {
  const update = useUpdateResource(resource.skill_id)
  const remove = useDeleteResource(resource.skill_id)

  function fail(err: unknown, fallback: string) {
    toast.error(err instanceof ApiError ? err.message : fallback)
  }

  async function onDelete() {
    try {
      await remove.mutateAsync(resource.id)
      onClose()
    } catch (err) {
      fail(err, 'La ressource n’a pas été supprimée')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-[400px]">
        <ResourceForm
          heading="Modifier la ressource"
          submitLabel="Enregistrer"
          defaultValues={resource}
          isPending={update.isPending}
          onCancel={onClose}
          onSubmit={async (body) => {
            try {
              await update.mutateAsync({ id: resource.id, body })
              onClose()
            } catch (err) {
              fail(err, 'La ressource n’a pas été modifiée')
            }
          }}
          footerStart={
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              isPending={remove.isPending}
              onClick={() => void onDelete()}
            >
              Supprimer
            </Button>
          }
        />
      </DialogContent>
    </Dialog>
  )
}
