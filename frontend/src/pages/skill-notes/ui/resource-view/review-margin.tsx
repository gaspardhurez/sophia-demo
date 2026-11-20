import type { Editor } from '@tiptap/core'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import {
  type ReviewComment,
  useDeleteReviewComment,
  useReplyToReviewComment,
  useSetReviewStatus,
} from '@/entities/review'
import { toast } from '@/shared/ui'

import { anchorElement, anchorKnown } from '../../lib/review-anchors'
import { CARD_GAP, placeCards } from '../../lib/review-layout'
import { useCompanionAction } from '../../model/use-companion-action'
import { ReviewCard } from './review-card'
import { SophiaChip } from './review-controls'

/**
 * L'en-tête de la marge, en face de « Notes » (`prod/Notes`) : la pastille
 * « 🧠 Sophia », puis le nombre de commentaires **ouverts**, ou « Tout est
 * résolu ».
 */
export function ReviewMarginHead({ comments }: { comments: ReviewComment[] }) {
  const open = comments.filter((c) => c.status === 'open').length
  return (
    <div className="flex min-h-[30px] items-center gap-2">
      <SophiaChip />
      <span className="text-[12.5px] whitespace-nowrap text-muted-foreground">
        {open
          ? `${open} ${open > 1 ? 'commentaires' : 'commentaire'}`
          : 'Tout est résolu'}
      </span>
    </div>
  )
}

interface Layout {
  tops: Record<string, number>
  bottom: number
  orphans: string[]
}

/**
 * La **marge des commentaires** de Sophia, 320 px à droite des notes d'une
 * ressource, **comme un document partagé** (`prod/Notes`, idéation
 * `Verifier notes` 2a) : chaque carte au niveau de son passage
 * (`placeCards`), l'active calée dessus, les autres écartées ; les cartes
 * glissent d'une place à l'autre (0,2 s).
 *
 * Les places se recalculent quand le texte bouge (chaque transaction de
 * l'éditeur), quand une hauteur change (une image chargée, une carte qui
 * déplie son fil) et au redimensionnement. Un commentaire dont le passage
 * ne se retrouve plus (`missing`) se range **en tête de marge**, dans le
 * flux ; les cartes ancrées ne montent pas au-dessus.
 *
 * `aligned` faux (vue étroite) : pas de place pour la marge à côté des
 * notes — les cartes se suivent sous elles, sans alignement.
 *
 * La marge porte `role="complementary"` : le rectangle de sélection des
 * notes, qui naît d'un appui hors de l'éditeur, la laisse à ses clics.
 */
