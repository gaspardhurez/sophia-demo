import {
  ObjectiveCheck,
  ObjectiveFrame,
  ObjectiveLabel,
  isProjectOpen,
  type Project,
  useUpdateProject,
} from '@/entities/project'
import { ApiError } from '@/shared/api'
import { fmtShortDate } from '@/shared/lib/date'
import { cn } from '@/shared/lib/utils'
import { toast } from '@/shared/ui'

/**
 * « À la main » (design #27) : un projet sans objectif se déclare atteint.
 * Seul l'interrupteur agit ; la coche le reflète.
 */
export function ManualCard({
  project,
  inkClassName,
}: {
  project: Project
  inkClassName: string
}) {
  const update = useUpdateProject()
  const achieved = project.manual_status === 'achieved'

  async function toggle() {
    try {
      await update.mutateAsync({
        id: project.id,
        body: { status: achieved ? 'todo' : 'achieved' },
      })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Échec')
    }
  }

  return (
    <ObjectiveFrame>
      <div className="flex items-center gap-[9px]">
        <ObjectiveCheck
          done={achieved}
          failed={!isProjectOpen(project.status)}
          inkClassName={inkClassName}
        />
        <ObjectiveLabel>À la main</ObjectiveLabel>
        {achieved && project.achieved_at && (
          <span className="ml-auto text-[13px] text-muted-foreground tabular-nums">
            {fmtShortDate(new Date(project.achieved_at))}
          </span>
        )}
      </div>
      <p className="text-[13px]">Le projet se déclare réussi à la main</p>
      <div className="mt-auto flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={achieved}
          aria-label="Réussi"
          onClick={() => void toggle()}
          className={cn(
            'flex h-[18px] w-[30px] shrink-0 items-center rounded-full p-0.5 transition-colors',
            achieved
              ? cn('justify-end', inkClassName)
              : 'justify-start bg-zinc-300 dark:bg-zinc-600',
          )}
        >
          <span className="size-3.5 rounded-full bg-white shadow-sm" />
        </button>
        <span className="text-xs text-zinc-600 dark:text-zinc-300">Réussi</span>
      </div>
    </ObjectiveFrame>
  )
}
