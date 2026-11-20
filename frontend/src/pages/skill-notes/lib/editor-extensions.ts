import { type Editor, Extension } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import { type Node as PMNode, Slice } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import StarterKit from '@tiptap/starter-kit'

import {
  BLOCKS,
  BODY_CONTAINERS,
  type BlockContext,
  blockOfNode,
  HEADING,
  PARAGRAPH,
} from './blocks'
import { blockSelection } from './block-selection'
import { isItem as isItemNode } from './block-unit'
import { COLUMNS } from './columns'
import { noteExamples } from './examples'
import { notesKeymap } from './keymap'
import { noteMarks } from './marks'
import { pasteMarkdown } from './paste-markdown'
import { noteQuestionAnchors } from './question-anchors'
import { listLevels } from './list-levels'

/**
 * Le schéma des notes (design #88, `prod/Notes`) : une seule page, toujours
 * éditable — **un seul document, comme Notion**. Les titres (H1, H2, H3) ne
 * sont que de la mise en forme : ils ne découpent rien, et du texte peut
 * précéder le premier.
 *
 * Les blocs viennent du registre (`blocks/`) : chaque type y déclare ses
 * extensions ou sa part de StarterKit, et son placeholder.
 */

export { BODY_CONTAINERS, HEADING } from './blocks'

/** Le document : des blocs et des colonnes, vide permis. */
const NotesDocument = Document.extend({
  content: `(block | ${COLUMNS})*`,
})

/**
 * Un collage qui commence par un titre (Notion) garde ce titre : ProseMirror
 * fondrait sinon son texte dans le bloc du curseur.
 */
const pasteTitles = Extension.create({
  name: 'pasteTitles',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          transformPasted: (slice) =>
            slice.openStart > 0 &&
            slice.content.firstChild?.type.name === HEADING
              ? new Slice(slice.content, 0, slice.openEnd)
              : slice,
        },
      }),
    ]
  },
})

/**
 * La spec qui donne son invite à un bloc vide : le plus proche qui en déclare
 * une. Le texte d'un élément de liste dit « Liste » (un bloc rangé sous lui,
 * l'invite du document), celui d'une citation
 * « Citation vide » ; un paragraphe ne dit le sien que dans le document ou une
 * colonne.
 */
function placeholderOf(doc: PMNode, node: PMNode, pos: number) {
  if (node.type.name !== PARAGRAPH)
    return { owner: node, spec: blockOfNode(node.type.name) }
  const $pos = doc.resolve(pos)
  for (let depth = $pos.depth; depth >= 0; depth--) {
    const parent = $pos.node(depth)
    if (BODY_CONTAINERS.has(parent.type.name)) break
    // Un bloc rangé sous un élément (pas son texte, le premier) est un bloc
    // de texte comme un autre : il invite comme dans le document (Notion).
    if (depth === $pos.depth && $pos.index(depth) > 0 && isItemNode(parent))
      break
    const spec = blockOfNode(parent.type.name)
    if (spec?.placeholder) return { owner: parent, spec }
  }
  return { owner: node, spec: blockOfNode(PARAGRAPH) }
}

/** Ce qu'un éditeur règle de son document, au-delà du registre. */
export interface EditorOptions {
  /**
   * L'invite de la **page vierge**, à la place de celle du paragraphe. Lue
   * à chaque rendu des invites : `null` n'invite pas (les notes d'une
   * ressource la taisent pendant qu'on dicte, `prod/Notes`). Qui la change
   * sans transaction relance les invites par `refreshPlaceholders`.
   */
  blankPlaceholder?: () => string | null
}

/** La méta qui relance les invites sans toucher au document. */
const REFRESH_PLACEHOLDERS = 'refreshPlaceholders'

/** Relance les invites (cf. `EditorOptions.blankPlaceholder`). */
export function refreshPlaceholders(editor: Editor) {
  if (editor.isDestroyed) return
  editor.view.dispatch(
    editor.state.tr
      .setMeta(REFRESH_PLACEHOLDERS, true)
      .setMeta('addToHistory', false),
  )
}

/**
 * Les invites des blocs vides, d'après le registre (`placeholder` de chaque
 * spec) : sous le curseur seulement, sauf les titres (`always`) et la page
 * vierge (design #88, « Page vide »), qui invite toujours. Lu dans l'état
 * même — le `Placeholder` de TipTap lit l'éditeur avec une frappe de retard.
 */
const blockPlaceholders = Extension.create<EditorOptions>({
  name: 'blockPlaceholders',
  addOptions() {
    return { blankPlaceholder: undefined }
  },
  addProseMirrorPlugins() {
    const editor = this.editor
    const blankText = this.options.blankPlaceholder
    return [
      new Plugin({
        props: {
          decorations: ({ doc, selection }) => {
            if (!editor.isEditable) return null
            const blank =
              doc.childCount === 1 &&
              doc.firstChild?.type.name === PARAGRAPH &&
              !doc.firstChild.content.size
            const found: Decoration[] = []
            doc.descendants((node, pos) => {
              if (!node.isTextblock) return true
              if (node.content.size) return false
              const { owner, spec } = placeholderOf(doc, node, pos)
              const placeholder = spec?.placeholder
              const here =
                selection.anchor >= pos &&
                selection.anchor <= pos + node.nodeSize
              if (!placeholder || !(placeholder.always || here || blank))
                return false
              const text =
                blank && blankText
                  ? blankText()
                  : typeof placeholder.text === 'string'
                    ? placeholder.text
                    : placeholder.text(owner)
              if (text === null) return false
              found.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  class: 'is-empty',
                  'data-placeholder': text,
                }),
              )
              return false
            })
            return DecorationSet.create(doc, found)
          },
        },
      }),
    ]
  },
})

/** Les vues React des blocs (`BlockContext`) : question, image… */
export function editorExtensions(
  ctx: BlockContext,
  options: EditorOptions = {},
) {
  return [
    NotesDocument,
    StarterKit.configure({
      document: false,
      // Toujours un paragraphe où écrire en fin de document.
      trailingNode: { node: PARAGRAPH },
      horizontalRule: false,
      // Un clic ouvre le lien dans un nouvel onglet (Notion) ; le modifier
      // passe par la bulle du survol (`LinkHover`).
      link: { openOnClick: true },
      ...Object.assign({}, ...BLOCKS.map((b) => b.starterKit ?? {})),
    }),
    ...BLOCKS.flatMap((b) => b.extensions?.(ctx) ?? []),
    ...noteMarks,
    ...noteExamples,
    ...noteQuestionAnchors,
    ...notesKeymap,
    blockSelection,
    pasteTitles,
    pasteMarkdown,
    blockPlaceholders.configure(options),
    listLevels,
  ]
}
