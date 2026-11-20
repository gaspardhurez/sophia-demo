import { Plus, X } from 'lucide-react'
import { type KeyboardEvent, useLayoutEffect, useRef } from 'react'

import type { Domain } from '@/entities/domain'
import type { WishItem } from '@/entities/wish'
import { cn } from '@/shared/lib/utils'

import { DomainBullet } from './domain-bullet'

export type WishTone = 'amber' | 'neutral'

/** Les teintes d'un encadré « liseré » (#215) : ambre pour les envies, gris
 *  pour les engagements. */
const TONES: Record<WishTone, { box: string; title: string; row: string }> = {
  amber: {
    box: 'border-l-amber-500 bg-amber-50/70 dark:bg-amber-500/[.06]',
    title: 'text-amber-700 dark:text-amber-400',
    // Survolée, ou son menu ouvert : la teinte du bloc, plus foncée.
    row: 'hover:bg-amber-100/80 has-data-[state=open]:bg-amber-100/80 dark:hover:bg-amber-500/15 dark:has-data-[state=open]:bg-amber-500/15',
  },
  neutral: {
    box: 'border-l-zinc-300 bg-muted/40 dark:border-l-zinc-600',
    title: 'text-muted-foreground',
    row: 'hover:bg-muted has-data-[state=open]:bg-muted',
  },
}

/**
 * Un encadré de puces qu'on écrit comme un texte (#215, `kit/Envies`) :
 * Entrée coupe la puce au curseur et ouvre la suivante, Retour arrière en
 * début de puce la recolle à la précédente (dans une puce vide, la
 * supprime), ↑ ↓ passent d'une puce à l'autre aux bords.
 *
 * On écrit dans la **vue** (`view` : les puces montrées, en indices dans la
 * liste entière) ; chaque geste réécrit la liste entière. Une puce coupée
 * garde le domaine de celle d'où elle sort ; une puce ajoutée par le « + »
 * ou écrite dans l'encadré vide prend `newDomainId` — le premier domaine
 * choisi, pour qu'elle reste dans la vue.
 */
