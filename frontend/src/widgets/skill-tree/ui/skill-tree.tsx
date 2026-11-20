import '@xyflow/react/dist/style.css'

import { ReactFlowProvider } from '@xyflow/react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'

import { useSkills } from '@/entities/skill'
import { cn } from '@/shared/lib/utils'
import { Skeleton, SkeletonRegion } from '@/shared/ui'

import { SkillTreeCanvas } from './skill-tree-canvas'

interface SkillTreeProps {
  domainId: string
  domainName: string
  /** Lecture seule : pas de dnd ni d'actions sur les nœuds. */
  readOnly?: boolean
  /** Réduit l'arbre à ces compétences + ancêtres (grisés), pour un focus. */
  focusSkillIds?: readonly string[]
  /** Picker : compétences cochées ; défini avec `onToggleSkill`. */
  selectedSkillIds?: Set<string>
  /** Picker : si fourni, seules ces compétences sont cochables. */
  selectableSkillIds?: Set<string>
  /** Picker : bascule la sélection d'une compétence au clic. */
  onToggleSkill?: (skillId: string) => void
  /** Picker : teinte d'un nœud rattaché. Défaut : la primaire. */
  accentClassName?: string
  /** Ouvre un savoir : clic sur une feuille, ou « Ouvrir la fiche » au clic
   *  droit. La page hôte décide quoi en faire (panneau latéral, navigation). */
  onOpenSkill?: (skillId: string) => void
  /** Action rendue en overlay haut-droite du bloc — ex. « Modifier ». */
  action?: ReactNode
  /** Garde l'action toujours visible (mode sélection) plutôt qu'au survol. */
  persistAction?: boolean
}

export function SkillTree({
  domainId,
  domainName,
  readOnly = false,
  focusSkillIds,
  selectedSkillIds,
  selectableSkillIds,
  onToggleSkill,
  onOpenSkill,
  accentClassName,
  action,
  persistAction = false,
}: SkillTreeProps) {
  const { data: skills, isPending, error } = useSkills(domainId)
  // Plein écran par surcouche plutôt que par l'API Fullscreen du navigateur :
  // l'arbre garde son état React (repli, sélection en cours) et sort par Échap
  // comme n'importe quelle modale.
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    if (!fullscreen) return
    const sortir = (e: KeyboardEvent) =>
      e.key === 'Escape' && setFullscreen(false)
    window.addEventListener('keydown', sortir)
    return () => window.removeEventListener('keydown', sortir)
  }, [fullscreen])
  const focusIds = useMemo(
    () => (focusSkillIds ? new Set(focusSkillIds) : null),
    [focusSkillIds],
  )
  // Focus explicitement vide → rien à montrer, mais on garde l'action pour ajouter.
  const isEmptyFocus = focusSkillIds !== undefined && focusSkillIds.length === 0

  return (
    <div
      className={cn(
        'group relative',
        fullscreen && 'fixed inset-0 z-50 bg-background p-3',
      )}
    >
      {isPending && (
        <SkeletonRegion>
          <Skeleton className="h-[600px] w-full rounded-lg" />
        </SkeletonRegion>
      )}
      {error && (
        <p className="text-destructive">
          Impossible de charger les compétences.
        </p>
      )}

      {skills &&
        (isEmptyFocus ? (
          <div className="flex h-32 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            Aucune compétence liée.
          </div>
        ) : (
          <ReactFlowProvider>
            {/* `h-full` en plein écran : c'est le conteneur qui donne sa
                hauteur, la carte s'y coule. */}
            <SkillTreeCanvas
              skills={skills}
              domainId={domainId}
              domainName={domainName}
              readOnly={readOnly}
              focusIds={focusIds}
              selectedIds={selectedSkillIds ?? null}
              selectableIds={selectableSkillIds ?? null}
              onToggleSelect={onToggleSkill}
              onOpenSkill={onOpenSkill}
              accentClassName={accentClassName}
              fullscreen={fullscreen}
              onToggleFullscreen={() => setFullscreen((v) => !v)}
            />
          </ReactFlowProvider>
        ))}

      {action && skills && (
        <div
          className={cn(
            'absolute right-2 top-2 z-10 shadow-sm transition-opacity',
            persistAction ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        >
          {action}
        </div>
      )}
    </div>
  )
}
