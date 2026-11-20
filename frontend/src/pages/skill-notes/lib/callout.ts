import { Extension, Node } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'

import { EmojiPickerPanel } from '@/shared/ui'

import { backspaceOutOf, enterInContainer } from './container-keys'

/**
 * L'encadré (relevé Notion §1.5, revu le 30/10) : une boîte au fond gris
 * doux, rayon 10, 12 px de marge intérieure, 8 px au-dessus et en dessous ;
 * une icône (💡 par défaut, en 21,6 px) dans une zone de 24 × 24 qu'un clic
 * change — n'importe quel emoji, par le sélecteur de l'app ; puis ses blocs
 * enfants — questions comprises. Entrée y crée un enfant : l'encadré ne se
 * termine pas.
 */
export const CALLOUT = 'callout'
export const CALLOUT_ICON = '💡'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      /** Le bloc du curseur entre dans un encadré. */
      setCallout: () => ReturnType
    }
  }
}

/**
 * Le sélecteur d'emojis de l'app (`EmojiPickerPanel` : recherche, toutes les
 * catégories), sous la zone de l'icône ; un choix, un clic dehors ou Échap
 * le ferme.
 */
function iconPicker(anchor: HTMLElement, pick: (icon: string) => void) {
  const box = document.createElement('div')
  box.contentEditable = 'false'
  box.className =
    'absolute top-full left-0 z-40 mt-1 overflow-hidden rounded-[10px] border bg-popover text-popover-foreground shadow-md'
  const root = createRoot(box)
  root.render(
    createElement(EmojiPickerPanel, {
      onPick: (icon: string) => {
        close()
        pick(icon)
      },
    }),
  )
  const outside = (e: MouseEvent) => {
    if (!box.contains(e.target as globalThis.Node)) close()
  }
  const escape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close()
  }
  function close() {
    document.removeEventListener('mousedown', outside, true)
    document.removeEventListener('keydown', escape, true)
    // Démonté hors du rendu en cours : le choix part d'un clic dans l'arbre.
    queueMicrotask(() => root.unmount())
    box.remove()
  }
  anchor.append(box)
  document.addEventListener('mousedown', outside, true)
  document.addEventListener('keydown', escape, true)
  return close
}

export const Callout = Node.create({
  name: CALLOUT,
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      icon: {
        default: CALLOUT_ICON,
        parseHTML: (el) => el.getAttribute('data-icon') || CALLOUT_ICON,
        renderHTML: (attrs) => ({ 'data-icon': attrs.icon as string }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }, { tag: 'aside' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-callout': '', ...HTMLAttributes }, 0]
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement('div')
      dom.setAttribute('data-callout', '')
      dom.className =
        'my-2 flex gap-2 rounded-[10px] border border-transparent bg-muted p-3'
      const zone = document.createElement('div')
      zone.contentEditable = 'false'
      // L'icône centrée sur la première ligne du texte, sous les 8 px de
      // padding d'un paragraphe (`NOTE_PROSE`).
      zone.className =
        'relative shrink-0 self-start pt-[calc(8px+(1lh-24px)/2)]'
      const button = document.createElement('button')
      button.type = 'button'
      button.setAttribute('aria-label', 'Changer l’icône')
      button.setAttribute('aria-haspopup', 'listbox')
      button.className =
        'flex size-6 cursor-pointer select-none items-center justify-center rounded-[4px] text-[21.6px] leading-none transition-colors duration-[20ms] ease-in hover:bg-foreground/[0.06]'
      zone.append(button)
      const body = document.createElement('div')
      // Le padding des enfants fait l'espacement, comme sur la page.
      body.className = 'flex min-w-0 flex-1 flex-col'
      dom.append(zone, body)

      let close: (() => void) | null = null
      button.addEventListener('mousedown', (e) => e.preventDefault())
      button.addEventListener('click', () => {
        if (close) {
          close()
          close = null
          return
        }
        close = iconPicker(zone, (icon) => {
          close = null
          const pos = getPos()
          if (typeof pos === 'number')
            editor.view.dispatch(
              editor.state.tr.setNodeAttribute(pos, 'icon', icon),
            )
        })
      })
      const paint = (n: PMNode) => {
        button.textContent = n.attrs.icon as string
      }
      paint(node)
      return {
        dom,
        contentDOM: body,
        update: (updated) => {
          if (updated.type !== node.type) return false
          paint(updated)
          return true
        },
        stopEvent: (event) => zone.contains(event.target as globalThis.Node),
        ignoreMutation: (m) =>
          m.type !== 'selection' && !body.contains(m.target),
        destroy: () => close?.(),
      }
    }
  },

  addCommands() {
    return {
      setCallout:
        () =>
        ({ commands }) =>
          commands.wrapIn(this.name),
    }
  },
})

/**
 * Le clavier de l'encadré (relevé Notion §4.3) : Entrée sur un enfant vide
 * en crée un autre ; Retour arrière sur le dernier enfant vide le sort de
 * l'encadré (seul enfant : l'encadré redevient du texte) ; en tête du
 * premier enfant, il sort de l'encadré.
 */
export const calloutKeys = Extension.create({
  name: 'calloutKeys',
  priority: 150,

  addKeyboardShortcuts() {
    const editor = this.editor
    const liftFirst = () => {
      const { $from, empty } = editor.state.selection
      if (!empty || $from.parentOffset !== 0 || $from.depth < 2) return false
      if ($from.node(-1).type.name !== CALLOUT || $from.index(-1) !== 0)
        return false
      return editor.commands.lift(CALLOUT)
    }
    return {
      Enter: () => enterInContainer(editor, [CALLOUT]),
      Backspace: () =>
        backspaceOutOf(editor, [CALLOUT], {
          outer: 0,
          onlyChild: ($from) =>
            editor.commands.command(({ tr }) => {
              tr.replaceWith(
                $from.before(-1),
                $from.after(-1),
                editor.schema.nodes.paragraph.create(),
              )
              tr.setSelection(
                TextSelection.create(tr.doc, $from.before(-1) + 1),
              )
              return true
            }),
        }) || liftFirst(),
    }
  },
})
