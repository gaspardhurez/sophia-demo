import {
  type AcquisitionPlan,
  useDeletePlan,
  usePlanTransition,
} from '@/entities/plan'
import { ApiError } from '@/shared/api'
import { toast } from '@/shared/ui'

import { ConfirmDialog } from './confirm-dialog'

const SESSIONS = [
  {
    mark: '·',
    text: 'Les activités faites restent au calendrier, sans cycle.',
  },
  { mark: '·', text: 'Les activités à venir sont supprimées.' },
]

function fail(err: unknown, fallback: string) {
  toast.error(err instanceof ApiError ? err.message : fallback)
}

/**
 * **Annuler le démarrage** (design #67, menu ⋯ d'un cycle en cours) : il
 * redevient prévu. Réussites effacées, séances faites gardées sans cycle, à
 * venir supprimées ; phases, exercices, nom, niveau visé et projets gardés.
 */
export function UnstartCycleDialog({
  plan,
  onDone,
  onCancel,
}: {
  plan: AcquisitionPlan
  onDone: () => void
  onCancel: () => void
}) {
  const unstart = usePlanTransition('unstart')
  return (
    <ConfirmDialog
      title="Annuler le démarrage ?"
      lines={[
        { mark: '·', text: 'Les réussites sont effacées.' },
        ...SESSIONS,
        {
          mark: '·',
          text: 'Les phases, les exercices, le nom, le niveau visé et les projets sont gardés.',
        },
      ]}
      action="Annuler le démarrage"
      pending={unstart.isPending}
      onCancel={onCancel}
      onConfirm={() =>
        unstart
          .mutateAsync(plan.id)
          .then(onDone)
          .catch((err) => fail(err, "L'annulation a échoué"))
      }
    />
  )
}

/**
 * **Rouvrir** (design #67, menu ⋯ d'un cycle clos) : il repasse en cours avec
 * ses réussites. Acquis, il ne remplit plus ses projets tant qu'il n'est pas
 * terminé à nouveau. La transition elle-même est confiée au parent, qui sait
 * si un autre cycle est en cours (et propose alors de le partager ou de le
 * clore).
 */
export function ReopenCycleDialog({
  plan,
  projectTitle,
  pending,
  onConfirm,
  onCancel,
}: {
  plan: AcquisitionPlan
  projectTitle: (id: string) => string
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const acquired = plan.state === 'completed'
  return (
    <ConfirmDialog
      title="Rouvrir ce cycle ?"
      lines={[
        { mark: '·', text: 'Il repasse en cours, avec ses réussites.' },
        ...(acquired
          ? plan.project_ids.map((id) => ({
              mark: '🎯',
              text: `Il ne remplit plus ${projectTitle(id)} tant qu'il n'est pas terminé à nouveau.`,
            }))
          : []),
      ]}
      action="Rouvrir"
      pending={pending}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}

/**
 * **Supprimer** un cycle sans projet (design #67, menu ⋯) : il disparaît de
 * l'historique ; séances faites gardées sans cycle, à venir supprimées.
 */
export function DeleteCycleDialog({
  plan,
  onDone,
  onCancel,
}: {
  plan: AcquisitionPlan
  onDone: () => void
  onCancel: () => void
}) {
  const remove = useDeletePlan()
  return (
    <ConfirmDialog
      title="Supprimer ce cycle ?"
      lines={[
        { mark: '·', text: "Il disparaît de l'historique du savoir." },
        ...SESSIONS,
      ]}
      action="Supprimer"
      danger
      pending={remove.isPending}
      onCancel={onCancel}
      onConfirm={() =>
        remove
          .mutateAsync(plan.id)
          .then(onDone)
          .catch((err) => fail(err, 'La suppression a échoué'))
      }
    />
  )
}
