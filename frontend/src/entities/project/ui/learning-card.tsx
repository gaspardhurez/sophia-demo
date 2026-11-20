import { cn } from '@/shared/lib/utils'

import { LEARNING_TINT } from '../model/learning-tint'
import { isProjectOpen } from '../model/status'
import type { Project } from '../model/types'
import {
  ObjectiveCheck,
  ObjectiveFrame,
  ObjectiveLabel,
} from './objective-frame'

/**
 * L'objectif **Apprentissage** (design #27) : un carré par savoir visé, du gris
 * à l'encre en passant par la teinte du domaine selon la phase du cycle. En
 * lecture seulement : les savoirs se règlent dans le plan du projet.
 */
export function LearningCard({
  project,
  inkClassName,
  dotClassName,
}: {
  project: Project
  inkClassName: string
  /** `domainColor(...).dot` — la teinte, dosée par phase. */
  dotClassName: string
}) {
  const skills = project.learning
  const acquired = skills.filter((s) => s.level === 4).length
  const n = skills.length
  return (
    <ObjectiveFrame>
      <div className="flex items-center gap-[9px]">
        <ObjectiveCheck
          done={n > 0 && acquired === n}
          failed={!isProjectOpen(project.status)}
          inkClassName={inkClassName}
        />
        <ObjectiveLabel>Apprentissage</ObjectiveLabel>
        <span className="ml-auto flex items-baseline gap-[5px] tabular-nums">
          <span className="font-heading text-sm leading-none font-semibold">
            {acquired}
          </span>
          <span className="text-[13px] text-muted-foreground">/ {n}</span>
        </span>
      </div>
      <p className="truncate text-[13px]">
        {n} savoir{n > 1 ? 's' : ''} visé{n > 1 ? 's' : ''}
      </p>
      <div className="mt-auto flex h-[34px] flex-wrap content-start gap-[3px] overflow-hidden">
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
    </ObjectiveFrame>
  )
}
