import { type ReactNode, useState } from 'react'

import {
  SkillForm,
  type SkillFormValues,
  toSkillPayload,
  useCreateSkill,
} from '@/entities/skill'
import { ApiError } from '@/shared/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  toast,
} from '@/shared/ui'

interface CreateSkillDialogProps {
  domainId: string
  /** Parent sous lequel créer ; `null` pour une compétence racine. */
  parentId: string | null
  trigger: ReactNode
}

export function CreateSkillDialog({
  domainId,
  parentId,
  trigger,
}: CreateSkillDialogProps) {
  const [open, setOpen] = useState(false)
  const createSkill = useCreateSkill()
  const isChild = parentId !== null

  async function onSubmit(values: SkillFormValues) {
    try {
      const skill = await createSkill.mutateAsync({
        domainId,
        body: toSkillPayload(values, parentId),
      })
      setOpen(false)
      toast.success(`Compétence « ${skill.name} » créée`)
    } catch (err) {
      // Les violations d'invariant (409/422) portent un message métier du back.
      toast.error(
        err instanceof ApiError ? err.message : 'La création a échoué',
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isChild ? 'Nouvelle sous-compétence' : 'Nouvelle compétence'}
          </DialogTitle>
          <DialogDescription>
            {isChild
              ? 'Une compétence plus fine, rattachée à la précédente.'
              : 'Une compétence racine de ce domaine.'}
          </DialogDescription>
        </DialogHeader>
        <SkillForm
          submitLabel="Créer"
          onSubmit={onSubmit}
          onCancel={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
