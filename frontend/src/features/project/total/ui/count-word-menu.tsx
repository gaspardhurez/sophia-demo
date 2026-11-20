import { MoreHorizontal, RotateCcw } from 'lucide-react'
import { useState } from 'react'

import { type Total, useUpdateTotal } from '@/entities/project'
import { ApiError } from '@/shared/api'
import { pluralOf } from '@/shared/lib/units'
import {
  EmojiField,
  Popover,
  PopoverContent,
  PopoverTrigger,
  toast,
} from '@/shared/ui'

/**
 * Le mot d'un Total au nombre (#58) : « fois » ne dit rien d'un Total qui compte des nuits ou des
 * leçons. Le kebab de la ligne Fois ouvre ce panneau, sur le modèle de celui
 * d'une unité — emoji, singulier, pluriel et son aperçu —, sans étiquette ni
 * teinte. Le réglage est propre à ce Total ; « Revenir à « fois » » l'efface.
 */
export function CountWordMenu({ total }: { total: Total }) {
  const update = useUpdateTotal()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(total.count_name ?? '')
  const [plural, setPlural] = useState(total.count_plural ?? '')

  const patch = (body: {
    count_name?: string | null
    count_plural?: string | null
    count_emoji?: string | null
  }) =>
    update
      .mutateAsync({ totalId: total.id, body })
      .catch((err: unknown) =>
        toast.error(
          err instanceof ApiError ? err.message : "L'enregistrement a échoué",
        ),
      )

  function commitName() {
    const n = name.trim()
    if (n !== (total.count_name ?? '')) void patch({ count_name: n || null })
  }
  function commitPlural() {
    const p = plural.trim()
    if (p !== (total.count_plural ?? ''))
      void patch({ count_plural: p || null })
  }

  const singular = name.trim() || 'fois'
  const set = Boolean(total.count_name || total.count_emoji)
  const field =
    'h-7 min-w-0 rounded-md border border-transparent bg-muted px-2 text-[13px] outline-none placeholder:text-muted-foreground hover:border-border focus:border-foreground/45 focus:bg-card'

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setName(total.count_name ?? '')
          setPlural(total.count_plural ?? '')
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Options de Fois"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" side="right" className="w-[248px] p-0">
        <div className="flex items-center gap-2 px-2.5 pt-2.5 pb-2">
          <EmojiField
            value={total.count_emoji ?? undefined}
            onChange={(emoji) => void patch({ count_emoji: emoji || null })}
            aria-label="Emoji du mot"
            className="size-8 shrink-0 text-[17px]"
          />
          <input
            autoFocus
            aria-label="Singulier"
            value={name}
            placeholder="fois"
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && commitName()}
            className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 font-heading text-[15px] font-semibold outline-none placeholder:text-muted-foreground hover:border-border focus:border-foreground/45"
          />
        </div>

        <div className="grid grid-cols-[56px_minmax(0,1fr)] items-start gap-x-2 gap-y-1 px-2.5 pb-2.5 text-xs">
          <label
            htmlFor={`t-plural-${total.id}`}
            className="leading-7 text-muted-foreground"
          >
            Pluriel
          </label>
          <input
            id={`t-plural-${total.id}`}
            value={plural}
            onChange={(e) => setPlural(e.target.value)}
            onBlur={commitPlural}
            onKeyDown={(e) => e.key === 'Enter' && commitPlural()}
            placeholder={pluralOf(singular)}
            className={field}
          />
          <span />
          <span className="-mt-0.5 mb-1 text-muted-foreground tabular-nums">
            1 {singular} · 12 {plural.trim() || pluralOf(singular)}
          </span>
        </div>

        <div className="border-t border-border p-1">
          <button
            type="button"
            disabled={!set}
            onClick={() => {
              setName('')
              setPlural('')
              void patch({
                count_name: null,
                count_plural: null,
                count_emoji: null,
              })
            }}
            className="flex h-[30px] w-full items-center gap-2 rounded-md px-2 text-left text-[13px] not-disabled:hover:bg-muted disabled:text-muted-foreground disabled:opacity-60"
          >
            <RotateCcw className="size-3.5" />
            Revenir à « fois »
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
