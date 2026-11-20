import { TableView } from '@tiptap/extension-table'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { addColumnAfter, addRowAfter, TableMap } from '@tiptap/pm/tables'
import type { EditorView, ViewMutationRecord } from '@tiptap/pm/view'

import { cn } from '@/shared/lib/utils'

import { selectedBlocks } from '../../lib/block-selection'
import { openTableMenu } from './table-menu'

/** La largeur d'une colonne qui n'en a pas reçu (Notion : 120 px). */
const COLUMN_WIDTH = 120

/**
 * La `table` elle-même. Posée ici, pas par les `HTMLAttributes` de
 * l'extension : avec les colonnes redimensionnables, c'est
 * `prosemirror-tables` qui crée la vue, sans eux.
 */
const TABLE = cn(
  'm-0 border-collapse',
  // La poignée de redimensionnement (`prosemirror-tables`).
  '[&_.column-resize-handle]:pointer-events-none [&_.column-resize-handle]:absolute [&_.column-resize-handle]:top-0 [&_.column-resize-handle]:-right-px [&_.column-resize-handle]:-bottom-px [&_.column-resize-handle]:z-10 [&_.column-resize-handle]:w-0.5 [&_.column-resize-handle]:bg-(--note-accent)/50',
  // Une sélection de cellules (glisser d'une cellule à l'autre).
  '[&_.selectedCell]:bg-(--note-accent)/10 [&_.selectedCell]:caret-transparent',
)

/**
 * Une barre « + » au bord du tableau (Notion) : à 8 px de lui, 16 px
 * d'épaisseur, un filet de la couleur des bordures, rayon 4. Elle paraît
 * au survol de la dernière colonne (à droite) ou de la dernière ligne (en
 * bas), ou d'elle-même — en fondu 0,15 s, après 0,05 s.
 */
const EDGE = cn(
  'absolute grid cursor-pointer place-items-center rounded-[4px] border border-border text-muted-foreground',
  'opacity-0 transition-[opacity,background-color] delay-50 duration-150 hover:bg-foreground/5 hover:opacity-100 focus-visible:opacity-100',
)

/** Le « + » des barres : 12 px, trait fin. */
const PLUS =
  '<svg aria-hidden="true" viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M6 1.5v9M1.5 6h9"/></svg>'

/**
 * La vue d'un tableau (`@tiptap/extension-table`), étendue, à la Notion :
 * un défilement horizontal quand il dépasse la colonne de texte, une barre
 * « + » à droite (une colonne de plus) et en bas (une ligne de plus), son
 * propre halo quand il est sélectionné comme bloc, et le menu du tableau au
 * clic droit dans une cellule.
 *
 * Le DOM : `dom` (défile ; 16 px dessus, 32 dessous et 24 à droite pour les
 * barres, décalé de 6 px du texte comme chez Notion) › `frame` (à la taille
 * du tableau, porte les barres et le halo) › la `table` de TipTap.
 *
 * Largeurs : une colonne sans largeur (neuve, collée) prend 120 px ; le
 * glisser de son bord la règle. Un observateur la remet à 120 px chaque fois
 * que TipTap ou `prosemirror-tables` (pendant le glisser) la vident.
 */
export class NotesTableView extends TableView {
  private readonly view: EditorView | undefined
  private readonly halo: HTMLElement
  private readonly onContextMenu: (e: MouseEvent) => void
  private readonly widths: MutationObserver
  private haloPending = false

  constructor(
    node: PMNode,
    cellMinWidth: number,
    view?: EditorView,
    HTMLAttributes?: Record<string, unknown>,
  ) {
    super(node, cellMinWidth, view, HTMLAttributes)
    this.view = view
    this.table.className = TABLE

    const scroller = document.createElement('div')
    scroller.className = cn(
      'group/table relative ml-1.5 overflow-x-auto overflow-y-hidden pt-4 pr-6 pb-8 [.resize-cursor_&]:cursor-col-resize',
      // Le halo commun des blocs déborderait sur les marges et les barres :
      // le tableau porte le sien (`halo`).
      'after:hidden',
    )
    const frame = scroller.appendChild(document.createElement('div'))
    frame.className = 'relative w-max min-w-0'
    frame.appendChild(this.table)

    // Le halo de Notion : l'accent à 14 %, 2 px en dedans du tableau, sans
    // rayon.
    this.halo = frame.appendChild(document.createElement('div'))
    this.halo.className =
      'pointer-events-none absolute inset-0.5 z-10 animate-in bg-(--note-accent)/14 duration-200 fade-in-0'
    this.halo.hidden = true

    frame.appendChild(
      this.edge(
        'Ajouter une colonne',
        'top-0 bottom-0 left-[calc(100%+8px)] w-4 group-has-[tr>:last-child:hover]/table:opacity-100',
        () => this.append('column'),
      ),
    )
    frame.appendChild(
      this.edge(
        'Ajouter une ligne',
        'top-[calc(100%+8px)] right-0 left-0 h-4 group-has-[tr:last-child>:hover]/table:opacity-100',
        () => this.append('row'),
      ),
    )
    this.dom = scroller

    this.onContextMenu = (e) => {
      if (!this.view?.editable) return
      if (!this.contentDOM.contains(e.target as Node)) return
      e.preventDefault()
      openTableMenu(this.view, { x: e.clientX, y: e.clientY })
    }
    scroller.addEventListener('contextmenu', this.onContextMenu)

    this.widths = new MutationObserver(() => this.fillWidths())
    this.widths.observe(this.table, {
      attributes: true,
      attributeFilter: ['style'],
      subtree: true,
    })
    this.fillWidths()
    this.syncHalo()
  }

