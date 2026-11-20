import { useState } from 'react'

import {
  type AcquisitionPlan,
  usePlanTransition,
  useUpdatePlan,
} from '@/entities/plan'
import { ApiError } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
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

type Choice = 'share' | 'close'

/**
 * Commencer (ou reprendre) un cycle quand **un autre est déjà en cours** sur
 * le savoir (design #63, `prod/Savoir`) — un seul cycle en cours à la fois.
 *
 * - **Partager le cycle en cours** : les projets du cycle qu'on voulait
 *   commencer le rejoignent. Le cycle prévu, vide, disparaît ; préparé, il
 *   reste prévu, détaché (le serveur tranche).
 * - **Clore l'autre cycle**, puis commencer celui-ci : l'autre est
 *   **abandonné** — reprenable, rien n'est déclaré acquis par effet de bord ;
 *   pour le déclarer acquis, on passe par Terminer.
 *
 * Sans projet à partager, seule la clôture a un sens.
 */
export function CycleConflictDialog({
  plan,
  active,
  activeName,
  mode,
  projectTitle,
  onDone,
  onCancel,
}: {
  /** Le cycle qu'on voulait commencer (prévu) ou reprendre (abandonné). */
  plan: AcquisitionPlan
  active: AcquisitionPlan
  /** Le nom de l'onglet du cycle en cours (cf. `cycleName`). */
  activeName: string
  mode: 'open' | 'reopen'
  projectTitle: (id: string) => string
  /** Le cycle à afficher ensuite. */
  onDone: (planId: string) => void
  onCancel: () => void
}) {
  const shareable = plan.project_ids.length > 0
  const [choice, setChoice] = useState<Choice>(shareable ? 'share' : 'close')
  const update = useUpdatePlan()
  const abandon = usePlanTransition('abandon')
  const start = usePlanTransition(mode)
  const pending = update.isPending || abandon.isPending || start.isPending

  const projects = (ids: string[]) =>
    ids.map((id) => `🎯 ${projectTitle(id)}`).join(', ')

  async function confirm() {
    try {
      if (choice === 'share') {
        await update.mutateAsync({
          id: active.id,
          body: {
            project_ids: [
              ...new Set([...active.project_ids, ...plan.project_ids]),
            ],
          },
        })
        onDone(active.id)
      } else {
        await abandon.mutateAsync(active.id)
        await start.mutateAsync(plan.id)
        onDone(plan.id)
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "L'action a échoué")
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent showCloseButton={false} className="sm:max-w-[512px]">
        <DialogHeader>
          <DialogTitle className="text-lg">
            Un cycle est déjà en cours
          </DialogTitle>
          <DialogDescription>
            {active.name ? `« ${activeName} »` : activeName}
            {active.name &&
              active.project_ids.length > 0 &&
              ` · ${projects(active.project_ids)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-2">
          {shareable && (
            <ChoiceCard
              selected={choice === 'share'}
              onSelect={() => setChoice('share')}
              title="Partager le cycle en cours"
              detail={`${projects(plan.project_ids)} le rejoint`}
            />
          )}
          <ChoiceCard
            selected={choice === 'close'}
            onSelect={() => setChoice('close')}
            title="Clore l'autre cycle"
            detail="Puis démarrer celui-ci"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
          <Button disabled={pending} onClick={() => void confirm()}>
            {choice === 'share' ? 'Partager' : 'Clore et démarrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ChoiceCard({
  selected,
  onSelect,
  title,
  detail,
}: {
  selected: boolean
  onSelect: () => void
  title: string
  detail: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'rounded-[10px] p-3 text-left transition-colors',
        selected
          ? 'border-[1.5px] border-foreground bg-card'
          : 'border border-border bg-card hover:bg-muted/40',
      )}
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>
    </button>
  )
}
