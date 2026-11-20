import { Node } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/**
 * Les colonnes (design #88, à la Notion) : un bloc `columns` du document,
 * fait d'au moins deux `column`, chacune une pile de blocs — question et
 * titres compris, jamais d'autres colonnes.
 *
 * Elles naissent du glisser (un bloc lâché au bord droit ou gauche d'un autre,
 * cf. `block-move`) et s'y défont : une colonne vidée disparaît, des colonnes
 * réduites à une seule rendent ses blocs au document.
 *
 * Largeurs : égales à la naissance ; la poignée entre deux colonnes les
 * redimensionne (`ui/column-resize`). Chaque `column` porte sa part de la
 * largeur dans l'attribut `width` (une fraction, la somme fait 1) ; nul : part
 * égale. Le serveur garde le document tel quel.
 *
 * `columns` n'est pas du groupe `block` : il ne vit qu'au premier niveau du
 * document (cf. `NotesDocument`) — jamais dans une liste, une citation ou
 * une autre colonne.
 */
export const COLUMNS = 'columns'
export const COLUMN = 'column'

/** L'écart entre deux colonnes, en px (Notion : 46). */
export const COLUMN_GAP = 46
/** La part minimale d'une colonne quand on la redimensionne. */
export const MIN_COLUMN = 0.15

type Width = number | null

/** Des parts quelconques (une nulle : toutes égales) → des fractions qui font 1. */
export function normalize(raw: Width[]): number[] {
  const n = raw.length
  if (raw.some((w) => w === null || !(w > 0))) return raw.map(() => 1 / n)
  const sum = raw.reduce<number>((s, w) => s + (w as number), 0)
  return raw.map((w) => (w as number) / sum)
}

/** Les parts des colonnes de `columns`, en fractions qui font 1. */
export function widthsOf(columns: PMNode): number[] {
  const raw: Width[] = []
  columns.forEach((c) => raw.push(c.attrs.width as Width))
  return normalize(raw)
}

/**
 * Les colonnes avec des parts qui font 1 : après un retrait, les autres
 * gardent leurs proportions ; `equal` (une colonne de plus) : toutes égales.
 */
export function sharedOut(columns: PMNode[], equal = false): PMNode[] {
  const n = columns.length
  const widths = normalize(
    equal
      ? columns.map(() => null)
      : columns.map((c) => c.attrs.width as Width),
  )
  const even = widths.every((w) => Math.abs(w - 1 / n) < 1e-3)
  return columns.map((c, i) => {
    const width = even ? null : widths[i]
    return c.attrs.width === width
      ? c
      : c.type.create({ ...c.attrs, width }, c.content, c.marks)
  })
}

/**
 * La frontière entre les colonnes `i` et `i + 1` déplacée de `delta` (en
 * fraction de la largeur) : les deux voisines échangent leur part, chacune
 * gardant au moins `MIN_COLUMN` ; les autres ne bougent pas.
 */
export function resizeWidths(
  widths: number[],
  i: number,
  delta: number,
): number[] {
  const a = widths[i]
  const b = widths[i + 1]
  if (a === undefined || b === undefined) return widths
  const d = Math.min(
    Math.max(0, b - MIN_COLUMN),
    Math.max(Math.min(0, MIN_COLUMN - a), delta),
  )
  const next = [...widths]
  next[i] = a + d
  next[i + 1] = b - d
  return next
}

/** La part d'une colonne : celle de sa largeur après les écarts. */
const flex = (width: Width) => `flex: ${width ?? 1} 1 0%`

export const Columns = Node.create({
  name: COLUMNS,
  content: `${COLUMN}{2,}`,
  // Le clavier ne fond pas une colonne dans sa voisine.
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-columns]' }]
  },

  renderHTML() {
    return [
      'div',
      {
        'data-columns': '',
        // Côte à côte à toute largeur, 46 px entre elles (Notion).
        class: 'flex items-start',
        style: `gap: ${COLUMN_GAP}px`,
      },
      0,
    ]
  },

  addProseMirrorPlugins() {
    return [columnsPreview]
  },
})

export const Column = Node.create({
  name: COLUMN,
  content: 'block+',
  isolating: true,

  addAttributes() {
    return {
      width: {
        default: null,
        parseHTML: (el) => {
          const w = Number.parseFloat(el.getAttribute('data-width') ?? '')
          return w > 0 ? w : null
        },
        renderHTML: (attrs) =>
          attrs.width ? { 'data-width': String(attrs.width) } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-column]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      {
        ...HTMLAttributes,
        'data-column': '',
        // Pas d'écart : les blocs portent leur espacement (`NOTE_PROSE`).
        class: 'flex min-w-0 flex-col',
        style: flex(node.attrs.width as Width),
      },
      0,
    ]
  },
})

/** Les parts montrées pendant un redimensionnement, avant d'être écrites. */
type Preview = { pos: number; widths: number[] } | null

const previewKey = new PluginKey<Preview>('columnsPreview')

/**
 * Le redimensionnement en direct : les nouvelles parts sont des décorations
 * (le style des colonnes), sans toucher au document ni à l'historique ; le
 * lâcher les écrit en une transaction (`commitWidths`).
 */
const columnsPreview = new Plugin<Preview>({
  key: previewKey,
  state: {
    init: () => null,
    apply: (tr, value) => {
      const meta = tr.getMeta(previewKey) as Preview | undefined
      if (meta !== undefined) return meta
      return tr.docChanged ? null : value
    },
  },
  props: {
    decorations: (state) => {
      const preview = previewKey.getState(state)
      if (!preview) return null
      const node =
        preview.pos < state.doc.content.size
          ? state.doc.nodeAt(preview.pos)
          : null
      if (node?.type.name !== COLUMNS) return null
      const found: Decoration[] = []
      node.forEach((column, offset, i) => {
        const from = preview.pos + 1 + offset
        found.push(
          Decoration.node(from, from + column.nodeSize, {
            style: flex(preview.widths[i] ?? null),
          }),
        )
      })
      return DecorationSet.create(state.doc, found)
    },
  },
})

/** Montre les parts `widths` des colonnes en `pos` (nul : plus d'aperçu). */
export function previewWidths(
  view: EditorView,
  pos: number,
  widths: number[] | null,
) {
  view.dispatch(
    view.state.tr
      .setMeta(previewKey, widths && { pos, widths })
      .setMeta('addToHistory', false),
  )
}

/**
 * Écrit les parts `widths` dans les colonnes en `pos`, en une transaction
 * (un seul pas d'annulation), et retire l'aperçu.
 */
export function commitWidths(view: EditorView, pos: number, widths: number[]) {
  const { state } = view
  const node = state.doc.nodeAt(pos)
  const tr = state.tr.setMeta(previewKey, null)
  if (node?.type.name === COLUMNS && widths.length === node.childCount) {
    const columns: PMNode[] = []
    node.forEach((column, _, i) =>
      columns.push(
        column.type.create(
          { ...column.attrs, width: Math.round(widths[i] * 1e4) / 1e4 },
          column.content,
        ),
      ),
    )
    sharedOut(columns).forEach((column, i) => {
      if (column.attrs.width === node.child(i).attrs.width) return
      let at = pos + 1
      for (let k = 0; k < i; k++) at += node.child(k).nodeSize
      tr.setNodeMarkup(at, undefined, column.attrs)
    })
  }
  view.dispatch(tr)
}
