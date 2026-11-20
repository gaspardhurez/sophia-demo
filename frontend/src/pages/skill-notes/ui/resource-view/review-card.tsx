import { Check, MessageSquare, Trash2 } from 'lucide-react'
import { useState } from 'react'

import {
  REVIEW_KIND_LABEL,
  type ReviewComment,
  replyFailure,
} from '@/entities/review'
import { cn } from '@/shared/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui'

/** « 1 réponse », « 3 réponses ». */
function repliesLabel(n: number): string {
  return `${n} ${n > 1 ? 'réponses' : 'réponse'}`
}

/** Le petit bouton d'icône de l'en-tête d'une carte (✓, corbeille). */
const ICON_BUTTON =
  'grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-(--review-ink) hover:bg-(--review-chip)'

/**
 * Un commentaire de Sophia dans la marge (`prod/Notes`, idéation
 * `Verifier notes` 2a).
 *
 * **Ouvert** : une carte blanche liserée de rose — le type (Inexact, En
 * surface, Oubli, Traduit mot à mot), ✓ **Résoudre**, le message, puis
 * « où regarder » dans la source sur fond rose pâle. Un clic l'**active** :
 * elle se décale de 8 px vers le texte, prend une ombre, se cale sur son
 * passage (la marge écarte les autres), et montre son **fil** et le champ
 * « Répondre… ». Inactive, son fil se résume à son nombre de réponses.
 *
 * **Résolu** (archivé) : replié en une ligne grise « ✓ Résolu · type »,
 * le nombre de réponses à droite ; un clic le rouvre et l'active.
 *
 * Hors maquette : **supprimer** (corbeille, sur la carte active : le
 * commentaire et son fil partent, sans retour) ; un commentaire dont le
 * passage ne se retrouve plus le dit (« Passage introuvable », l'extrait
 * cité) ; les échecs d'une réponse s'écrivent sous le champ.
 */
