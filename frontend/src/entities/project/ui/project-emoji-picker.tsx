import { useState } from 'react'

import { cn } from '@/shared/lib/utils'
import {
  EmojiPickerPanel,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui'

/**
 * La tuile d'un projet en édition : un clic ouvre le sélecteur d'emoji.
 * Sans choix, elle montre l'emoji du domaine principal ; « retirer » y revient
 * (`onChange(null)`).
 */
export function ProjectEmojiPicker({
  value,
  fallback,
  className,
  onChange,
}: {
  value: string | null
  /** L'emoji du domaine principal, montré tant que rien n'est choisi. */
  fallback: string | null | undefined
  /** La teinte de la tuile (`domainColor(...).soft`). */
  className?: string
  onChange: (emoji: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Emoji du projet"
          title="Changer l'emoji du projet"
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-[10px] border text-xl transition-[border-color] hover:border-ring data-[state=open]:border-foreground/45',
            className,
          )}
        >
          {value || fallback}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <EmojiPickerPanel
          value={value ?? undefined}
          onPick={(emoji) => {
            onChange(emoji || null)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
