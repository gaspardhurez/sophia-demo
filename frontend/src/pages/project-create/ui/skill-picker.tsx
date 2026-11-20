import { useEffect } from 'react'

import { domainColor } from '@/entities/domain'
import type { Project } from '@/entities/project'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui'
import { ProjectSkillMaps } from '@/widgets/skill-tree'

import { otherLayerOpen } from '../lib/layers'

/**
 * « Choisir les savoirs » (design #33) : l'arbre du domaine en plein écran,
 * en mode rattachement, par-dessus la modale de création. Chaque lien rattache
 * ou détache tout de suite ; « Terminer » referme.
 */
export function SkillPicker({
  project,
  domain,
  onClose,
}: {
  project: Project
  domain?: { id: string; emoji: string | null; color: string | null }
  onClose: () => void
}) {
  const n = project.learning.length

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || otherLayerOpen()) return
      // Échap dans le champ « Nouveau savoir » annule la saisie, pas le choix.
      if (e.target instanceof HTMLInputElement) return
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[45] flex bg-[oklch(0.21_0.008_285/0.35)] p-4">
      <div
        role="dialog"
        aria-label="Choisir les savoirs"
        className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-card shadow-[0_24px_48px_-12px_oklch(0.21_0.008_285/0.3)]"
      >
        <div className="flex shrink-0 items-center gap-2.5 border-b px-[18px] py-3.5">
          <span
            aria-hidden
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-lg border text-base',
              domainColor(domain?.color).soft,
            )}
          >
            {domain?.emoji}
          </span>
          <div className="grid min-w-0 gap-0.5">
            <h4 className="font-heading text-sm font-semibold">
              Choisir les savoirs
            </h4>
            <p className="text-xs text-pretty text-muted-foreground">
              Ceux qu'il faudra avoir acquis pour valider le projet.
            </p>
          </div>
          {n > 0 && (
            <span className="ml-auto text-[13px] text-muted-foreground tabular-nums">
              {n} savoir{n > 1 ? 's' : ''}
            </span>
          )}
          <Button
            className={cn('text-xs font-semibold', n === 0 && 'ml-auto')}
            onClick={onClose}
          >
            Terminer
          </Button>
        </div>
        <div className="min-h-0 flex-1 p-4">
          <ProjectSkillMaps project={project} mode="edit" picker />
        </div>
      </div>
    </div>
  )
}
