import type { ReactNode } from 'react'

/**
 * Le cadre des popovers d'une carte d'activité type (#38) : posé à gauche de
 * la carte (les cartes vivent dans la colonne de droite), tenu dans
 * l'écran ; un clic à côté appelle `onClose`.
 */
export function CardPopover({
  anchor,
  onClose,
  children,
}: {
  anchor: DOMRect
  onClose: () => void
  children: ReactNode
}) {
  const left = Math.max(8, anchor.left - 330)
  const top = Math.max(8, Math.min(anchor.top, window.innerHeight - 480))
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div
        className="fixed z-50 flex w-80 flex-col gap-3 rounded-xl border border-border bg-background p-3 shadow-xl"
        style={{ left, top }}
      >
        {children}
      </div>
    </>
  )
}
