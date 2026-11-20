import { ArrowDownToDot, Merge } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui'

/**
 * Le choix au lâcher d'une séance sur une autre qu'elle peut rejoindre (même
 * domaine, des actes d'apprentissage) : **fusionner** — ses actes et ses
 * projets passent dans celle du dessous, elle disparaît — ou **poser ici**
 * — le déplacement habituel. Deux icônes au point de dépôt ; Échap ou un clic
 * ailleurs n'en fait rien (la séance reste où elle était).
 */
export function MergeAsk({
  x,
  y,
  targetTitle,
  onMerge,
  onPlace,
  onCancel,
}: {
  x: number
  y: number
  targetTitle: string
  onMerge: () => void
  onPlace: () => void
  onCancel: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    const down = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) onCancel()
    }
    window.addEventListener('keydown', key)
    document.addEventListener('mousedown', down, true)
    return () => {
      window.removeEventListener('keydown', key)
      document.removeEventListener('mousedown', down, true)
    }
  }, [onCancel])
  const button =
    'grid size-8 place-items-center rounded-md text-foreground hover:bg-muted [&_svg]:size-4'
  return (
    <div
      ref={box}
      role="menu"
      style={{ left: x + 8, top: y + 8 }}
      className="fixed z-50 flex gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-lg"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            role="menuitem"
            aria-label={`Fusionner dans « ${targetTitle} »`}
            className={button}
            onClick={onMerge}
          >
            <Merge />
          </button>
        </TooltipTrigger>
        <TooltipContent>Fusionner dans « {targetTitle} »</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            role="menuitem"
            aria-label="Poser ici"
            className={button}
            onClick={onPlace}
          >
            <ArrowDownToDot />
          </button>
        </TooltipTrigger>
        <TooltipContent>Poser ici</TooltipContent>
      </Tooltip>
    </div>
  )
}
