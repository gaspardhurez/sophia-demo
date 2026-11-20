import { Extension, Mark } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'

import type { NoteQuestion } from '@/entities/note'

import { HEADING, PARAGRAPH } from './blocks'
import { exampleDraftOf, markedPassages, withoutDraft } from './examples'

/**
 * **Les ancres des questions** (#213) : une question est une annotation,
 * comme un exemple — attachée à un passage, à un bloc entier, ou au titre de
 * sa section. Son contenu et l'historique de l'interro restent en table
 * (`note_questions`) ; le document ne porte que **l'id**, à sa place :
 *
 * - sur un passage, la marque `questionRef` — plusieurs peuvent se
 *   chevaucher (une marque n'exclut pas les autres) ;
 * - sur un bloc entier, ou un titre pour une question de section, l'attribut
 *   `questions` (une liste d'ids, non recopiée à la coupure du bloc).
 *
 * Le serveur les lit pour l'ordre de l'interro et la section de chaque
 * question (`domain/notes.py`, `question_places`). Déclarées ici d'abord
 * pour que l'éditeur les **garde** : une marque ou un attribut inconnus
 * tomberaient au chargement, et l'enregistrement les effacerait.
 */

export const QUESTION_REF = 'questionRef'
export const QUESTIONS = 'questions'

/** La marque d'un passage interrogé : l'id de sa question, sans rien dessiner. */
export const QuestionRefMark = Mark.create({
  name: QUESTION_REF,
  // Une frappe au bord du passage ne l'allonge pas.
  inclusive: false,
  // Plusieurs questions sur un même texte.
  excludes: '',

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-question-ref'),
        renderHTML: (attrs) => ({ 'data-question-ref': attrs.id as string }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-question-ref]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0]
  },
})

/** Les questions d'un bloc entier, ou d'une section sur son titre. */
const blockQuestions = Extension.create({
  name: 'blockQuestions',
  addGlobalAttributes() {
    return [
      {
        types: [PARAGRAPH, HEADING],
        attributes: {
          [QUESTIONS]: {
            default: null,
            keepOnSplit: false,
            parseHTML: () => null,
            renderHTML: () => ({}),
          },
        },
      },
    ]
  },
})

/** Une question du document, à sa place. */
export interface PlacedQuestion {
  id: string
  /** Le début du bloc où elle commence, et de celui où elle finit. */
  block: number
  lastBlock: number
  /** Son passage ; pour un bloc ou une section, tout le texte du bloc. */
  from: number
  to: number
  /** Sur le bloc entier, ou sur un titre (`heading`) : toute sa section. */
  whole: boolean
  heading: boolean
}

/**
 * Les questions placées dans le document, dans l'ordre du texte : celles
 * d'un bloc (ou d'une section, sur son titre) d'abord, à début égal, puis
 * celles des passages. Une question n'a qu'une place : la première.
 */
export function questionsIn(doc: PMNode): PlacedQuestion[] {
  const found: PlacedQuestion[] = []
  const seen = new Set<string>()
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const ids: unknown = node.attrs[QUESTIONS]
    for (const id of Array.isArray(ids) ? ids : []) {
      if (typeof id !== 'string' || seen.has(id)) continue
      seen.add(id)
      found.push({
        id,
        block: pos,
        lastBlock: pos,
        from: pos + 1,
        to: pos + node.nodeSize - 1,
        whole: true,
        heading: node.type.name === HEADING,
      })
    }
    return false
  })
  for (const p of markedPassages(doc, QUESTION_REF)) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    found.push({
      id: p.id,
      block: p.block,
      lastBlock: p.lastBlock,
      from: p.from,
      to: p.to,
      whole: false,
      heading: doc.nodeAt(p.block)?.type.name === HEADING,
    })
  }
  return found.sort(
    (a, b) => a.from - b.from || Number(b.whole) - Number(a.whole),
  )
}

/**
 * Pose la question `id` (déjà créée en table) à la place du brouillon en
 * cours : la marque sur son passage, ou l'id dans les questions de son bloc
 * — de son titre, pour une question de section. Le brouillon se ferme.
 */
export function commitQuestionDraft(view: EditorView, id: string) {
  const { state } = view
  const draft = exampleDraftOf(state)
  if (!draft || draft.kind !== 'question') return
  const tr = withoutDraft(state.tr)
  if (draft.whole) {
    const node = state.doc.nodeAt(draft.block)
    if (!node) return
    const ids: unknown = node.attrs[QUESTIONS]
    tr.setNodeAttribute(draft.block, QUESTIONS, [
      ...(Array.isArray(ids) ? ids : []),
      id,
    ])
  } else {
    tr.addMark(
      draft.from,
      draft.to,
      state.schema.marks[QUESTION_REF].create({ id }),
    )
  }
  view.dispatch(tr)
}

/** Les extensions des ancres de questions, à ajouter à celles de l'éditeur. */
export const noteQuestionAnchors = [QuestionRefMark, blockQuestions]

/** La réponse d'une question, ligne par ligne : ses éléments, ou son texte. */
export function answerLines(question: NoteQuestion) {
  return question.form === 'list'
    ? question.points.map((p) => p.text).filter(Boolean)
    : (question.answer ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
}
