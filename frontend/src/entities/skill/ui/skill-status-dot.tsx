import { cn } from '@/shared/lib/utils'

import { SKILL_STATUS_META } from '../model/status'
import type { SkillStatus } from '../model/types'

/**
 * Le statut en pastille — la version d'un badge qui tient sur une ligne déjà
 * pleine. Le libellé passe en infobulle native : l'information n'est pas
 * perdue, elle attend qu'on la demande.
 */
export function SkillStatusDot({
  status,
  className,
}: {
  status: SkillStatus
  className?: string
}) {
  const { label, dotClassName } = SKILL_STATUS_META[status]
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        // `inline-block` : un `<span>` est inline par défaut, et un élément
        // inline **ignore `width` et `height`**. La pastille se réduisait alors à
        // ses bordures sur la hauteur de la ligne — un trait vertical arrondi,
        // pas un rond. Invisible là où elle est fille directe d'un conteneur
        // flex (qui la bloquifie), visible dès qu'elle est imbriquée : d'où un
        // arbre de projet correct et un arbre de domaine strié.
        'inline-block size-2.5 shrink-0 rounded-full',
        dotClassName,
        className,
      )}
    />
  )
}
