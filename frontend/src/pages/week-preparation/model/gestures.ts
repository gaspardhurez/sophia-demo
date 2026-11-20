import {
  type Activity,
  usePostponeActivity,
  useUnpostponeActivity,
  useUpdateActivity,
} from '@/entities/activity'
import { useInvalidatePreparations } from '@/entities/preparation'
import {
  useActivityDeletion,
  useRestoreActivity,
} from '@/features/activity/delete'
import { useSessionCheck } from '@/features/activity/edit'
import { ApiError } from '@/shared/api'
import type { UndoStack } from '@/shared/lib/undo-stack'
import { toast } from '@/shared/ui'

const fail = (err: unknown, fallback = 'Échec') =>
  toast.error(err instanceof ApiError ? err.message : fallback)

/**
 * Les gestes de la préparation sur les séances. Tout s'écrit en base, **en
 * direct** : le panneau relit le calendrier, il n'en garde pas de copie.
 *
 * Sur une **non faite** : Faite, Reporter, Supprimer — directs ; chacun
 * empile son inverse sur la pile d'annulation partagée avec le calendrier
 * (⌘Z : décocher, ramener, recréer).
 */
export function usePreparationGestures(undo: UndoStack) {
  const invalidate = useInvalidatePreparations()
  const update = useUpdateActivity()
  const postponeMutation = usePostponeActivity()
  const unpostpone = useUnpostponeActivity()
  const restore = useRestoreActivity()

  const deletion = useActivityDeletion({
    onDeleted: (a, values) => {
      undo.push(async () => {
        await restore(a, values)
      })
      invalidate()
    },
    onError: (err) => fail(err),
  })

  // Cocher une séance d'apprentissage passe par sa modale (#140).
  const sessionCheck = useSessionCheck()

  /** ✓ Faite : la non faite est cochée. */
  function markDone(a: Activity) {
    sessionCheck.request(a, () => applyDone(a))
  }

  async function applyDone(a: Activity) {
    try {
      await update.mutateAsync({ id: a.id, body: { done: true } })
      undo.push(async () => {
        await update.mutateAsync({ id: a.id, body: { done: false } })
      })
    } catch (err) {
      fail(err)
    }
  }

  /** ↻ Reporter : même jour, même heure, la semaine suivante (#94). */
  async function postpone(a: Activity) {
    try {
      await postponeMutation.mutateAsync({ id: a.id })
      undo.push(async () => {
        await unpostpone.mutateAsync({ id: a.id })
      })
    } catch (err) {
      fail(err, 'Le report a échoué')
    }
  }

  /** 🗑 Supprimer une non faite (confirmée si elle porte des valeurs). */
  function remove(a: Activity) {
    void deletion.request(a)
  }

  return {
    deletion,
    checkDialog: sessionCheck.dialog,
    markDone,
    postpone,
    remove,
  }
}

export type PreparationGestures = ReturnType<typeof usePreparationGestures>
