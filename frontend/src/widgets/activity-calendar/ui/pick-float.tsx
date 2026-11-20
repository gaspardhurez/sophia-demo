import { type ReactNode, type RefObject, useEffect, useState } from 'react'

/**
 * La chip « Flottante » du mode liaison (#92, « Aimant ») : elle suit le
 * curseur sur tout le calendrier — bande journée comprise — et se pose dans
 * le coin haut droit de la séance choisissable survolée (`[data-pick]`).
 *
 * Elle écoute la racine du calendrier elle-même : suivre la souris dans
 * l'état du calendrier le ferait se redessiner à chaque pixel.
 */
export function PickFloat({
  rootRef,
  children,
}: {
  rootRef: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  const [at, setAt] = useState<{
    x: number
    y: number
    snap: boolean
  } | null>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const move = (e: MouseEvent) => {
      const box = root.getBoundingClientRect()
      const pick = (e.target as HTMLElement | null)?.closest('[data-pick]')
      if (pick) {
        const r = pick.getBoundingClientRect()
        setAt({
          x: r.right - box.left - 18,
          y: r.top - box.top - 14,
          snap: true,
        })
      } else {
        setAt({
          x: e.clientX - box.left + 10,
          y: e.clientY - box.top + 8,
          snap: false,
        })
      }
    }
    const leave = () => setAt(null)
    root.addEventListener('mousemove', move)
    root.addEventListener('mouseleave', leave)
    return () => {
      root.removeEventListener('mousemove', move)
      root.removeEventListener('mouseleave', leave)
    }
  }, [rootRef])

  if (!at) return null
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-[60] inline-flex h-6 items-center gap-1 rounded-md bg-background px-2 text-xs font-medium whitespace-nowrap text-foreground"
      style={{
        left: at.x,
        top: at.y,
        boxShadow: '0 14px 28px -8px rgba(0,0,0,.4), 0 2px 6px rgba(0,0,0,.12)',
        transform: at.snap ? 'none' : 'translateY(-4px) scale(1.05)',
        transition:
          'left .18s cubic-bezier(.2,.9,.3,1.3), top .18s cubic-bezier(.2,.9,.3,1.3), transform .18s',
      }}
    >
      {children}
    </div>
  )
}
