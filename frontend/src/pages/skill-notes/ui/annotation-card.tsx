import { Eye, Pencil, ScanLine, Trash2 } from 'lucide-react'
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'

import type { NoteQuestion } from '@/entities/note'
import { cn } from '@/shared/lib/utils'

import { answerLines } from '../lib/question-anchors'
import { ExampleText } from './example-text'

/**
 * Le contenu d'une annotation, partagé par la bulle de la marge
 * (`annotation-margin`) et l'encadré posé dans le texte (`blocks/
 * example-box-view`, `blocks/question-box-view`) : son en-tête, le corps
 * d'un exemple ou d'une question, ses actions, son formulaire.
 */

/** Le cadre d'une annotation : bord à l'accent (plus marqué épinglée),
 *  ombre douce. La bulle y ajoute sa place ; l'encadré, la largeur du
 *  texte. */
export const CARD =
  'flex flex-col gap-[3px] rounded-lg border bg-popover px-3.5 pt-2.5 pb-3 text-popover-foreground shadow-[0_8px_24px_oklch(0.21_0.008_285/0.12)]'

/** L'étiquette d'une bulle, à l'encre du domaine, et ses actions à droite. */
export function BubbleHead({
  kind,
  actions,
}: {
  kind: string
  actions?: ReactNode
}) {
  return (
    <div className="flex min-h-[22px] items-center gap-1">
      <span className="flex-1 text-[10.5px] font-semibold tracking-[.06em] text-(--note-accent) uppercase">
        {kind}
      </span>
      {actions}
    </div>
  )
}

/**
 * Un exemple : « EXEMPLE », le titre s'il en a un, puis le texte — dans la
 * bulle, au-delà de 300 px il défile, avec un fondu en bas tant qu'il en
 * reste (`capped`). Ses actions : Modifier, Changer le passage (une
 * annotation seulement), Supprimer (confirmé sur place).
 */
export function ExampleBody({
  title,
  text,
  actions,
  capped = true,
  onEdit,
  onMove,
  onRemove,
}: {
  title: string
  text: string
  actions: boolean
  capped?: boolean
  onEdit: () => void
  onMove?: () => void
  onRemove: () => void
}) {
  const body = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)
  const [confirming, setConfirming] = useState(false)

  useLayoutEffect(() => {
    const el = body.current
    if (!el || !capped) return
    const check = () =>
      setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 1)
    check()
    el.addEventListener('scroll', check)
    return () => el.removeEventListener('scroll', check)
  }, [text, confirming, capped])

  if (confirming)
    return (
      <Confirm
        text={
          onMove
            ? 'Supprimer cet exemple ? Le passage reste.'
            : 'Supprimer cet exemple ?'
        }
        onCancel={() => setConfirming(false)}
        onConfirm={onRemove}
      />
    )
  return (
    <>
      <BubbleHead
        kind="Exemple"
        actions={
          actions && (
            <BubbleActions
              onEdit={onEdit}
              onMove={onMove}
              onRemove={() => setConfirming(true)}
            />
          )
        }
      />
      {title && (
        <span className="text-[13.5px] leading-[1.45] font-semibold">
          {title}
        </span>
      )}
      <div
        ref={body}
        className={cn(
          'text-sm leading-[1.6] text-foreground/85',
          capped && 'max-h-[300px] overflow-auto',
          more && 'mask-b-from-80%',
        )}
      >
        <ExampleText text={text} />
      </div>
    </>
  )
}

/**
 * Une question : « QUESTION », l'énoncé, puis « Voir la réponse » — un clic
 * la dévoile sous un filet pointillé, en liste « · » si elle a plusieurs
 * éléments.
 */
