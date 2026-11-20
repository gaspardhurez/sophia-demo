import { Check, Plus, Trophy, X } from 'lucide-react'
import { useState } from 'react'

import type { Activity } from '@/entities/activity'
import type { Project } from '@/entities/project'
import { cn } from '@/shared/lib/utils'
import { PanelSection, Rule, SectionIconButton } from '@/shared/ui'

/** Une réalisation que la séance prépare, telle que l'activité la lit. */
export type LinkedAchievement = Activity['achievements'][number]

/**
 * **Réalisations** (#92, point 6) : les réalisations que la séance prépare —
 * la case (cochée si la réalisation est faite, en lecture : elle se coche sur
 * le projet), l'emoji, le titre, × au survol pour délier. Lier ne coche rien.
 *
 * Pas d'équivalent dans `kit/Panneau activite` : la section reprend la forme
 * des lignes d'actes de l'Apprentissage, et ses suggestions, les chips
 * pointillées de l'aide au rattachement. Comme les autres, elle n'existe
 * qu'avec une valeur, ou le temps de son ajout (#46) : « Réalisation » dans le
 * « + » de l'en-tête, ou le « + » de la section, propose les réalisations
 * **non cochées** des projets liés, qu'un clic lie.
 */
export function AchievementsSection({
  achievements,
  projects,
  color,
  onAdd,
  onRemove,
  adding,
  onDone,
}: {
  achievements: LinkedAchievement[]
  /** Les projets liés à l'activité : seules leurs réalisations se lient. */
  projects: Project[]
  /** L'encre du domaine, pour la case cochée. */
  color: string
  onAdd: (achievement: LinkedAchievement) => void
  onRemove: (achievement: LinkedAchievement) => void
  /** Le « + » de l'en-tête a choisi « Réalisation » : les propositions s'ouvrent. */
  adding: boolean
  onDone: () => void
}) {
  const [own, setOwn] = useState(false)
  const picking = adding || own

  function close() {
    setOwn(false)
    onDone()
  }

  const linked = new Set(achievements.map((a) => a.id))
  const candidates: LinkedAchievement[] = projects.flatMap((o) =>
    o.achievements
      .filter((a) => !a.done && !linked.has(a.id))
      .map((a) => ({
        id: a.id,
        project_id: o.id,
        title: a.title,
        emoji: a.emoji,
        done: a.done,
      })),
  )

  if (achievements.length === 0 && !picking) return null

  return (
    <>
      <Rule />
      <PanelSection
        icon={Trophy}
        title="Réalisations"
        action={
          !picking && candidates.length > 0 ? (
            <SectionIconButton
              label="Ajouter une réalisation"
              onClick={() => setOwn(true)}
            />
          ) : undefined
        }
        onDismiss={picking ? close : undefined}
      >
        {achievements.map((a) => (
          <div
            key={a.id}
            className="group/ach flex min-h-6 items-center gap-1.5 rounded-md px-2 text-xs text-foreground/75 hover:bg-muted/60"
          >
            {/* La case tient la marge, alignée sur les icônes de section : le
                titre garde la largeur. */}
            <span className="mr-1 grid w-4 shrink-0 place-items-center">
              <span
                aria-label={a.done ? 'Faite' : 'Pas encore faite'}
                className={cn(
                  'grid size-3.5 place-items-center rounded-[4px]',
                  !a.done && 'border border-muted-foreground/50',
                )}
                style={a.done ? { background: color } : undefined}
              >
                {a.done && <Check className="size-2.5 text-white" />}
              </span>
            </span>
            <span>{a.emoji || '🎯'}</span>
            <span
              className={cn(
                'min-w-0 truncate',
                a.done && 'text-muted-foreground line-through',
              )}
            >
              {a.title}
            </span>
            <button
              type="button"
              onClick={() => onRemove(a)}
              aria-label="Délier de la séance"
              title="Délier de la séance"
              // Cachée, elle ne prend aucune place ; elle glisse au survol.
              className="ml-auto grid h-5 w-0 shrink-0 place-items-center overflow-hidden rounded-[5px] text-muted-foreground opacity-0 transition-[width,opacity] duration-150 group-hover/ach:w-5 group-hover/ach:opacity-100 hover:bg-muted hover:text-foreground focus-visible:w-5 focus-visible:opacity-100"
            >
              <X className="size-[13px]" />
            </button>
          </div>
        ))}
        {picking && (
          <div className="flex flex-wrap gap-1.5 pt-1 pr-2 pb-1.5 pl-[34px]">
            {candidates.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  onAdd(a)
                  close()
                }}
                className="inline-flex h-6 max-w-full items-center gap-1 rounded-md border border-dashed border-border bg-background px-2 text-xs text-foreground/75 hover:border-solid hover:text-foreground"
              >
                <Plus className="size-[11px] shrink-0" strokeWidth={2.4} />
                <span className="truncate">
                  {a.emoji || '🎯'} {a.title}
                </span>
              </button>
            ))}
            {candidates.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {projects.length === 0
                  ? 'Lie d’abord un projet à la séance.'
                  : 'Aucune réalisation à préparer.'}
              </p>
            )}
          </div>
        )}
      </PanelSection>
    </>
  )
}
