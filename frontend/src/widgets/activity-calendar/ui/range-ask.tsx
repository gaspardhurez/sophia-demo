import { CalendarPlus, Clock } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Le choix au lâcher d'un glisser **dans une indisponibilité** (#105,
 * idéation 3g) : un créneau bloqué de cette indisponibilité, ou une activité.
 * Sur le gabarit du choix de fusion (#99) — au point de dépôt, Échap ou un
 * clic ailleurs n'en fait rien —, en entrées nommées. Il s'ouvre à droite et
 * sous le point de dépôt, et passe de l'autre côté quand la fenêtre y manque
 * de place (un dépôt le dimanche).
 */
export function RangeAsk({
  x,
  y,
  unavailabilityLabel,
  onSlot,
  onActivity,
  onCancel,
}: {
  x: number
  y: number
  unavailabilityLabel: string
  onSlot: () => void
  onActivity: () => void
  onCancel: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x + 8, top: y + 8 })
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos({
      left:
        x + 8 + width > window.innerWidth - 8
          ? Math.max(8, x - 8 - width)
          : x + 8,
      top:
        y + 8 + height > window.innerHeight - 8
          ? Math.max(8, y - 8 - height)
          : y + 8,
    })
  }, [x, y])
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
  const item =
    'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted [&_svg]:size-[15px] [&_svg]:text-muted-foreground'
  return (
    <div
      ref={box}
      role="menu"
      data-activity-ui
      style={pos}
      className="fixed z-50 flex min-w-[200px] flex-col rounded-lg border border-border bg-popover p-1 shadow-lg"
    >
      <button type="button" role="menuitem" className={item} onClick={onSlot}>
        <Clock />
        <span className="truncate">Créneau bloqué · {unavailabilityLabel}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={onActivity}
      >
        <CalendarPlus />
        Activité
      </button>
    </div>
  )
}
