import { Extension, textblockTypeInputRule } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { Plugin, PluginKey, type TextSelection } from '@tiptap/pm/state'
import { Mapping } from '@tiptap/pm/transform'
import type { EditorView } from '@tiptap/pm/view'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { Code } from 'lucide-react'

import '../code.css'
import { lowlight } from '../code-languages'
import type { BlockSpec } from './types'

/**
 * ` ``` ` en début de ligne : le code dès le 3e accent grave (Notion), sans
 * attendre l'espace de StarterKit.
 *
 * La règle de saisie ne suffit pas : sur un clavier où l'accent grave est une
 * touche morte (AZERTY Mac), le texte arrive par une composition, que TipTap
 * relit avant que ProseMirror ne l'ait intégrée — la règle ne voit jamais les
 * trois accents. On surveille donc aussi le document : un paragraphe qui
 * vient de devenir exactement ` ``` `, curseur au bout, devient du code.
 */
const codeFence = Extension.create({
  name: 'codeFence',
  addInputRules() {
    const type = this.editor.schema.nodes.codeBlock
    return type ? [textblockTypeInputRule({ find: /^```$/, type })] : []
  },
  addProseMirrorPlugins() {
    // Une étape d'historique à part : ⌘Z rend les trois accents tapés.
    const convert = (view: EditorView) => {
      if (view.composing) return
      const { state } = view
      const { $cursor } = state.selection as TextSelection
      const type = state.schema.nodes.codeBlock
      if (!$cursor || !type) return
      const block = $cursor.parent
      if (
        block.type.name !== 'paragraph' ||
        block.textContent !== '```' ||
        $cursor.parentOffset !== 3
      )
        return
      const start = $cursor.before()
      view.dispatch(
        closeHistory(
          state.tr
            .delete(start + 1, start + 4)
            .setBlockType(start, start + 1, type),
        ),
      )
    }
    const watch = new PluginKey<boolean>('codeFenceWatch')
    return [
      new Plugin({
        key: watch,
        // Si la dernière modification vient de la frappe — pas d'un ⌘Z, qui
        // rend ` ``` ` exprès (clé de prosemirror-history : `history$`).
        state: {
          init: () => false,
          apply: (tr, typed) =>
            tr.docChanged ? !tr.getMeta('history$') : typed,
        },
        view: () => ({
          update: (view, prev) => {
            if (!view.state.doc.eq(prev.doc) && watch.getState(view.state))
              queueMicrotask(() => convert(view))
          },
        }),
      }),
    ]
  },
})

/**
 * Un bloc de code nouveau prend le langage du bloc de code au-dessus de lui
 * dans la page (texte brut s'il n'y en a pas) : des notes de Python
 * s'écrivent en Python sans le rechoisir à chaque bloc. Seul un bloc qui
 * naît (menu « / », ` ``` `, « Transformer en », collage sans langage) ;
 * un bloc existant garde le sien, même texte brut, et ⌘Z ne rejoue rien.
 */
const inheritLanguage = Extension.create({
  name: 'codeLanguageInherit',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (trs, oldState, state) => {
          if (!trs.some((t) => t.docChanged)) return null
          if (trs.some((t) => t.getMeta('history$'))) return null
          const type = state.schema.nodes.codeBlock
          if (!type) return null
          const mapping = new Mapping()
          trs.forEach((t) => mapping.appendMapping(t.mapping))
          const back = mapping.invert()
          // Un bloc est nouveau si, avant, sa place n'était pas dans du code.
          const isNew = (pos: number) =>
            oldState.doc.resolve(back.map(pos + 1, -1)).parent.type !== type
          const tr = state.tr
          let above: string | null = null
          state.doc.descendants((node, pos) => {
            if (node.type !== type) return true
            const language = (node.attrs.language as string | null) ?? null
            if (!language && above && isNew(pos))
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                language: above,
              })
            else above = language
            return false
          })
          return tr.docChanged ? tr : null
        },
      }),
    ]
  },
})

/**
 * Le bloc de code. Tab indente de 2 espaces ; Entrée et ⇧Entrée y font un
 * saut de ligne ; on en sort par ⌘Entrée ou par trois Entrée sur des lignes
 * vides en fin de code (cf. `../keymap`).
 *
 * Un langage par bloc (attribut `language`, `../code-languages`) : coloré
 * s'il est connu (Shell, Python), texte brut sinon ; un bloc nouveau prend
 * celui du bloc de code au-dessus (`inheritLanguage`). C'est le
 * bloc de StarterKit avec la coloration de lowlight (même nœud, mêmes
 * commandes, mêmes documents) ; la palette est dans `../code.css`.
 */
export const codeBlockBlock: BlockSpec = {
  name: 'codeBlock',
  nodes: ['codeBlock'],
  starterKit: { codeBlock: false },
  extensions: () => [
    CodeBlockLowlight.configure({
      lowlight,
      enableTabIndentation: true,
      tabSize: 2,
      // Pas de correcteur orthographique dans le code.
      HTMLAttributes: { spellcheck: 'false' },
    }),
    codeFence,
    inheritLanguage,
  ],
  items: [
    {
      id: 'code',
      label: 'Code',
      section: 'blocks',
      aliases: ['code', 'snippet', 'pre'],
      icon: Code,
      markdown: '```',
      action: { kind: 'transform', apply: (c) => c.setCodeBlock() },
    },
  ],
}
