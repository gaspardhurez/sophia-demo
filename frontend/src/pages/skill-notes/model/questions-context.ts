import { createContext, useContext } from 'react'

import type {
  AnswerForm,
  NoteQuestion,
  QuestionKind,
  QuestionPoint,
} from '@/entities/note'

/** Une question telle qu'on l'écrit sur place. Un élément né ici reçoit son
 *  id tout de suite : il le garde, même reformulé. */
export interface QuestionDraft {
  kind: QuestionKind
  form: AnswerForm
  prompt: string
  answer: string
  points: QuestionPoint[]
}

/**
 * Ce que la vue d'une question lit de la page : son contenu (le nœud n'en
 * porte que l'id), l'enregistrement de ses modifications, et si elle doit
 * prendre le curseur à son arrivée.
 */
export interface QuestionsState {
  question: (id: string) => NoteQuestion | undefined
  save: (id: string, draft: QuestionDraft) => void
  /** Vrai une fois, pour la question qu'on vient de créer. */
  takeFocus: (id: string) => boolean
  /**
   * Crée une question sans la placer (#213 : c'est l'appelant qui l'ancre
   * dans le document) ; rend son id, nul en cas d'échec. Absent là où l'on
   * ne crée pas de question (les notes d'une ressource).
   */
  create?: (content: {
    prompt: string
    answer: string
  }) => Promise<string | null>
  /**
   * Modifie l'énoncé et la réponse d'une question depuis le formulaire d'une
   * annotation (une réponse sur plusieurs lignes devient une liste) ; sa
   * nature ne change pas.
   */
  update?: (id: string, content: { prompt: string; answer: string }) => void
  /** Supprime une question en table, sans toucher au document ; vrai si
   *  c'est fait. */
  remove?: (id: string) => Promise<boolean>
}

export const QuestionsContext = createContext<QuestionsState>({
  question: () => undefined,
  save: () => {},
  takeFocus: () => false,
})

export const useQuestions = () => useContext(QuestionsContext)