export function ReviewCard({
  comment,
  active,
  missing,
  reply,
  onActivate,
  onResolve,
  onReopen,
  onDelete,
}: {
  comment: ReviewComment
  active: boolean
  /** Son passage ne se retrouve plus dans les notes. */
  missing: boolean
  reply: {
    available: boolean
    reason: string | null
    send: (body: string) => Promise<unknown>
  }
  onActivate: () => void
  onResolve: () => void
  onReopen: () => void
  onDelete: () => void
}) {
  const kind = REVIEW_KIND_LABEL[comment.kind]
  const count = comment.replies.length

  if (comment.status === 'resolved')
    return (
      <button
        type="button"
        onClick={onReopen}
        title="Rouvrir"
        className="flex h-[30px] w-full cursor-pointer items-center gap-1.5 rounded-[7px] px-2.5 text-left text-[12.5px] text-muted-foreground hover:bg-foreground/[0.04]"
      >
        <Check aria-hidden className="size-3" strokeWidth={2.5} />
        <span className="min-w-0 truncate">Résolu · {kind}</span>
        {count > 0 && (
          <span
            className="ml-auto inline-flex items-center gap-1"
            aria-label={repliesLabel(count)}
          >
            <MessageSquare aria-hidden className="size-3" />
            {count}
          </span>
        )}
      </button>
    )

  return (
    // Un clic n'importe où sur la carte l'active ; ses boutons et son champ
    // gardent leur propre clic.
    <div
      tabIndex={active ? -1 : 0}
      onClick={() => !active && onActivate()}
      onKeyDown={(e) => {
        if (
          e.target === e.currentTarget &&
          (e.key === 'Enter' || e.key === ' ')
        ) {
          e.preventDefault()
          onActivate()
        }
      }}
      className={cn(
        'flex flex-col gap-[7px] rounded-[9px] bg-card px-[13px] py-[11px] outline-none transition-[transform,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-(--review-ring-active)',
        active
          ? '-translate-x-2 shadow-[0_8px_24px_-8px_oklch(0.21_0.008_285/0.25),0_0_0_1px_var(--review-ring-active)]'
          : 'cursor-pointer shadow-[0_0_0_1px_var(--review-ring)]',
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[11.5px] font-bold text-(--review-ink)">
          {kind}
        </span>
        <span className="ml-auto flex gap-0.5">
          {active && (
            <button
              type="button"
              title="Supprimer"
              aria-label="Supprimer le commentaire"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className={ICON_BUTTON}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            title="Résoudre"
            aria-label="Résoudre"
            onClick={(e) => {
              e.stopPropagation()
              onResolve()
            }}
            className={ICON_BUTTON}
          >
            <Check className="size-3.5" strokeWidth={2.5} />
          </button>
        </span>
      </div>
      {missing && (
        <span className="text-[12px] leading-snug text-muted-foreground">
          Passage introuvable :{' '}
          <span className="italic">« {comment.quote} »</span>
        </span>
      )}
      <span className="text-[13.5px] leading-normal text-pretty text-(--review-text)">
        {comment.message}
      </span>
      {comment.where_to_look && (
        <span className="rounded-md bg-(--review-soft) px-[9px] py-1.5 text-[12.5px] leading-[1.45] text-(--review-ink)">
          {comment.where_to_look}
        </span>
      )}
      {active ? (
        <Thread comment={comment} reply={reply} />
      ) : (
        count > 0 && (
          <span className="inline-flex items-center gap-[5px] text-xs font-semibold text-(--review-ink)">
            <MessageSquare aria-hidden className="size-3" />
            {repliesLabel(count)}
          </span>
        )
      )}
    </div>
  )
}

/** Un message du fil : « Toi » ou « 🧠 Sophia », puis le texte. */
function Message({
  sophia,
  children,
  pending = false,
}: {
  sophia: boolean
  children: string
  pending?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-(--review-thread) pt-[7px]">
      <span
        className={cn(
          'text-[11.5px] font-bold',
          sophia ? 'text-(--review-ink)' : 'text-foreground/80',
        )}
      >
        {sophia ? '🧠 Sophia' : 'Toi'}
      </span>
      <span
        className={cn(
          'text-[13px] leading-normal text-pretty text-foreground/85',
          pending && 'animate-pulse text-muted-foreground',
        )}
      >
        {children}
      </span>
    </div>
  )
}

/**
 * Le fil d'une carte active : ses réponses, puis « Répondre… ». Entrée
 * envoie ; ta réponse s'affiche aussitôt, et Sophia **répond dans le fil**
 * (« … » le temps qu'elle écrive). Si elle échoue, ta réponse reste au
 * serveur (502) et le dit ; si rien n'est parti (503, serveur muet), le
 * texte revient dans le champ. Sophia indisponible : le champ grisé, le
 * motif en infobulle — répondre sans elle n'aurait pas de suite.
 */
function Thread({
  comment,
  reply,
}: {
  comment: ReviewComment
  reply: {
    available: boolean
    reason: string | null
    send: (body: string) => Promise<unknown>
  }
}) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function send() {
    const body = draft.trim()
    if (!body || sending !== null || !reply.available) return
    setSending(body)
    setDraft('')
    setError(null)
    try {
      await reply.send(body)
    } catch (err) {
      const failure = replyFailure(err)
      setError(failure.message)
      if (!failure.kept) setDraft(body)
    } finally {
      setSending(null)
    }
  }

  const input = (
    <input
      value={draft}
      disabled={!reply.available || sending !== null}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault()
          void send()
        }
        if (e.key === 'Escape') e.currentTarget.blur()
      }}
      placeholder="Répondre…"
      aria-label="Répondre à Sophia"
      // Pas de focus d'office : activer une carte depuis son passage ne
      // doit pas retirer le curseur des notes.
      className="h-8 w-full rounded-[7px] border border-border bg-card px-2.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-(--review-ring-active) disabled:cursor-default disabled:opacity-50"
    />
  )

  return (
    <>
      {comment.replies.map((r) => (
        <Message key={r.id} sophia={r.author === 'sophia'}>
          {r.body}
        </Message>
      ))}
      {sending !== null && (
        <>
          <Message sophia={false}>{sending}</Message>
          <Message sophia pending>
            …
          </Message>
        </>
      )}
      {!reply.available && reply.reason ? (
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Un champ désactivé ne reçoit pas le survol : l'enveloppe, si. */}
            <span className="block">{input}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-64 text-pretty">
            {reply.reason}
          </TooltipContent>
        </Tooltip>
      ) : (
        input
      )}
      {error && (
        <span role="alert" className="text-[12.5px] text-destructive">
          {error}
        </span>
      )}
    </>
  )
}
