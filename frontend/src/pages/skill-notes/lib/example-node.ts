import { Node, type NodeViewRenderer } from '@tiptap/core'

/**
 * L'exemple **dans le texte** (décision de l'utilisateur, 17/11) : un
 * encadré posé entre deux blocs, au même dessin que la bulle d'une
 * annotation (`ui/annotation-card`). Il porte tout son contenu — `title`,
 * `text` en Markdown léger (`example-markdown`) — comme l'annotation d'un
 * passage (`examples`) ; il ne s'attache à aucun passage. Un encadré neuf
 * n'a pas de texte : sa vue ouvre le formulaire.
 */
export const EXAMPLE_BOX = 'exampleBox'

export const ExampleBoxNode = Node.create<{ view?: NodeViewRenderer }>({
  name: EXAMPLE_BOX,
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
      // Un collage en fait un autre exemple : un id neuf.
      id: {
        default: null,
        parseHTML: () => crypto.randomUUID(),
        renderHTML: () => ({}),
      },
      title: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-title') ?? '',
        renderHTML: (attrs) => ({ 'data-title': attrs.title }),
      },
      text: {
        default: '',
        parseHTML: (el) => el.textContent ?? '',
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-example-box]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      { ...HTMLAttributes, 'data-example-box': '' },
      node.attrs.text as string,
    ]
  },

  addNodeView() {
    return this.options.view ?? null
  },
})

/** Les encadrés qu'on vient de poser : leur formulaire prend le focus, une
 *  fois (un encadré vide rechargé ne le vole pas). */
const fresh = new Set<string>()
export const markFresh = (id: string) => void fresh.add(id)
export const takeFresh = (id: string | null) => !!id && fresh.delete(id)
