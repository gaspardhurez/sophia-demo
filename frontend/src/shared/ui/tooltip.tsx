import * as React from 'react'
import { Tooltip as TooltipPrimitive } from 'radix-ui'

import { cn } from '@/shared/lib/utils'

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

/**
 * Infobulle inversée (fond `foreground`, texte `background`).
 *
 * Remplace l'attribut `title=` natif : celui-ci met ~1 s à apparaître, se rend
 * au style du système et ne suit pas le thème. Sur un contrôle sans libellé —
 * une pastille d'activité type — c'est le seul moyen d'en connaître le sens, donc il
 * doit être immédiat et lisible.
 */
function TooltipContent({
  className,
  sideOffset = 6,
  tone = 'dark',
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> & {
  /**
   * `dark` (défaut) : une étiquette, quelques mots sur fond sombre.
   * `card` : une **surface**, quand l'infobulle porte du contenu mis en forme —
   * des barres, des lignes. Le sombre y écraserait les couleurs, et l'écart
   * avec la carte qu'on survole ferait lire deux objets sans rapport.
   */
  tone?: 'dark' | 'card'
}) {
  const onCard = tone === 'card'
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'z-50 rounded-md px-2 py-1 text-xs font-medium shadow-md',
          onCard
            ? 'border bg-card text-foreground'
            : 'bg-foreground text-background',
          'data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          className,
        )}
        {...props}
      >
        {children}
        {/* La flèche suit le fond, sinon elle pointe en noir sous une bulle
            blanche — c'est ce qui trahit une infobulle recolorée à la main. */}
        <TooltipPrimitive.Arrow
          className={onCard ? 'fill-card' : 'fill-foreground'}
        />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
