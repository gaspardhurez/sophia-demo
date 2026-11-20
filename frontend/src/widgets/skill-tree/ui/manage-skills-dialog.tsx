import { ArrowLeft, Link2, Plus } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { useSetProjectSkills, useSetStepSkills } from '@/entities/project'
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  toast,
} from '@/shared/ui'

/**
 * Contexte de gestion des compétences. Selon le niveau, « créer » rattache à une
 * chaîne différente :
 *  - domaine  : créer → domaine
 *  - projet : créer → domaine + projet
 *  - étape    : créer → domaine + projet + étape
 *
 * « Rattacher » n'existe que pour projet/étape : la source est l'arbre déjà
 * affiché, on délègue à la page via `onStartAttach` (sélection inline). Au
 * niveau domaine il n'y a rien à rattacher — un savoir n'appartient qu'à un
 * domaine (23/09/2026) —, la modale ouvre donc directement la création.
 */
export type ManageSkillsContext =
  | { level: 'domain'; domainId: string }
  | {
      level: 'project'
      domainId: string
      projectId: string
      directSkillIds: string[]
    }
  | {
      level: 'step'
      domainId: string
      projectId: string
      /** Compétences déjà déclarées par le projet — la création s'y ajoute. */
      directSkillIds: string[]
      stepId: string
      stepSkillIds: string[]
    }

interface ManageSkillsDialogProps {
  context: ManageSkillsContext
  trigger: ReactNode
  /** Projet/étape : bascule l'arbre de base en mode sélection (piloté par la page). */
  onStartAttach?: () => void
}

type Mode = 'choose' | 'create'

const CREATE_HINT: Record<ManageSkillsContext['level'], string> = {
  domain: 'Une compétence racine dans ce domaine.',
  project: 'Créée dans le domaine et rattachée au projet.',
  step: 'Créée dans le domaine, rattachée au projet et à l’étape.',
}

const ATTACH_HINT: Record<'project' | 'step', string> = {
  project: 'Choisir parmi les compétences du domaine.',
  step: 'Choisir parmi les compétences du projet.',
}

export function ManageSkillsDialog({
  context,
  trigger,
  onStartAttach,
}: ManageSkillsDialogProps) {
  // Au niveau domaine, créer est le seul geste : pas d'écran de choix.
  const initialMode: Mode = context.level === 'domain' ? 'create' : 'choose'
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>(initialMode)

  const createSkill = useCreateSkill()
  const setProjectSkills = useSetProjectSkills()
  const setStepSkills = useSetStepSkills()

  function reset() {
    setMode(initialMode)
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    setOpen(next)
  }

  function onAttachClick() {
    // La source est l'arbre affiché → sélection inline (page).
    onStartAttach?.()
    handleOpenChange(false)
  }

  function fail(err: unknown, fallback: string) {
    toast.error(err instanceof ApiError ? err.message : fallback)
  }

  async function onCreateSubmit(values: SkillFormValues) {
    try {
      const created = await createSkill.mutateAsync({
        domainId: context.domainId,
        body: toSkillPayload(values, null),
      })
      if (context.level === 'project') {
        await setProjectSkills.mutateAsync({
          id: context.projectId,
          skillIds: [...context.directSkillIds, created.id],
        })
      } else if (context.level === 'step') {
        // Déclarée sur le projet AVANT d'être distribuée à l'étape — ce que
        // l'infobulle promettait déjà (« rattachée au projet et à l'étape »)
        // sans que le code le fasse. Une étape ne peut porter que ce que
        // le projet a déclaré : sans ce premier appel, le second est refusé.
        await setProjectSkills.mutateAsync({
          id: context.projectId,
          skillIds: [...context.directSkillIds, created.id],
        })
        await setStepSkills.mutateAsync({
          stepId: context.stepId,
          skillIds: [...context.stepSkillIds, created.id],
        })
      }
      handleOpenChange(false)
      toast.success(`Compétence « ${values.name} » créée`)
    } catch (err) {
      fail(err, 'La création a échoué')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        {mode === 'choose' && context.level !== 'domain' && (
          <>
            <DialogHeader>
              <DialogTitle>Gérer les compétences</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => setMode('create')}
                className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
              >
                <Plus className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <div>
                  <div className="font-medium">
                    Créer une nouvelle compétence
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {CREATE_HINT[context.level]}
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={onAttachClick}
                className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
              >
                <Link2 className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <div>
                  <div className="font-medium">
                    Rattacher une compétence existante
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {ATTACH_HINT[context.level]}
                  </div>
                </div>
              </button>
            </div>
          </>
        )}

        {mode === 'create' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {context.level !== 'domain' && (
                  <button
                    type="button"
                    onClick={() => setMode('choose')}
                    aria-label="Retour"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="size-4" />
                  </button>
                )}
                Nouvelle compétence
              </DialogTitle>
            </DialogHeader>
            <SkillForm submitLabel="Créer" onSubmit={onCreateSubmit} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