export function QuestionBody({
  question,
  actions,
  onEdit,
  onMove,
  onRemove,
}: {
  question: NoteQuestion
  actions: boolean
  onEdit: () => void
  onMove?: () => void
  onRemove: () => void
}) {
  const [seen, setSeen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const lines = answerLines(question)
  if (confirming)
    return (
      <Confirm
        text={
          onMove
            ? 'Supprimer cette question ? Le passage reste.'
            : 'Supprimer cette question ?'
        }
        onCancel={() => setConfirming(false)}
        onConfirm={onRemove}
      />
    )
  return (
    <>
      <BubbleHead
        kind="Question"
        actions={
          actions && (
            <BubbleActions
              onEdit={onEdit}
              onMove={onMove}
              onRemove={() => setConfirming(true)}
            />
          )
        }
      />
      <span className="text-[13.5px] leading-[1.45] font-semibold">
        {question.prompt || 'Question sans énoncé'}
      </span>
      {lines.length > 0 &&
        (seen ? (
          <div className="mt-0.5 flex flex-col gap-0.5 border-t border-dashed pt-1.5 text-sm leading-[1.55] text-foreground/85">
            {lines.map((line, i) => (
              <span key={i}>{lines.length > 1 ? `· ${line}` : line}</span>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSeen(true)}
            className="mt-1 inline-flex h-6 items-center gap-[5px] self-start rounded-md border px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Eye aria-hidden className="size-[13px]" />
            Voir la réponse
          </button>
        ))}
    </>
  )
}

/** Les actions d'une annotation : Modifier, Changer le passage (sans
 *  `onMove`, l'encadré du texte n'en a pas), Supprimer. */
function BubbleActions({
  onEdit,
  onMove,
  onRemove,
}: {
  onEdit: () => void
  onMove?: () => void
  onRemove: () => void
}) {
  return (
    <span data-actions="" className="flex gap-px text-muted-foreground">
      <BubbleAction label="Modifier" onClick={onEdit}>
        <Pencil className="size-[13px]" />
      </BubbleAction>
      {onMove && (
        <BubbleAction label="Changer le passage" onClick={onMove}>
          <ScanLine className="size-[13px]" />
        </BubbleAction>
      )}
      <BubbleAction label="Supprimer" danger onClick={onRemove}>
        <Trash2 className="size-[13px]" />
      </BubbleAction>
    </span>
  )
}

/** La confirmation d'une suppression, dans la bulle : Annuler, Supprimer. */
function Confirm({
  text,
  onCancel,
  onConfirm,
}: {
  text: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13.5px] leading-normal">{text}</span>
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="h-7 rounded-md border px-2.5 text-[12.5px] hover:bg-muted"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="h-7 rounded-md bg-destructive px-3 text-[12.5px] font-medium text-white hover:bg-destructive/90"
        >
          Supprimer
        </button>
      </div>
    </div>
  )
}

/**
 * Le formulaire d'une annotation, dans sa bulle ou son encadré
 * (`kit/Annotations`, « Créer ») : « NOUVEL EXEMPLE » — Titre, Exemple — ou
 * « NOUVELLE QUESTION » — Question, « Réponse · un élément par ligne » —,
 * puis Annuler et Enregistrer. Le champ principal prend le focus
 * (`autoFocus`) ; sans lui, Enregistrer ne fait rien. ⌘Entrée enregistre,
 * Échap renonce.
 */
export function AnnotationForm({
  kind,
  initial,
  autoFocus = true,
  onCancel,
  onSubmit,
}: {
  kind: 'example' | 'question'
  initial: { title: string; text: string } | null
  autoFocus?: boolean
  onCancel: () => void
  onSubmit: (fields: { first: string; second: string }) => Promise<void> | void
}) {
  const example = kind === 'example'
  const [first, setFirst] = useState(initial?.title ?? '')
  const [second, setSecond] = useState(initial?.text ?? '')
  const [saving, setSaving] = useState(false)
  const main = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null)
  // Le texte d'un exemple, l'énoncé d'une question.
  const ready = (example ? second : first).trim().length > 0

  useLayoutEffect(() => {
    const el = main.current
    if (!el || !autoFocus) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [autoFocus])

  async function submit() {
    if (!ready || saving) return
    setSaving(true)
    try {
      await onSubmit({ first, second })
    } finally {
      setSaving(false)
    }
  }

  const label = 'text-[11px] font-medium text-muted-foreground'
  const field =
    'w-full resize-none rounded-md border bg-transparent px-2 py-1.5 text-[13.5px] leading-normal outline-none [field-sizing:content] placeholder:text-muted-foreground/70 focus:border-foreground/45'
  return (
    <div
      className="flex flex-col gap-2"
      // Le curseur peut aller dans les champs (la bulle retient sinon les
      // clics pour garder celui des notes).
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onCancel()
        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          void submit()
        }
      }}
    >
      <BubbleHead
        kind={
          initial
            ? example
              ? 'Exemple'
              : 'Question'
            : example
              ? 'Nouvel exemple'
              : 'Nouvelle question'
        }
      />
      <label className="flex flex-col gap-[3px]">
        <span className={label}>{example ? 'Titre' : 'Question'}</span>
        <input
          ref={example ? undefined : (el) => void (main.current = el)}
          value={first}
          onChange={(e) => setFirst(e.target.value)}
          placeholder={example ? 'Un titre court' : 'Pourquoi… ? Comment… ?'}
          className={cn(field, 'font-semibold')}
        />
      </label>
      <label className="flex flex-col gap-[3px]">
        <span className={cn(label, 'flex justify-between gap-2')}>
          {example ? 'Exemple' : 'Réponse · un élément par ligne'}
          {/* Le Markdown léger du texte (`lib/example-markdown`). */}
          {example && (
            <span className="font-mono font-normal whitespace-nowrap">
              `code` · ```sql · - liste · | tableau |
            </span>
          )}
        </span>
        <textarea
          ref={example ? (el) => void (main.current = el) : undefined}
          value={second}
          onChange={(e) => setSecond(e.target.value)}
          rows={3}
          placeholder={example ? 'Le cas concret…' : 'Ce qu’il faut retrouver'}
          className={cn(field, 'min-h-[4.6em]')}
        />
      </label>
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="h-7 rounded-md border px-2.5 text-[12.5px] hover:bg-muted"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          aria-disabled={!ready || saving}
          className={cn(
            'h-7 rounded-md bg-foreground px-3 text-[12.5px] font-medium text-background',
            (!ready || saving) && 'cursor-default opacity-40',
          )}
        >
          Enregistrer
        </button>
      </div>
    </div>
  )
}

/** Une action de la bulle : 24 × 22 px, son nom en infobulle. */
function BubbleAction({
  label,
  danger = false,
  onClick,
  children,
}: {
  label: string
  danger?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'grid h-[22px] w-6 place-items-center rounded-[5px] transition-colors',
        danger
          ? 'hover:bg-destructive/10 hover:text-destructive'
          : 'hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