  private edge(label: string, place: string, run: () => void) {
    const button = document.createElement('button')
    button.type = 'button'
    button.contentEditable = 'false'
    button.ariaLabel = label
    button.title = label
    button.className = `${EDGE} ${place}`
    button.innerHTML = PLUS
    // Le curseur de l'éditeur ne bouge pas avant l'ajout.
    button.addEventListener('mousedown', (e) => e.preventDefault())
    button.addEventListener('click', run)
    return button
  }

  /** Les colonnes sans largeur à 120 px ; le tableau, à leur somme. */
  private fillWidths() {
    let total = 0
    for (const col of Array.from(this.colgroup.children)) {
      if (!(col instanceof HTMLElement)) continue
      if (!col.style.width) col.style.width = `${COLUMN_WIDTH}px`
      total += parseFloat(col.style.width)
    }
    const width = `${total}px`
    if (this.table.style.width !== width) this.table.style.width = width
    if (this.table.style.minWidth) this.table.style.minWidth = ''
  }

  /**
   * Le halo suit la sélection de blocs. Lu juste après la mise à jour de la
   * vue (une microtâche) : la position du tableau se lit dans le DOM.
   */
  private syncHalo() {
    if (this.haloPending) return
    this.haloPending = true
    queueMicrotask(() => {
      this.haloPending = false
      const view = this.view
      if (!view || view.isDestroyed || !this.dom.isConnected) return
      const pos = view.posAtDOM(this.contentDOM, 0) - 1
      this.halo.hidden = !selectedBlocks(view.state).some((b) => b.pos === pos)
    })
  }

  /** Une ligne en bas ou une colonne à droite, le curseur dans sa 1re cellule. */
  private append(kind: 'row' | 'column') {
    const view = this.view
    if (!view) return
    const start = view.posAtDOM(this.contentDOM, 0)
    const table = view.state.doc.nodeAt(start - 1)
    if (!table) return
    const map = TableMap.get(table)
    const [row, col] = kind === 'row' ? [map.height - 1, 0] : [0, map.width - 1]
    const cell = start + map.positionAt(row, col, table)
    view.dispatch(
      view.state.tr.setSelection(
        TextSelection.near(view.state.doc.resolve(cell + 1)),
      ),
    )
    const add = kind === 'row' ? addRowAfter : addColumnAfter
    add(view.state, view.dispatch)
    // Le curseur dans la cellule ajoutée.
    const grown = view.state.doc.nodeAt(start - 1)
    if (grown) {
      const after = TableMap.get(grown)
      const at =
        kind === 'row'
          ? after.positionAt(after.height - 1, 0, grown)
          : after.positionAt(0, after.width - 1, grown)
      view.dispatch(
        view.state.tr.setSelection(
          TextSelection.near(view.state.doc.resolve(start + at + 1)),
        ),
      )
    }
    view.focus()
  }

  update(node: PMNode) {
    if (!super.update(node)) return false
    // Appelée aussi quand les décorations du tableau changent : le halo.
    this.syncHalo()
    return true
  }

  ignoreMutation(mutation: ViewMutationRecord) {
    // Tout ce qui n'est pas le contenu (barres, cadre, halo) est à nous.
    if (!this.contentDOM.contains(mutation.target as Node)) return true
    return mutation.type === 'selection'
      ? false
      : super.ignoreMutation(mutation)
  }

  stopEvent(event: Event) {
    // Les barres « + » gardent leurs clics.
    return (
      event.target instanceof Element &&
      event.target.closest('button') !== null &&
      this.dom.contains(event.target)
    )
  }

  destroy() {
    this.widths.disconnect()
    this.dom.removeEventListener('contextmenu', this.onContextMenu)
  }
}
