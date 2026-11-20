import type { Notes } from '../model/types'

interface JsonNode {
  type?: string
  text?: string
  content?: JsonNode[]
}

/**
 * Les notes n'ont encore rien : pas de document, ou un document sans texte
 * ni question (la vignette les montre vides, la page s'ouvre curseur posé).
 */
export function notesBlank(notes: Notes): boolean {
  const filled = (node: JsonNode): boolean =>
    node.type === 'question' ||
    Boolean(node.text?.trim()) ||
    (node.content ?? []).some(filled)
  return !notes.doc || !filled(notes.doc as JsonNode)
}

/** Au moins une question complète : l'interro aura de quoi tester. */
export function hasCompleteQuestion(notes: Notes): boolean {
  return notes.questions.some((q) => q.complete)
}
