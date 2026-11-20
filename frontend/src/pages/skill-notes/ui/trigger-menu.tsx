import type { Editor } from '@tiptap/core'
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { cn } from '@/shared/lib/utils'

/**
 * Ce que partagent les menus tapés — le « / » des blocs, le « : » des
 * emojis : la fenêtre posée sous le caractère, son habillage et ses lignes.
 * Chaque menu en fournit le contenu et ce que font les touches
 * (`model/use-menu-keys`).
 */

/**
 * La fenêtre du menu, sous la ligne du caractère en `from` — au-dessus s'il
 * n'y a pas la place (`fullHeight`) et qu'elle y est plus. Sa hauteur suit
 * le filtrage en 0,1 s. Aux flèches (`byKeys`), l'entrée active
 * (`[data-active]`) reste visible. `offset` : sa place par rapport au
 * caractère — à gauche (x) et sous la ligne (y) ; celle du « / » par défaut.
 */
export function MenuShell({
  editor,
  area,
  from,
  width,
  fullHeight,
  active,
  byKeys,
  offset = { x: -6, y: 12 },
  children,
}: {
  editor: Editor
  area: HTMLElement
  from: number
  width: number
  fullHeight: number
  active: number
  byKeys: RefObject<boolean>
  offset?: { x: number; y: number }
  children: ReactNode
}) {
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!byKeys.current) return
    byKeys.current = false
    menu.current
      ?.querySelector('[data-active]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active, byKeys])

  // Mesurée, puis posée.
  const content = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = content.current
    if (!el) return
    const measure = () => setHeight(el.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => {
      observer.disconnect()
      setHeight(null)
    }
  }, [from])

  const box = area.getBoundingClientRect()
  const at = editor.view.coordsAtPos(from)
  const roomBelow = window.innerHeight - at.bottom - offset.y
  const above = roomBelow < fullHeight && at.top - 7 > roomBelow
  const left = Math.max(
    0,
    Math.min(at.left - box.left + offset.x, box.width - width - 8),
  )
  const place = above
    ? { bottom: box.bottom - at.top + 7, left }
    : { top: at.bottom - box.top + offset.y, left }

  return (
    <div
      ref={menu}
      className={cn(
        'absolute z-30 overflow-hidden rounded-[10px] bg-popover text-popover-foreground',
        'shadow-[0_0_0_1px_color-mix(in_oklab,var(--foreground)_9%,transparent),0_14px_28px_-6px_oklch(0.21_0.008_285/0.2),0_2px_4px_-1px_oklch(0.21_0.008_285/0.12)]',
        'animate-in fade-in-0 zoom-in-96 animation-duration-200',
        'transition-[height] duration-100',
        above ? 'origin-bottom-left' : 'origin-top-left',
      )}
      style={{
        ...place,
        width,
        maxWidth: box.width,
        height: height ?? undefined,
      }}
    >
      <div ref={content} className="flex flex-col">
        {children}
      </div>
    </div>
  )
}

/** Une ligne du menu : survolée ou choisie au clavier, elle s'éclaire. */
export function MenuRow({
  index,
  current,
  onActive,
  onPick,
  className,
  children,
}: {
  index: number
  current: number
  onActive: (index: number) => void
  onPick: () => void
  /** Sa hauteur, si ce n'est pas celle du « / » (32 px). */
  className?: string
  children: ReactNode
}) {
  return (
    <div
      role="option"
      aria-selected={index === current}
      data-active={index === current ? '' : undefined}
      onMouseDown={(e) => e.preventDefault()}
      // Au mouvement, pas à l'entrée : le défilement au clavier ne doit pas
      // voler la surbrillance.
      onMouseMove={() => index !== current && onActive(index)}
      onClick={onPick}
      className={cn(
        'flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md px-2 transition-[background-color] duration-[20ms] ease-in',
        index === current && 'bg-foreground/[0.055]',
        className,
      )}
    >
      {children}
    </div>
  )
}
