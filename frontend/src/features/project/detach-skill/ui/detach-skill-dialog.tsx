import { useState } from 'react'

import { domainColorValues, useDomains } from '@/entities/domain'
import {
  type Project,
  useSetProjectSkills,
  principalDomainId,
} from '@/entities/project'
import { usePlans, usePlanTransition } from '@/entities/plan'
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

/**
 * Détacher un savoir du projet (design #27, `prod/Savoirs`) : il sort du
 * plan — de sa séquence comme de ses étapes —, le savoir garde son contenu.
 * Si son cycle en cours sert ce projet, on choisit de le garder ouvert ou
 * de le clore ;
 * clore, c'est l'abandonner : un cycle interrompu n'est pas complété.
 */
export function DetachSkillDialog({
  project,
  skillId,
  skillName,
  onClose,
}: {
  project: Project
  skillId: string
  skillName: string
  onClose: () => void
}) {
  const setSkills = useSetProjectSkills()
  const abandon = usePlanTransition('abandon')
  const { data: plans } = usePlans(skillId)
  // Seul le cycle en cours **de ce projet** se propose à la clôture : un
  // cycle qui sert un autre projet ne s'abandonne pas par effet de bord.
  const open = plans?.find(
    (p) => p.state === 'active' && p.project_ids.includes(project.id),
  )
  const [cycle, setCycle] = useState<'keep' | 'close'>('keep')
  const { data: domains } = useDomains()

  async function confirm() {
    try {
      await setSkills.mutateAsync({
        id: project.id,
        skillIds: project.direct_skill_ids.filter((id) => id !== skillId),
      })
      if (open && cycle === 'close') await abandon.mutateAsync(open.id)
      onClose()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Le détachement a échoué',
      )
    }
  }

  // Coché : un anneau épais à l'encre du domaine.
  const ink = domainColorValues(
    domains?.find((d) => d.id === principalDomainId(project))?.color,
  ).ink
  const radio = (on: boolean) =>
    cn(
      'size-3.5 shrink-0 rounded-full bg-card',
      on ? 'border-[4.5px]' : 'border-[1.5px] border-ring',
    )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>
            Détacher « {skillName} » de {project.title} ?
          </DialogTitle>
          <DialogDescription>
            Il sort du plan du projet. Le savoir garde son contenu : ses notes,
            ses exos et son cycle.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <div className="grid gap-2 border-t pt-3">
            <span className="text-xs font-semibold">Cycle en cours</span>
            {(
              [
                ['keep', 'Le garder ouvert'],
                ['close', 'Le clore'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCycle(key)}
                className="flex items-center gap-2 text-left text-[13px]"
              >
                <span
                  className={radio(cycle === key)}
                  style={cycle === key ? { borderColor: ink } : undefined}
                />
                {label}
              </button>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="ghost"
            isPending={setSkills.isPending || abandon.isPending}
            className="bg-destructive/10 text-destructive hover:bg-destructive/20"
            onClick={() => void confirm()}
          >
            Détacher
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
