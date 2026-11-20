import { ResourceForm, useCreateResource } from '@/entities/resource'
import { ApiError } from '@/shared/api'
import { Dialog, DialogContent, toast } from '@/shared/ui'

/**
 * « Nouvelle ressource » (design #81, `prod/Savoir`) : Titre, Lien ou
 * référence, Partie ; Annuler / Créer. Créée depuis un cycle (`planId`), elle
 * entre aussi dans ce cycle.
 */
export function NewResourceDialog({
  skillId,
  planId,
  onClose,
}: {
  skillId: string
  planId?: string
  onClose: () => void
}) {
  const create = useCreateResource(skillId)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} className="max-w-[400px]">
        <ResourceForm
          heading="Nouvelle ressource"
          suggestTitle
          submitLabel="Créer"
          isPending={create.isPending}
          onCancel={onClose}
          onSubmit={async (fields) => {
            try {
              await create.mutateAsync({ ...fields, plan_id: planId ?? null })
              onClose()
            } catch (err) {
              toast.error(
                err instanceof ApiError
                  ? err.message
                  : 'La ressource n’a pas été créée',
              )
            }
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
