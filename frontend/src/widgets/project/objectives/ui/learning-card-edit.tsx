import { Link as LinkIcon, Trash2 } from 'lucide-react'

import {
  ObjectiveFrame,
  ObjectiveLabel,
  LEARNING_TINT,
  type Project,
  useSetProjectSkills,
} from '@/entities/project'
import { ApiError } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
import { toast } from '@/shared/ui'

/**
 * L'objectif **Apprentissage** en édition — réservé à la création (design #33,
 * kit/Objectif) : la mosaïque des savoirs visés, et le bouton qui ouvre l'arbre
 * du domaine pour les choisir. Sur la page, les savoirs se règlent dans le plan.
 */
export function LearningCardEdit({
  project,
  inkClassName,
  dotClassName,
  onChooseSkills,
  onDiscard,
}: {
  project: Project
  inkClassName: string
  dotClassName: string
  onChooseSkills: () => void
  /** Retire la carte neuve, s'il y en a une. */
  onDiscard?: () => void
}) {
  const setSkills = useSetProjectSkills()
  const skills = project.learning
  const n = skills.length

  async function onDelete() {
    try {
      // Retirer l'objectif, c'est délier tous ses savoirs — étapes comprises.
      if (project.direct_skill_ids.length > 0)
        await setSkills.mutateAsync({ id: project.id, skillIds: [] })
      onDiscard?.()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "L'enregistrement a échoué",
      )
    }
  }

  return (
    <ObjectiveFrame className={n > 0 ? 'hover:border-ring' : undefined}>
      <div className="flex items-center gap-[9px]">
        <ObjectiveLabel editing>Apprentissage</ObjectiveLabel>
        <button
          type="button"
          onClick={() => void onDelete()}
          aria-label="Retirer cet objectif"
          className={cn(
            'ml-auto grid size-6 place-items-center rounded-md text-red-700 transition-opacity hover:bg-red-50',
            n > 0 && 'opacity-0 group-hover/card:opacity-100',
          )}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      {n > 0 && (
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex flex-wrap gap-[3px]">
            {skills.map((s) => (
              <span
                key={s.skill_id}
                title={s.name}
                className={cn(
                  'size-2.5 rounded-[3px]',
                  s.level === 0 && 'bg-muted',
                  s.level > 0 && s.level < 4 && dotClassName,
                  s.level === 4 && inkClassName,
                )}
                style={
                  s.level > 0 && s.level < 4
                    ? { opacity: LEARNING_TINT[s.level] }
                    : undefined
                }
              />
            ))}
          </div>
          <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
            {n} savoir{n > 1 ? 's' : ''}
          </span>
        </div>
      )}
      <button
        type="button"
        onClick={onChooseSkills}
        className="inline-flex h-[30px] items-center gap-1.5 self-start rounded-md border bg-card px-2.5 text-xs font-semibold shadow-xs hover:bg-muted"
      >
        <LinkIcon className="size-3.5" />
        {n > 0 ? 'Modifier les savoirs' : 'Choisir les savoirs'}
      </button>
    </ObjectiveFrame>
  )
}
