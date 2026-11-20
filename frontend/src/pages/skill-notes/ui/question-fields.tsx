import {
  type ComponentProps,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import type { AnswerForm, QuestionKind } from '@/entities/note'
import { cn } from '@/shared/lib/utils'

import type { QuestionDraft } from '../model/questions-context'
import { newPoint } from '../model/use-question-draft'

/**
 * Les pièces d'une question écrite sur place, sur la carte de « Préparer les
 * questions » (`prepare-questions/`) : les champs (question, réponse ou éléments), le
 * rond « ? » et les segmentés ; le brouillon vient de `useQuestionDraft`.
 * Chacun les dispose à sa façon ; le comportement — Entrée, retour arrière,
 * ce qui s'enregistre — reste le même partout.
 */

/** Le rond « ? » : plein pour une factuelle, cerclé pour une élaborative. */
export function QuestionMark({
  kind,
  className,
}: {
  kind: QuestionKind
  className?: string
}) {
  const factual = kind === 'factual'
  return (
    <span
      title={factual ? 'Factuelle' : 'Élaborative'}
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-bold',
        factual
          ? 'bg-foreground text-background'
          : 'border-[1.5px] border-foreground',
        className,
      )}
    >
      ?
    </span>
  )
}

/**
 * Les champs d'une question : la question, puis la réponse attendue (une
 * ligne) ou un élément par ligne. Entrée dans la question passe à la
 * réponse ; Entrée dans la réponse appelle `onLeave`. Dans une liste, Entrée
 * ajoute un élément, Entrée sur un dernier élément vide le retire et appelle
 * `onLeave`, retour arrière sur un élément vide le retire.
 */
export function QuestionFields({
  draft,
  change,
  onLeave,
  promptRef,
  promptPlaceholder = 'Écris la question',
  promptClassName = 'font-semibold',
  answerClassName = 'text-muted-foreground',
  masked,
}: {
  draft: QuestionDraft
  change: (patch: Partial<QuestionDraft>) => void
  onLeave: () => void
  promptRef?: RefObject<HTMLTextAreaElement | null>
  promptPlaceholder?: string
  promptClassName?: string
  answerClassName?: string
  /** Rendu **à la place** de la réponse quand elle est masquée (#150). */
  masked?: ReactNode
}) {
  const answer = useRef<HTMLTextAreaElement>(null)
  const points = useRef<(HTMLTextAreaElement | null)[]>([])
  const [focusPoint, setFocusPoint] = useState<number | null>(null)
  useEffect(() => {
    if (focusPoint === null) return
    points.current[focusPoint]?.focus()
    setFocusPoint(null)
  }, [focusPoint])

  const list = draft.form === 'list'
  const toAnswer = () => (list ? setFocusPoint(0) : answer.current?.focus())

  return (
    <>
      <Field
        ref={promptRef}
        aria-label="Question"
        placeholder={promptPlaceholder}
        value={draft.prompt}
        onChange={(prompt) => change({ prompt })}
        onEnter={toAnswer}
        className={promptClassName}
      />
      {masked ??
        (!list ? (
          <Field
            ref={answer}
            aria-label="Réponse attendue"
            placeholder="Réponse attendue"
            value={draft.answer}
            onChange={(answer) => change({ answer })}
            onEnter={onLeave}
            className={answerClassName}
          />
        ) : (
          draft.points.map((point, i) => (
            <div key={point.id} className={cn('flex gap-1.5', answerClassName)}>
              <span aria-hidden>·</span>
              <Field
                ref={(el) => {
                  points.current[i] = el
                }}
                aria-label={`Élément à mentionner ${i + 1}`}
                placeholder="Un élément à mentionner"
                value={point.text}
                onChange={(text) =>
                  change({ points: draft.points.with(i, { ...point, text }) })
                }
                // Entrée : un élément de plus ; sur un dernier élément vide,
                // on sort de la question.
                onEnter={() => {
                  if (
                    !point.text.trim() &&
                    i === draft.points.length - 1 &&
                    i > 0
                  ) {
                    change({ points: draft.points.slice(0, i) })
                    onLeave()
                    return
                  }
                  change({
                    points: draft.points.toSpliced(i + 1, 0, newPoint()),
                  })
                  setFocusPoint(i + 1)
                }}
                onKeyDown={(e) => {
                  if (
                    e.key !== 'Backspace' ||
                    point.text ||
                    draft.points.length < 2
                  )
                    return
                  e.preventDefault()
                  change({ points: draft.points.toSpliced(i, 1) })
                  setFocusPoint(Math.max(0, i - 1))
                }}
              />
            </div>
          ))
        ))}
    </>
  )
}

