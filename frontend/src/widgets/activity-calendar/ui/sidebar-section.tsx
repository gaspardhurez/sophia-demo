import { ChevronDown } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { cn } from '@/shared/lib/utils'

const KEY = 'sophia.calendar.collapsed'

function readCollapsed(id: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]).includes(
      id,
    )
  } catch {
    return false
  }
}

function writeCollapsed(id: string, collapsed: boolean) {
  try {
    const all = new Set(
      JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[],
    )
    if (collapsed) all.add(id)
    else all.delete(id)
    localStorage.setItem(KEY, JSON.stringify([...all]))
  } catch {
    // Stockage indisponible : le repli vaut pour la visite.
  }
}

/**
 * Une section de la colonne du calendrier (19/11) : son titre en petites
 * capitales se clique pour la replier ou la déplier ; le chevron n'apparaît
 * qu'au survol du titre (ou au focus clavier). Le repli se retient dans le
 * navigateur, section par section. `openOn` la rouvre quand le contexte
 * change (20/11 : choisir un domaine rouvre « Projets du moment »).
 */
export function SidebarSection({
  id,
  title,
  openOn,
  children,
  className,
}: {
  /** La clé du repli retenu. */
  id: string
  /** Quand cette valeur change et n'est pas vide, la section se déplie
   *  (et le retient) : un domaine choisi rouvre les projets. */
  openOn?: string
  title: string
  children: ReactNode
  className?: string
}) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(id))
  // Ajusté au rendu, pas dans un effet : la section n'apparaît jamais
  // repliée le temps d'une image.
  const [seen, setSeen] = useState(openOn)
  if (openOn !== seen) {
    setSeen(openOn)
    if (openOn && collapsed) {
      setCollapsed(false)
      writeCollapsed(id, false)
    }
  }
  return (
    <section className={cn('flex flex-col', className)}>
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={() => {
          setCollapsed(!collapsed)
          writeCollapsed(id, !collapsed)
        }}
        className="group/sec mb-2 flex cursor-pointer items-center gap-1 self-start text-[10.5px] font-semibold tracking-[.06em] text-muted-foreground uppercase outline-none hover:text-foreground focus-visible:text-foreground"
      >
        {title}
        <ChevronDown
          aria-hidden
          className={cn(
            'size-3 opacity-0 transition-[opacity,transform] duration-150 group-hover/sec:opacity-100 group-focus-visible/sec:opacity-100',
            collapsed && '-rotate-90',
          )}
        />
      </button>
      {!collapsed && children}
    </section>
  )
}
