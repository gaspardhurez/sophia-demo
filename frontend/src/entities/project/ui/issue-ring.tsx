import { cn } from '@/shared/lib/utils'

import type { ProjectIssue } from '../model/status'
import { ISSUE_META } from './issue-meta'

/**
 * L'anneau d'issue d'un projet clos (maquette prod/Projet, tweak
 * « issue ») : fond blanc, trait de 1,5 px et icône à la teinte de la sortie.
 *
 * `tile` : 18 px, posé en bas à droite de la tuile de l'en-tête ;
 * `bound` : 28 px, il remplace le drapeau de la borne Fin du plan.
 */
export function IssueRing({
  issue,
  size,
  className,
}: {
  issue: ProjectIssue
  size: 'tile' | 'bound'
  className?: string
}) {
  const { icon: Icon, text, border } = ISSUE_META[issue]
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full border-[1.5px] bg-card',
        size === 'tile' ? 'size-[18px]' : 'size-7',
        text,
        border,
        className,
      )}
    >
      <Icon
        className={size === 'tile' ? 'size-[9px]' : 'size-[13px]'}
        strokeWidth={3}
      />
    </span>
  )
}
