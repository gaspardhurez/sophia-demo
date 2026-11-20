import { Globe } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/shared/lib/utils'

import { looksLikeLink, MENU_SHADOW } from '../lib/link'

/**
 * Le menu de ⌘K (relevé Notion, 13/10) : sous la sélection, centré sur elle,
 * 330 px — un champ « Colle un lien » et, dès que le texte ressemble à une
 * adresse, la ligne « 🌐 adresse · Lien vers une page web ». Entrée ou un
 * clic sur la ligne posent le lien ; Échap renonce. Notion y cherche aussi
 * ses pages : pas nous.
 */
export function LinkMenu({
  initial,
  style,
  onApply,
  onCancel,
}: {
  initial: string
  style: React.CSSProperties
  onApply: (href: string) => void
  onCancel: () => void
}) {
  const [href, setHref] = useState(initial)
  const link = looksLikeLink(href)
  return (
    <div
      role="dialog"
      aria-label="Lien"
      // Le clic ne vole pas la sélection à l'éditeur (le champ, si).
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault()
      }}
      className={cn(
        'notes-palette absolute z-30 flex w-[330px] flex-col gap-1.5 rounded-[10px] border bg-popover px-3 pt-3.5 pb-1.5 text-popover-foreground',
        MENU_SHADOW,
        'animate-in fill-mode-both fade-in animation-duration-100',
      )}
      style={style}
    >
      <input
        autoFocus
        aria-label="Adresse du lien"
        placeholder="Colle un lien"
        value={href}
        onChange={(e) => setHref(e.target.value)}
        onBlur={onCancel}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onApply(href)
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          }
        }}
        className="h-7 w-full rounded-[6px] border bg-muted/40 px-1.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
      />
      {link ? (
        <button
          type="button"
          onClick={() => onApply(href)}
          className="-mx-2 flex min-w-0 items-center gap-2 rounded-[6px] bg-accent px-2 py-1 text-left"
        >
          <Globe className="size-[18px] shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm">{href.trim()}</span>
            <span className="text-xs text-muted-foreground">
              Lien vers une page web
            </span>
          </span>
        </button>
      ) : (
        <span className="h-1.5" />
      )}
    </div>
  )
}
