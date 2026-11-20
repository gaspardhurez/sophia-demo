import { RefreshCw } from 'lucide-react'
import { type ReactNode, useLayoutEffect, useRef } from 'react'

import { cn } from '@/shared/lib/utils'

import { CARD } from './card-stack'
import { Passages } from './passages'

/**
 * Le recto d'une carte (#103) : on répond **avant de voir**. Rien en tête au
 * 1er passage ; dès le 2ᵉ, la rangée des passages (✕ par échec, ○ pour
 * celui-ci). La question centrée (24 à 30 px). En pied, « Réviser » dès le
 * 3ᵉ passage, puis le champ de deux lignes qui grandit, et **Retourner**
 * (icône ; ⌘ Entrée aussi), qui enregistre le texte et montre le verso.
 * Plus de chip de nature ni de chemin des titres.
 */
export function RectoCard({
  prompt,
  failures,
  list,
  draft,
  onDraft,
  onTurn,
  pending,
  revise,
}: {
  prompt: string
  /** Les passages ratés de cette question. */
  failures: number
  /** Une liste : « Tout ce qui te revient ». */
  list: boolean
  draft: string
  onDraft: (text: string) => void
  onTurn: () => void
  pending: boolean
  /** La rangée « Réviser », dès le 3ᵉ passage. */
  revise?: ReactNode
}) {
  const field = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = field.current
    if (!el) return
    el.style.height = '0'
    el.style.height = `${Math.max(46, el.scrollHeight)}px`
  }, [draft])

  return (
    <div className={cn(CARD, 'min-h-0 flex-1')}>
      {failures > 0 && <Passages failures={failures} current />}
      <div className="grid flex-1 place-items-center px-4 py-6">
        <h2 className="text-center font-heading text-[24px] leading-[1.2] font-semibold tracking-[-0.025em] text-balance sm:text-[28px] lg:text-[30px]">
          {prompt}
        </h2>
      </div>
      {revise}
      <div className="flex items-end gap-2.5 rounded-xl bg-muted/60 py-2 pr-2 pl-3.5">
        <textarea
          ref={field}
          autoFocus
          rows={2}
          aria-label="Ta réponse"
          placeholder={list ? 'Tout ce qui te revient' : 'Ta réponse'}
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              onTurn()
            }
          }}
          className="max-h-60 min-h-[46px] flex-1 resize-none bg-transparent py-[3px] text-sm leading-[1.55] outline-none placeholder:text-muted-foreground/80"
        />
        <button
          type="button"
          aria-label="Retourner la carte"
          title="Retourner (⌘ Entrée)"
          disabled={pending}
          onClick={onTurn}
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground text-background hover:opacity-90 disabled:opacity-50"
        >
          <RefreshCw className="size-3.5" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  )
}
