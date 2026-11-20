import type { LucideIcon } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/ui'

import { cn } from '@/shared/lib/utils'

/**
 * Point d'état : la couleur dit, l'infobulle précise.
 *
 * Remplace la pastille à libellé partout où l'état accompagne un titre. Six
 * libellés en toutes lettres — « Dans les temps », « Léger retard » — pesaient
 * plus que le titre qu'ils annotaient, et sur les cartes empilées ils rognaient
 * la largeur du nom. Un point rend la même information à qui la cherche.
 *
 * Le texte reste accessible : `title` pour le survol natif, `sr-only` pour les
 * lecteurs d'écran. Une couleur seule ne dit rien à qui ne la voit pas.
 *
 * **Une icône remplace le point quand l'état est tranché** (atteint, raté).
 * Sans elle, « Atteint » et « Dans les temps » rendaient le même point vert :
 * deux natures d'information confondues en une seule forme. Un point dit *où
 * on en est*, une icône dit *c'est fini*. L'icône reste ronde pour que la
 * rangée garde son alignement — même silhouette, autre statut.
 *
 * Un **rythme** peut porter une carte (#112, `PaceCard`) : elle remplace
 * l'infobulle au survol, avec le même délai. Ce n'est pas une infobulle :
 * elle porte des onglets (#114), on doit pouvoir y entrer. Elle reste donc
 * ouverte tant que la souris est sur la pastille ou sur elle, et se ferme
 * 150 ms après les avoir quittées.
 */
export function StateDot({
  label,
  dotClassName,
  icon: Icon,
  className,
  card,
}: {
  label: string
  dotClassName: string
  /** Rendue à la place du point : réserve aux issues, pas aux rythmes. */
  icon?: LucideIcon
  className?: string
  /** Au survol, à la place du libellé : la carte de rythme. */
  card?: ReactNode
}) {
  const dot = (
    <>
      {Icon ? (
        <Icon aria-hidden className={cn('size-3.5', dotClassName)} />
      ) : (
        <span aria-hidden className={cn('size-2 rounded-full', dotClassName)} />
      )}
      <span className="sr-only">{label}</span>
    </>
  )
  if (card)
    return (
      <HoverCard card={card} className={className}>
        {dot}
      </HoverCard>
    )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn('inline-flex shrink-0 items-center', className)}
          title={label}
        >
          {dot}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Le délai des infobulles (`TooltipProvider`), et celui de la fermeture. */
const OPEN_DELAY = 200
const CLOSE_DELAY = 150

/**
 * Une carte ouverte au **survol** et qu'on peut atteindre : la pastille et la
 * carte forment une seule zone — passer de l'une à l'autre ne la ferme pas.
 * Au clavier, le focus sur la pastille l'ouvre, Échap la ferme. Le clic ne
 * fait rien de plus qu'avant (la pastille vit souvent dans un lien).
 */
export function HoverCard({
  card,
  className,
  children,
}: {
  card: ReactNode
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const later = (next: boolean, delay: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(next), delay)
  }
  const enter = () => later(true, open ? 0 : OPEN_DELAY)
  const leave = () => later(false, CLOSE_DELAY)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span
          tabIndex={0}
          className={cn('inline-flex shrink-0 items-center', className)}
          onPointerEnter={enter}
          onPointerLeave={leave}
          onFocus={() => later(true, 0)}
          onBlur={leave}
        >
          {children}
        </span>
      </PopoverAnchor>
      <PopoverContent
        side="bottom"
        align="start"
        collisionPadding={8}
        className="overflow-visible rounded-none border-0 bg-transparent p-0 shadow-none"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerEnter={enter}
        onPointerLeave={leave}
        onFocus={() => later(true, 0)}
        onBlur={leave}
        // Rendue dans un portail, la carte fait remonter ses clics à travers
        // l'arbre React — jusqu'au lien de la carte de projet.
        onClick={(e) => e.stopPropagation()}
      >
        {card}
      </PopoverContent>
    </Popover>
  )
}
