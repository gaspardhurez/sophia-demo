import { useEffect, useRef } from 'react'

import type { NoteQuestion } from '@/entities/note'
import { cn } from '@/shared/lib/utils'

import { useQuestions } from '../../model/questions-context'
import { useQuestionDraft } from '../../model/use-question-draft'
import {
  QuestionFields,
  QuestionMark,
  QuestionSegments,
} from '../question-fields'
import { IDEA_LABEL } from './idea-styles'

/** Le champ quitté (Entrée en fin de réponse) : la question sort de saisie. */
const leave = () => {
  if (document.activeElement instanceof HTMLElement)
    document.activeElement.blur()
}

/**
 * Une question dans « Préparer les questions » (#173, `prod/Notes`) : le rond
 * « ? » (plein : factuelle, cerclé : élaborative), la question en gras, la
 * réponse attendue — ou ses éléments « · » — en gris, tout écrit sur place
 * comme dans le document (`question-fields`). En saisie, un liseré et, sous
 * les champs, les segmentés Factuelle · Élaborative et Réponse · Liste.
 *
 * - `side` : en face des notes, sur fond gris (rayon 8) ; `lit` l'entoure
 *   d'un trait d'accent quand son passage est surligné.
 * - `list` (notes cachées) : sans fond, un peu plus grande.
 *
 * `angle` : la question naît d'une idée centrale (« Écrire la question ») ;
 * son angle s'écrit sous les champs, en rose (« 🧠 Angle : … »), tant
 * qu'elle n'a pas d'énoncé ou qu'on l'écrit — le temps de la visite : il
 * n'est pas enregistré.
 */
export function QuestionCard({
  question,
  variant,
  lit = false,
  angle,
  onHover,
}: {
  question: NoteQuestion
  variant: 'side' | 'list'
  lit?: boolean
  angle?: string
  onHover?: (on: boolean) => void
}) {
  const { takeFocus } = useQuestions()
  const { draft, change } = useQuestionDraft(question)
  const prompt = useRef<HTMLTextAreaElement>(null)

  // Celle qu'on vient d'ajouter (« + Question ») prend le curseur.
  useEffect(() => {
    if (takeFocus(question.id)) prompt.current?.focus()
    // Une fois, à l'arrivée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const side = variant === 'side'
  return (
    <div
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') leave()
      }}
      className={cn(
        'group/question flex rounded-lg px-3 py-2.5 transition-shadow duration-150',
        side ? 'gap-2.5 bg-muted' : 'gap-3',
        lit && 'shadow-[inset_0_0_0_1.5px] shadow-(--note-accent)/43',
        'focus-within:shadow-[inset_0_0_0_1.5px] focus-within:shadow-foreground/35',
      )}
    >
      <QuestionMark
        kind={draft.kind}
        className={side ? 'mt-px size-5 text-[11px]' : 'size-[22px] text-xs'}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <QuestionFields
          draft={draft}
          change={change}
          onLeave={leave}
          promptRef={prompt}
          promptPlaceholder="Ce que tu dois savoir sans tes notes…"
          promptClassName={cn(
            'font-semibold leading-[1.45]',
            side ? 'text-sm' : 'text-[14.5px]',
          )}
          answerClassName={cn(
            'leading-normal text-muted-foreground',
            side ? 'text-[13px]' : 'text-[13.5px]',
          )}
        />
        {angle && (
          <span
            className={cn(
              'text-xs text-pretty',
              IDEA_LABEL,
              draft.prompt.trim() && 'hidden group-focus-within/question:block',
            )}
          >
            🧠 Angle : {angle}
          </span>
        )}
        <QuestionSegments
          draft={draft}
          change={change}
          className="mt-1 hidden flex-wrap gap-1 group-focus-within/question:flex"
        />
      </div>
    </div>
  )
}