const KINDS: { value: QuestionKind; label: string }[] = [
  { value: 'factual', label: 'Factuelle' },
  { value: 'elaborative', label: 'Élaborative' },
]

const FORMS: { value: AnswerForm; label: string }[] = [
  { value: 'free', label: 'Réponse' },
  { value: 'list', label: 'Liste' },
]

/**
 * Les deux segmentés d'une question en saisie : la nature (Factuelle ·
 * Élaborative, une étiquette) et la forme de la réponse (Réponse · Liste, qui
 * règle la correction). En changer ne perd rien.
 */
export function QuestionSegments({
  draft,
  change,
  className,
}: {
  draft: QuestionDraft
  change: (patch: Partial<QuestionDraft>) => void
  className?: string
}) {
  return (
    <div className={className}>
      <Segmented
        label="Nature"
        options={KINDS}
        value={draft.kind}
        onChange={(kind) => change({ kind })}
      />
      <Segmented
        label="Forme de la réponse"
        options={FORMS}
        value={draft.form}
        onChange={(form) => change({ form })}
      />
    </div>
  )
}

/** Un segmenté compact du bloc en saisie ; il laisse le curseur au champ. */
function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex h-6 gap-0.5 rounded-md bg-background p-0.5 text-[11px] font-semibold shadow-[inset_0_0_0_1px] shadow-border"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          // Le champ garde le curseur : le bloc reste en saisie.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex h-5 cursor-pointer items-center rounded px-1.5',
            value === option.value
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** La hauteur d'un champ ajustée à son texte, tel qu'il se coupe. */
function fitHeight(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = '0'
  el.style.height = `${el.scrollHeight}px`
}

/**
 * Un champ d'une ligne qui s'allonge avec son texte, sans cadre : il se lit
 * comme le texte du bloc. Entrée n'y fait pas de saut de ligne (`onEnter`).
 */
function Field({
  ref,
  value,
  onChange,
  onEnter,
  onKeyDown,
  className,
  ...props
}: Omit<ComponentProps<'textarea'>, 'onChange' | 'ref'> & {
  ref?:
    | RefObject<HTMLTextAreaElement | null>
    | ((el: HTMLTextAreaElement | null) => void)
  value: string
  onChange: (value: string) => void
  onEnter: () => void
}) {
  const inner = useRef<HTMLTextAreaElement | null>(null)
  useLayoutEffect(() => fitHeight(inner.current), [value])
  // La hauteur suit aussi la LARGEUR : le texte se recoupe quand le champ
  // s'élargit ou rétrécit (la question passe en édition, ses chips de type
  // apparaissent ; la police finit de charger). Sans ça, une ligne de plus
  // restait masquée, ou une ligne vide restait de trop.
  useEffect(() => {
    const el = inner.current
    if (!el) return
    let width = el.clientWidth
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      fitHeight(el)
    })
    observer.observe(el)
    void document.fonts?.ready.then(() => fitHeight(el))
    return () => observer.disconnect()
  }, [])
  return (
    <textarea
      {...props}
      ref={(el) => {
        inner.current = el
        if (typeof ref === 'function') ref(el)
        else if (ref) ref.current = el
      }}
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, ' '))}
      onKeyDown={(e) => {
        onKeyDown?.(e)
        if (e.defaultPrevented) return
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault()
          onEnter()
        }
      }}
      className={cn(
        'block w-full resize-none overflow-hidden bg-transparent p-0 outline-none placeholder:text-muted-foreground/70',
        className,
      )}
    />
  )
}
