import { X } from 'lucide-react'
import type { ReactNode } from 'react'

/** Les boutons de la ligne « Notes » (`prod/Notes`) : 30 px, cadre fin. */
export const OUTLINED =
  'inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-[7px] border border-border bg-card px-[11px] text-[13px] font-medium whitespace-nowrap text-foreground hover:bg-foreground/[0.03]'

/**
 * Un échec de Sophia, dit en clair (dictée, vérification) : le message en
 * rouge, puis ses recours (« Réessayer », ✕).
 */
export function Notice({
  message,
  children,
}: {
  message: string
  children: ReactNode
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2.5 px-2 text-[13px]"
    >
      <span className="text-destructive">{message}</span>
      {children}
    </div>
  )
}

export function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-[26px] items-center rounded-md border border-border px-[9px] font-medium hover:bg-foreground/[0.03]"
    >
      Réessayer
    </button>
  )
}

/** ✕ : fermer un message d'échec (hors maquette : il ne doit pas rester). */
export function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Fermer"
      onClick={onClick}
      className="grid size-[26px] place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.04]"
    >
      <X className="size-3.5" />
    </button>
  )
}