export function WishBox({
  title,
  placeholder,
  addLabel,
  tone,
  items,
  view,
  domains,
  newDomainId,
  onChange,
  onRemove,
  className,
}: {
  title: string
  /** L'invite de l'encadré vide (« Écrire une envie… »). */
  placeholder: string
  addLabel: string
  tone: WishTone
  /** La liste entière, dans son ordre. */
  items: WishItem[]
  /** Les puces montrées, en indices dans `items`. */
  view: number[]
  domains: Domain[]
  newDomainId: string | null
  onChange: (update: (items: WishItem[]) => WishItem[]) => void
  /** Le × d'une puce : l'appelant la retire (et sait la remettre, ⌘Z). */
  onRemove: (item: WishItem) => void
  className?: string
}) {
  const t = TONES[tone]
  const refs = useRef(new Map<string, HTMLTextAreaElement>())
  // Le curseur à poser après le rendu qui a créé, coupé ou recollé une puce.
  const caret = useRef<{ id: string; pos: number } | null>(null)
  const shown = view.map((i) => items[i])

  useLayoutEffect(() => {
    if (!caret.current) return
    const { id, pos } = caret.current
    caret.current = null
    const el = refs.current.get(id)
    el?.focus()
    el?.setSelectionRange(pos, pos)
  })

  const fresh = (text = ''): WishItem => ({
    id: crypto.randomUUID(),
    text,
    domain_id: newDomainId,
  })

  function add() {
    const item = fresh()
    caret.current = { id: item.id, pos: 0 }
    onChange((list) => [...list, item])
  }

  function patch(id: string, next: Partial<WishItem>) {
    onChange((list) => list.map((i) => (i.id === id ? { ...i, ...next } : i)))
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>, k: number) {
    const el = e.currentTarget
    const { selectionStart: start, selectionEnd: end, value } = el
    const cur = shown[k]
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      const after: WishItem = {
        id: crypto.randomUUID(),
        text: value.slice(end),
        domain_id: cur.domain_id,
      }
      caret.current = { id: after.id, pos: 0 }
      onChange((list) =>
        list.flatMap((i) =>
          i.id === cur.id
            ? [{ ...i, text: value.slice(0, start) }, after]
            : [i],
        ),
      )
    } else if (e.key === 'Backspace' && start === 0 && end === 0) {
      const prev = shown[k - 1]
      if (prev) {
        e.preventDefault()
        caret.current = { id: prev.id, pos: prev.text.length }
        onChange((list) =>
          list
            .filter((i) => i.id !== cur.id)
            .map((i) =>
              i.id === prev.id ? { ...i, text: prev.text + value } : i,
            ),
        )
      } else if (!value) {
        e.preventDefault()
        const next = shown[k + 1]
        if (next) caret.current = { id: next.id, pos: 0 }
        onChange((list) => list.filter((i) => i.id !== cur.id))
      }
    } else if (e.key === 'ArrowUp' && start === 0 && k > 0) {
      e.preventDefault()
      const el2 = refs.current.get(shown[k - 1].id)
      el2?.focus()
      el2?.setSelectionRange(el2.value.length, el2.value.length)
    } else if (
      e.key === 'ArrowDown' &&
      end === value.length &&
      k < shown.length - 1
    ) {
      e.preventDefault()
      const el2 = refs.current.get(shown[k + 1].id)
      el2?.focus()
      el2?.setSelectionRange(0, 0)
    }
  }

  const field =
    'block min-w-0 flex-1 resize-none bg-transparent py-0.5 text-[13px] leading-[1.45] text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground/70'

  return (
    <section
      className={cn(
        'group/box flex flex-col gap-px rounded-[3px_10px_10px_3px] border-l-[3px] py-2 pr-2.5 pl-[9px]',
        t.box,
        className,
      )}
    >
      <h4
        className={cn(
          'mb-1 flex h-[22px] items-center text-[10.5px] font-semibold tracking-[.06em] uppercase',
          t.title,
        )}
      >
        {title}
        <button
          type="button"
          onClick={add}
          aria-label={addLabel}
          title={addLabel}
          className="ml-auto grid size-[22px] place-items-center rounded-[5px] text-muted-foreground opacity-0 transition-opacity group-hover/box:opacity-100 hover:bg-foreground/[.07] hover:text-foreground focus-visible:opacity-100"
        >
          <Plus className="size-3.5" />
        </button>
      </h4>

      {shown.length === 0 ? (
        <div className="flex min-h-6 items-start gap-1.5 pr-6">
          <span className="grid h-[22px] w-5 shrink-0 place-items-center">
            <span className="size-[5px] rounded-full bg-muted-foreground/50" />
          </span>
          <textarea
            rows={1}
            value=""
            placeholder={placeholder}
            onChange={(e) => {
              const text = e.target.value.replace(/\n/g, ' ')
              if (!text) return
              const item = fresh(text)
              caret.current = { id: item.id, pos: text.length }
              onChange((list) => [...list, item])
            }}
            className={field}
          />
        </div>
      ) : (
        shown.map((item, k) => (
          <WishRow
            key={item.id}
            item={item}
            domains={domains}
            hoverClassName={t.row}
            onDomain={(domain_id) => patch(item.id, { domain_id })}
            onRemove={() => onRemove(item)}
          >
            <textarea
              ref={(el) => {
                if (el) refs.current.set(item.id, el)
                else refs.current.delete(item.id)
              }}
              rows={1}
              value={item.text}
              onChange={(e) =>
                patch(item.id, { text: e.target.value.replace(/\n/g, ' ') })
              }
              onKeyDown={(e) => onKeyDown(e, k)}
              className={field}
            />
          </WishRow>
        ))
      )}
    </section>
  )
}

/** Une puce : son domaine à la place du point (bouton au survol), le texte,
 *  et × à droite au survol — sa place est toujours réservée, le texte ne
 *  bouge pas. */
function WishRow({
  item,
  domains,
  hoverClassName,
  onDomain,
  onRemove,
  children,
}: {
  item: WishItem
  domains: Domain[]
  hoverClassName: string
  onDomain: (domainId: string | null) => void
  onRemove: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'group/row relative flex min-h-6 items-start gap-1.5 rounded-[5px] pr-6',
        hoverClassName,
      )}
    >
      <DomainBullet
        domainId={item.domain_id}
        domains={domains}
        onChange={onDomain}
      />
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Supprimer"
        title="Supprimer"
        className="absolute top-0.5 right-0.5 grid size-5 place-items-center rounded-[5px] text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:bg-foreground/[.07] hover:text-destructive focus-visible:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
