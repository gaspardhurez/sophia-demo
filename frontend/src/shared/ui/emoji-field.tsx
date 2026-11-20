import { useState } from 'react'
import { EmojiPicker } from 'frimousse'
import { Smile, X } from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

/**
 * Choix d'un emoji.
 *
 * Remplace le champ texte libre : on ne pouvait y saisir n'importe quoi, et
 * rien ne garantissait que le contenu soit un emoji.
 *
 * Les données viennent de `public/emoji/fr/` et non du CDN par défaut de
 * frimousse : Sophia est local-first, le sélecteur doit marcher hors-ligne.
 * Voir le script `emoji:sync` pour les resynchroniser après une mise à jour
 * d'`emojibase-data`.
 */
interface EmojiFieldProps {
  value?: string
  onChange: (emoji: string) => void
  id?: string
  disabled?: boolean
  'aria-invalid'?: boolean
  'aria-label'?: string
  /** Surcharge du déclencheur : il prend toute la largeur par défaut, ce qui
   *  vaut dans un formulaire mais pas à côté d'un titre. */
  className?: string
}

export function EmojiField({
  value,
  onChange,
  id,
  disabled,
  'aria-invalid': ariaInvalid,
  'aria-label': ariaLabel = 'Choisir un emoji',
  className,
}: EmojiFieldProps) {
  const [open, setOpen] = useState(false)

  return (
    // `modal` est indispensable ici : le champ vit dans un Dialog, dont le
    // react-remove-scroll bloque la molette hors de son sous-arbre — or le
    // contenu du popover est porté dans <body>. En mode modal, le popover pose
    // son propre verrou en autorisant son contenu, et la liste redéfile.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-invalid={ariaInvalid}
          aria-label={value ? `Emoji : ${value}` : ariaLabel}
          // Même grammaire que `Input` : surface blanche, bordure qui fonce au
          // survol puis à l'ouverture, aucun halo.
          className={cn(
            'flex h-9 w-full items-center justify-center rounded-lg border border-input bg-card text-xl outline-none',
            'transition-[border-color] duration-300',
            'hover:border-ring data-[state=open]:border-foreground/45',
            'disabled:pointer-events-none disabled:bg-muted disabled:opacity-60',
            'aria-invalid:border-destructive',
            className,
          )}
        >
          {value || <Smile className="size-4 text-muted-foreground" />}
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0">
        <EmojiPickerPanel
          value={value}
          onPick={(emoji) => {
            onChange(emoji)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

/**
 * Le sélecteur lui-même — recherche, catégories, « retirer » quand il y a une
 * valeur —, sans déclencheur : celui du champ, ou l'icône d'un encadré des
 * notes. `onPick('')` : l'emoji retiré.
 */
export function EmojiPickerPanel({
  value,
  onPick,
}: {
  value?: string
  onPick: (emoji: string) => void
}) {
  return (
    <EmojiPicker.Root
      locale="fr"
      emojibaseUrl="/emoji"
      columns={9}
      onEmojiSelect={({ emoji }) => onPick(emoji)}
      className="isolate flex h-[21rem] w-fit flex-col bg-popover"
    >
      <div className="flex items-center gap-1 border-b border-border p-2">
        <EmojiPicker.Search
          autoFocus
          placeholder="Rechercher…"
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-card px-2.5 text-sm outline-none transition-[border-color] duration-300 placeholder:text-muted-foreground hover:border-ring focus:border-foreground/45"
        />
        {value && (
          <button
            type="button"
            onClick={() => onPick('')}
            aria-label="Retirer l'emoji"
            title="Retirer l'emoji"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <EmojiPicker.Viewport className="relative flex-1 outline-none">
        <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Chargement…
        </EmojiPicker.Loading>
        <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Aucun emoji.
        </EmojiPicker.Empty>
        <EmojiPicker.List
          className="pb-1.5"
          components={{
            CategoryHeader: ({ category, ...props }) => (
              <div
                className="bg-popover px-3 pt-3 pb-1.5 font-heading text-xs font-semibold text-muted-foreground"
                {...props}
              >
                {category.label}
              </div>
            ),
            Row: ({ children, ...props }) => (
              <div className="scroll-my-1.5 px-1.5" {...props}>
                {children}
              </div>
            ),
            Emoji: ({ emoji, ...props }) => (
              <button
                className={cn(
                  'flex size-8 items-center justify-center rounded-md text-lg',
                  emoji.isActive && 'bg-muted',
                )}
                {...props}
              >
                {emoji.emoji}
              </button>
            ),
          }}
        />
      </EmojiPicker.Viewport>
    </EmojiPicker.Root>
  )
}
