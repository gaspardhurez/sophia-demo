import { Extension, Node, type NodeViewRenderer } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'

/**
 * La question, un bloc parmi les autres (design #88, `prod/Notes`) : placée où
 * l'on veut dans le document. Le nœud ne porte que l'id de la question
 * (`note_questions`) ; son contenu — marque, question, réponse, points — vit
 * côté serveur et s'écrit par l'API des questions.
 */
export const QUESTION = 'question'

/**
 * La meta qui autorise une transaction à retirer une question : seule la
 * suppression explicite (menu de la poignée, après le `DELETE`) la pose.
 */
export const REMOVE_QUESTION = 'removeQuestion'

export const QuestionNode = Node.create<{ view?: NodeViewRenderer }>({
  name: QUESTION,
  group: 'block',
  atom: true,
  selectable: true,
  // Le glisser passe par la poignée ⋮⋮ (`BlockHandle`), pas par le bloc.
  draggable: false,

  addOptions() {
    return { view: undefined }
  },

  addAttributes() {
    return {
      // Jamais lu ni écrit dans le HTML : une question ne se duplique pas par
      // copier-coller, et un collage venu d'ailleurs n'en apporte pas.
      id: { default: null, parseHTML: () => null, renderHTML: () => ({}) },
    }
  },

  // Aucune règle de lecture HTML : le presse-papiers ne recrée pas de
  // question (un nœud copié perdrait son lien, ou en doublerait un).
  parseHTML() {
    return []
  },

  // Invisible : la question se lit dans la marge, en annotation (#213).
  renderHTML() {
    return ['div', { 'data-question': '', hidden: '' }]
  },

  addNodeView() {
    return this.options.view ?? null
  },
})

/** Les ids des questions placées dans un document, dans l'ordre. */
export function questionIds(doc: PMNode): string[] {
  const ids: string[] = []
  doc.descendants((node) => {
    if (node.type.name === QUESTION && node.attrs.id)
      ids.push(node.attrs.id as string)
    // Une question n'a pas d'enfant ; un paragraphe n'en contient pas.
    return !node.isTextblock
  })
  return ids
}

/**
 * Le clavier ne supprime jamais une question (choix validé, #88) : retour
 * arrière, Suppr, couper, ou une frappe qui remplace une sélection qui
 * l'englobe — la transaction est refusée. Un déplacement (le glisser retire
 * puis réinsère dans la même transaction) garde l'id : il passe. Seule la
 * meta `REMOVE_QUESTION` autorise un retrait.
 */
export const questionGuard = Extension.create({
  name: 'questionGuard',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        filterTransaction: (tr, state) => {
          if (!tr.docChanged || tr.getMeta(REMOVE_QUESTION)) return true
          const before = questionIds(state.doc)
          if (!before.length) return true
          const after = new Set(questionIds(tr.doc))
          return before.every((id) => after.has(id))
        },
      }),
    ]
  },
})
