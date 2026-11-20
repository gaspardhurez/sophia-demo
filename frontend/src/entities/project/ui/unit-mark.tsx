import { cn } from '@/shared/lib/utils'

import type { UnitMark } from '../model/unit-mark'
import { BUILTIN_UNIT_ICONS } from './builtin-unit-icons'

/**
 * La marque d'une unité, rendue comme ÉLÉMENT et non collée dans le libellé :
 * glissé dans la chaîne, un emoji ne peut recevoir aucun style, impose sa
 * propre hauteur de ligne et pend sous les chiffres. Le centrage vient du
 * conteneur (flex centré) ; l'appelant fixe le corps via `className`.
 *
 * L'icône se cale sur la boîte de l'emoji (`1.1em` du corps, comme le menu
 * d'unités : emoji 13 px, icône 14 px) et prend la couleur atténuée du menu.
 */
export function UnitMarkGlyph({
  mark,
  className,
}: {
  mark: UnitMark | null
  className?: string
}) {
  if (!mark) return null
  if (mark.kind === 'emoji')
    return (
      <span aria-hidden className={cn('leading-none', className)}>
        {mark.emoji}
      </span>
    )
  const Icon = BUILTIN_UNIT_ICONS[mark.kind]
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex items-center leading-none text-muted-foreground',
        className,
      )}
    >
      <Icon className="size-[1.1em]" />
    </span>
  )
}
