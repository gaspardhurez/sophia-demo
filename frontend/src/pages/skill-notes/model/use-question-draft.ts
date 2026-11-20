import { useState } from 'react'

import type { NoteQuestion, QuestionPoint } from '@/entities/note'

import { type QuestionDraft, useQuestions } from './questions-context'

/** Un élément neuf : son id naît avec lui. */
export const newPoint = (): QuestionPoint => ({
  id: crypto.randomUUID(),
  text: '',
})

/**
 * Le brouillon d'une question écrite sur place — dans le document comme dans
 * « Préparer les questions » : écrit ici, enregistré après une pause
 * (`QuestionsState.save`) ; le serveur ne réécrit pas la saisie en cours.
 */
export function useQuestionDraft(question: NoteQuestion) {
  const { save } = useQuestions()
  const [draft, setDraft] = useState<QuestionDraft>(() => ({
    kind: question.kind,
    form: question.form,
    prompt: question.prompt,
    answer: question.answer ?? '',
    points: question.points.length ? question.points : [newPoint()],
  }))
  const change = (patch: Partial<QuestionDraft>) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    save(question.id, next)
  }
  return { draft, change }
}
