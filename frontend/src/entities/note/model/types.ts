import type { components } from '@/shared/api'

/**
 * Une question des notes : son contenu. Sa place, c'est le nœud `question`
 * qui la pose dans le document.
 */
export type NoteQuestion = components['schemas']['NoteQuestionRead']
/** La nature : le type de connaissance travaillé — une étiquette. */
export type QuestionKind = components['schemas']['QuestionKind']
/** La forme de la réponse : libre, ou des éléments à mentionner. Elle règle
 *  la correction. */
export type AnswerForm = components['schemas']['AnswerForm']
/** Un élément à mentionner ; son id le suit, même reformulé. */
export type QuestionPoint = components['schemas']['QuestionPoint']

/** Un document TipTap, en JSON. */
export type NotesDoc = Record<string, unknown>

/**
 * Les notes d'un savoir : un seul document (nul s'il n'a jamais été écrit)
 * et ses questions, dans le désordre — leur place est dans le document.
 */
export type Notes = components['schemas']['NotesRead']

/** Le contenu d'une question, tel qu'on l'écrit (création, modification).
 *  Un élément sans id en reçoit un du serveur. */
export type QuestionWrite = components['schemas']['NoteQuestionCreate']
