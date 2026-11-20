import { actsOfItem, useActivities } from '@/entities/activity'
import { type PracticeItem, useDeletePracticeItem } from '@/entities/practice'
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
 * Ce que la suppression laisse au calendrier : les passes faites et les
 * séances à venir qui le visaient, toutes détachées.
 */
function detachedLine(done: number, upcoming: number): string {
  const parts: string[] = []
  if (done > 0)
    parts.push(
      `${done} séance${done > 1 ? 's' : ''} faite${done > 1 ? 's' : ''}`,
    )
  if (upcoming > 0) {
    parts.push(`${upcoming} séance${upcoming > 1 ? 's' : ''} à venir`)
  }
  if (parts.length === 0) return ''
  const total = done + upcoming
  const subject = `${total > 1 ? 'Ses' : 'Sa'} ${parts.join(' et ')}`
  return ` ${subject} ${total > 1 ? 'restent' : 'reste'} au calendrier, sans objet rattaché.`
}

/**
 * Supprimer un objet de pratique — avec **l'impact réel**, pas un avertissement
 * générique.
 *
 * Ses séances ne partent pas avec lui : faites, elles ont eu lieu ; à venir,
 * elles restent posées. Toutes demeurent au calendrier, simplement déliées. Le
 * dire évite l'hésitation devant une suppression qui, elle, ne détruit rien
 * d'irremplaçable.
 */
export function DeleteItemDialog({
  item,
  onDone,
  onCancel,
}: {
  item: PracticeItem
  onDone: () => void
  onCancel: () => void
}) {
  const remove = useDeletePracticeItem()
  const { data: activities } = useActivities({ skillId: item.skill_id })
  // Les séances à venir qui le visaient perdent leur acte sur lui.
  const upcoming = (activities ?? []).filter(
    (a) => actsOfItem(a, item.id).length > 0 && !a.done,
  ).length

  async function confirm() {
    try {
      await remove.mutateAsync(item.id)
      onDone()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'La suppression a échoué',
      )
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent showCloseButton={false} className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Supprimer « {item.title} » ?</DialogTitle>
          <DialogDescription>
            Il quitte la bibliothèque du savoir et les cycles qui le portent.
            {detachedLine(item.sessions, upcoming)}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => void confirm()}
          >
            Supprimer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