export function ReviewMargin({
  editor,
  resourceId,
  comments,
  missing,
  activeId,
  onActivate,
  aligned,
}: {
  editor: Editor
  resourceId: string
  comments: ReviewComment[]
  missing: Set<string>
  activeId: string | null
  onActivate: (id: string | null) => void
  aligned: boolean
}) {
  const setStatus = useSetReviewStatus(resourceId)
  const remove = useDeleteReviewComment(resourceId)
  const reply = useReplyToReviewComment(resourceId)
  const replyStatus = useCompanionAction('reply')

  const margin = useRef<HTMLDivElement>(null)
  const stack = useRef<HTMLDivElement>(null)
  const cards = useRef(new Map<string, HTMLDivElement>())
  const [layout, setLayout] = useState<Layout>({
    tops: {},
    bottom: 0,
    orphans: [],
  })

  // En tête : les passages introuvables, et ceux qui n'ont pas d'élément à
  // l'écran (une décoration qu'aucun bloc rendu ne porte) — sans quoi leur
  // carte resterait invisible.
  const unplaced = comments.filter(
    (c) => missing.has(c.id) || layout.orphans.includes(c.id),
  )
  const anchored = comments.filter((c) => !unplaced.includes(c))

  const measure = useCallback(() => {
    const root = margin.current
    if (!root || !aligned || editor.isDestroyed) return
    const base = root.getBoundingClientRect().top
    const floor = stack.current?.offsetHeight
      ? stack.current.offsetHeight + CARD_GAP
      : 0
    const orphans: string[] = []
    const boxes = comments.flatMap((c) => {
      if (missing.has(c.id)) return []
      const anchor = anchorElement(editor, c.id)
      if (!anchor) {
        // Tant que le plugin ne l'a pas reçu, sa marque n'est pas encore là.
        if (anchorKnown(editor, c.id)) orphans.push(c.id)
        return []
      }
      const card = cards.current.get(c.id)
      if (!card) return []
      return [
        {
          id: c.id,
          anchor: anchor.getBoundingClientRect().top - base,
          height: card.offsetHeight,
        },
      ]
    })
    const placed = placeCards(boxes, activeId, floor)
    const next: Layout = {
      tops: Object.fromEntries(
        [...placed.tops].map(([id, top]) => [id, Math.round(top)]),
      ),
      bottom: Math.ceil(placed.bottom),
      orphans,
    }
    setLayout((prev) =>
      JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
    )
  }, [comments, missing, activeId, aligned, editor])

  // Après chaque rendu : une carte a pu changer de hauteur (son fil).
  const measureRef = useRef(measure)
  useLayoutEffect(() => {
    measureRef.current = measure
    measure()
  })

  // Le texte bouge, une hauteur change, la fenêtre aussi : on replace,
  // après que le navigateur a posé le DOM. Réabonné quand le nombre de
  // cartes change (chacune est observée).
  const count = comments.length
  useEffect(() => {
    if (!aligned) return
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => measureRef.current())
    }
    editor.on('transaction', schedule)
    const observer = new ResizeObserver(schedule)
    observer.observe(editor.view.dom)
    cards.current.forEach((card) => observer.observe(card))
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      editor.off('transaction', schedule)
      observer.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [editor, aligned, count])

  /** Active une carte depuis la marge : son passage revient à l'écran. */
  function activate(id: string) {
    onActivate(id)
    const anchor = anchorElement(editor, id)
    if (!anchor) return
    const box = anchor.getBoundingClientRect()
    if (box.top < 64 || box.bottom > window.innerHeight - 32)
      anchor.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  function card(c: ReviewComment) {
    return (
      <ReviewCard
        comment={c}
        active={c.id === activeId}
        missing={missing.has(c.id)}
        reply={{
          available: replyStatus.available,
          reason: replyStatus.reason,
          send: (body) => reply.mutateAsync({ commentId: c.id, body }),
        }}
        onActivate={() => activate(c.id)}
        onResolve={() => {
          if (c.id === activeId) onActivate(null)
          setStatus.mutate(
            { commentId: c.id, status: 'resolved' },
            {
              onError: () =>
                toast.error('Le commentaire n’a pas pu être résolu.'),
            },
          )
        }}
        onReopen={() => {
          activate(c.id)
          setStatus.mutate(
            { commentId: c.id, status: 'open' },
            {
              onError: () =>
                toast.error('Le commentaire n’a pas pu être rouvert.'),
            },
          )
        }}
        onDelete={() => {
          if (c.id === activeId) onActivate(null)
          remove.mutate(c.id, {
            onError: () =>
              toast.error('Le commentaire n’a pas pu être supprimé.'),
          })
        }}
      />
    )
  }

  if (!aligned)
    return (
      <div
        role="complementary"
        aria-label="Commentaires de Sophia"
        className="mt-8 flex flex-col gap-2 px-2"
      >
        <ReviewMarginHead comments={comments} />
        {[...unplaced, ...anchored].map((c) => (
          <div key={c.id}>{card(c)}</div>
        ))}
      </div>
    )

  return (
    <div
      ref={margin}
      role="complementary"
      aria-label="Commentaires de Sophia"
      className="relative"
      style={{ minHeight: layout.bottom + 24 }}
    >
      {unplaced.length > 0 && (
        <div ref={stack} className="flex flex-col gap-2">
          {unplaced.map((c) => (
            <div key={c.id}>{card(c)}</div>
          ))}
        </div>
      )}
      {anchored.map((c) => {
        const top = layout.tops[c.id]
        return (
          <div
            key={c.id}
            ref={(el) => {
              if (el) cards.current.set(c.id, el)
              else cards.current.delete(c.id)
            }}
            className="absolute inset-x-0 transition-[top] duration-200 ease-out"
            // Pas encore placée (son ancre se pose) : invisible, sans saut.
            style={
              top === undefined ? { top: 0, visibility: 'hidden' } : { top }
            }
          >
            {card(c)}
          </div>
        )
      })}
    </div>
  )
}
