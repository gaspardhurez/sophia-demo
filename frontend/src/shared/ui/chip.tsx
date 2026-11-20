import type { ReactNode } from 'react'

import { toneClasses } from '@/shared/lib/units'
import { cn } from '@/shared/lib/utils'

/** Teintes sémantiques réutilisables pour les pilules d'état. */
export type ChipTone =
  'neutral' | 'emerald' | 'sky' | 'violet' | 'amber' | 'orange' | 'rose'

/**
 * Les teintes sémantiques, **rendues avec la palette Notion** — la même que les
 * pastilles d'unité.
 *
 * Deux gabarits de pastille cohabitaient : celui-ci (couleurs Tailwind vives) et
 * `UnitPill` (palette Notion basse saturation). Sur la carte d'une activité type ils
 * se retrouvaient **côte à côte**, et le contraste sautait aux yeux. On ne perd
 * rien au passage : le vert dit toujours la réussite, le rouge l'échec — c'est
 * la saturation qui change, pas le sens.
 *
 * Passer par `toneClasses` plutôt que recopier les valeurs : les deux jeux ne
 * peuvent plus diverger.
 */
export const CHIP_TONES: Record<ChipTone, string> = {
  // Seule exception à la palette : `neutral` garde le fond Notion mais le texte
  // doux d'origine (`text-muted-foreground`). Le gris Notion est presque noir —
  // il convient à une *étiquette* qu'on lit, pas à un état qui doit s'effacer
  // (« En pause », « À valider », une période). Un ton neutre qui pèse autant
  // qu'un ton coloré n'est plus neutre.
  neutral: cn(toneClasses('default'), 'text-muted-foreground'),
  emerald: toneClasses('green'),
  sky: toneClasses('blue'),
  violet: toneClasses('purple'),
  amber: toneClasses('yellow'),
  orange: toneClasses('orange'),
  rose: toneClasses('red'),
}

interface ChipProps {
  /** Teinte sémantique. Ignorée si `className` fournit déjà des couleurs. */
  tone?: ChipTone
  className?: string
  title?: string
  children: ReactNode
}

/**
 * Pilule d'état : radius/taille/typo unifiés, couleur par `tone` ou `className`.
 *
 * Gabarit Notion (angles à 3px, hauteur compacte), mais le **texte reste celui
 * d'origine** : `text-xs font-medium`. Une pastille accompagne un titre, elle ne
 * doit pas peser autant que lui — et à cette taille, la graisse moyenne est ce
 * qui la garde lisible sur un fond teinté.
 *
 * **Quand l'utiliser** : pour dire **dans quel état** est un objet — Planifiée,
 * En pause, Atteint, En retard. Pour dire **quel objet c'est** (une unité, une
 * étiquette du référentiel), c'est `UnitPill` : sa couleur est choisie par
 * l'utilisateur, pas déduite d'un sens.
 */
export function Chip({ tone, className, title, children }: ChipProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-[3px] px-2 py-0.5 text-xs font-medium leading-snug',
        tone && CHIP_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
