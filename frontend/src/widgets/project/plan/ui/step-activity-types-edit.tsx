import { toLinkSet, useSetProjectActivityType } from '@/entities/activity-type'
import type { DomainColorClasses } from '@/entities/domain'
import type { Project, ProjectStep } from '@/entities/project'
import { ApiError } from '@/shared/api'
import { Switch, toast } from '@/shared/ui'

/**
 * « Activités types » d'une étape en édition (#38, `kit/Etape`) : un
 * interrupteur par activité type planifiée (Quotidienne ou Hebdomadaire).
 * Éteint, le lien ne pose rien pendant cette étape — pour les jours qu'il n'a
 * pas encore posés ; ce qui est posé ne bouge pas.
 */
export function StepActivityTypesEdit({
  project,
  step,
  color,
}: {
  project: Project
  step: ProjectStep
  color: DomainColorClasses
}) {
  const setLink = useSetProjectActivityType()
  const planned = project.activity_types.filter(
    (link) => link.planning !== 'manual',
  )
  if (planned.length === 0) return null

  return (
    <div className="flex flex-col gap-0.5">
      <div className="mb-2 grid gap-0.5">
        <h4 className="font-heading text-sm font-semibold">Activités types</h4>
        <p className="text-xs text-pretty text-muted-foreground">
          Activée, elle est planifiée automatiquement pendant cette étape.
        </p>
      </div>
      {planned.map((link) => {
        const on = !link.off_step_ids.includes(step.id)
        return (
          <button
            key={link.activity_type_id}
            type="button"
            onClick={() =>
              setLink
                .mutateAsync({
                  projectId: project.id,
                  activityTypeId: link.activity_type_id,
                  body: toLinkSet(link, {
                    off_step_ids: on
                      ? [...link.off_step_ids, step.id]
                      : link.off_step_ids.filter((id) => id !== step.id),
                  }),
                })
                .catch((err) =>
                  toast.error(
                    err instanceof ApiError
                      ? err.message
                      : "L'enregistrement a échoué",
                  ),
                )
            }
            className="flex h-9 min-w-0 items-center gap-2.5 border-t border-border/60 px-0.5 text-left"
          >
            <span className="min-w-0 flex-1 truncate text-xs">
              {link.emoji ? `${link.emoji} ` : ''}
              {link.title}
            </span>
            <span className="flex w-[132px] shrink-0 justify-end pr-[9px]">
              <Switch on={on} onClassName={color.ink} />
            </span>
          </button>
        )
      })}
    </div>
  )
}
