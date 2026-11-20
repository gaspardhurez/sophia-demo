import { type EditorState, TextSelection } from '@tiptap/pm/state'
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  CellSelection,
  deleteColumn,
  deleteRow,
  deleteTable,
  selectedRect,
  toggleHeader,
} from '@tiptap/pm/tables'
import type { EditorView } from '@tiptap/pm/view'

type Command = (
  state: EditorState,
  dispatch?: EditorView['dispatch'],
) => boolean

interface Entry {
  label: string
  run: Command
  /** Coché (la ligne d'en-tête active). */
  checked?: (state: EditorState) => boolean
  danger?: boolean
}

/** Les entrées, par groupe (un filet entre deux). */
const GROUPS: Entry[][] = [
  [
    { label: 'Insérer une ligne au-dessus', run: addRowBefore },
    { label: 'Insérer une ligne en dessous', run: addRowAfter },
    { label: 'Insérer une colonne à gauche', run: addColumnBefore },
    { label: 'Insérer une colonne à droite', run: addColumnAfter },
  ],
  [
    {
      label: "Ligne d'en-tête",
      run: toggleHeader('row'),
      checked: headerRowOn,
    },
  ],
  [
    { label: 'Supprimer la ligne', run: deleteRow, danger: true },
    { label: 'Supprimer la colonne', run: deleteColumn, danger: true },
    { label: 'Supprimer le tableau', run: deleteTable, danger: true },
  ],
]

/** La première ligne du tableau du curseur est-elle d'en-tête ? */
function headerRowOn(state: EditorState) {
  const rect = selectedRect(state)
  const first = rect.table.firstChild
  if (!first) return false
  let all = true
  first.forEach((cell) => {
    if (cell.type.spec.tableRole !== 'header_cell') all = false
  })
  return all
}

/** Le menu ouvert, s'il y en a un : un seul à la fois. */
let close: (() => void) | null = null

/**
 * Le menu d'un tableau, au clic droit dans une cellule : insérer une ligne
 * ou une colonne de part et d'autre, la ligne d'en-tête, supprimer la ligne,
 * la colonne ou le tableau. Le curseur passe d'abord dans la cellule cliquée
 * (sauf si elle est dans une sélection de cellules : on agit alors sur elle).
 * Échap, un clic dehors ou le défilement le ferment ; ↑ ↓ le parcourent.
 */
export function openTableMenu(view: EditorView, at: { x: number; y: number }) {
  close?.()
  const hit = view.posAtCoords({ left: at.x, top: at.y })
  if (hit) {
    const { selection } = view.state
    const inCells =
      selection instanceof CellSelection &&
      hit.pos >= selection.from &&
      hit.pos <= selection.to
    if (!inCells)
      view.dispatch(
        view.state.tr.setSelection(
          TextSelection.near(view.state.doc.resolve(hit.pos)),
        ),
      )
  }

  const menu = document.createElement('div')
  menu.role = 'menu'
  menu.ariaLabel = 'Tableau'
  menu.className =
    'fixed z-50 flex w-[232px] flex-col rounded-[10px] border bg-popover p-[5px] text-[13px] text-popover-foreground shadow-[0_8px_24px_-6px_oklch(0.21_0.008_285/0.18)] animate-in fade-in-0 zoom-in-95 duration-150'

  const items: HTMLButtonElement[] = []
  GROUPS.forEach((group, index) => {
    if (index > 0) {
      const rule = menu.appendChild(document.createElement('span'))
      rule.ariaHidden = 'true'
      rule.className = 'mx-1.5 my-1 h-px bg-border'
    }
    for (const entry of group) {
      const button = menu.appendChild(document.createElement('button'))
      button.type = 'button'
      button.role = entry.checked ? 'menuitemcheckbox' : 'menuitem'
      button.className = `flex cursor-pointer items-center gap-2 rounded-[6px] px-2 py-[5px] text-left outline-none hover:bg-muted focus-visible:bg-muted disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent ${entry.danger ? 'text-destructive' : ''}`
      const label = button.appendChild(document.createElement('span'))
      label.className = 'flex-1'
      label.textContent = entry.label
      if (entry.checked) {
        const on = entry.checked(view.state)
        button.ariaChecked = String(on)
        const mark = button.appendChild(document.createElement('span'))
        mark.ariaHidden = 'true'
        mark.className = 'text-muted-foreground'
        mark.textContent = on ? '✓' : ''
      }
      button.disabled = !entry.run(view.state)
      button.addEventListener('mousedown', (e) => e.preventDefault())
      button.addEventListener('click', () => {
        dismiss()
        entry.run(view.state, view.dispatch)
        view.focus()
      })
      items.push(button)
    }
  })

  document.body.appendChild(menu)
  // Dans la fenêtre : à droite et sous le clic, sinon de l'autre côté.
  const box = menu.getBoundingClientRect()
  const x = at.x + box.width > innerWidth - 8 ? at.x - box.width : at.x
  const y = at.y + box.height > innerHeight - 8 ? at.y - box.height : at.y
  menu.style.left = `${Math.max(8, x)}px`
  menu.style.top = `${Math.max(8, y)}px`

  const enabled = () => items.filter((b) => !b.disabled)
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      dismiss()
      view.focus()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      const list = enabled()
      const now = list.indexOf(document.activeElement as HTMLButtonElement)
      const step = e.key === 'ArrowDown' ? 1 : -1
      list[(now + step + list.length) % list.length]?.focus()
    }
  }
  const onDown = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) dismiss()
  }
  const dismiss = () => {
    menu.remove()
    document.removeEventListener('keydown', onKey, true)
    document.removeEventListener('mousedown', onDown, true)
    window.removeEventListener('scroll', dismiss, true)
    window.removeEventListener('resize', dismiss)
    close = null
  }
  document.addEventListener('keydown', onKey, true)
  document.addEventListener('mousedown', onDown, true)
  window.addEventListener('scroll', dismiss, true)
  window.addEventListener('resize', dismiss)
  close = dismiss
  enabled()[0]?.focus()
}
