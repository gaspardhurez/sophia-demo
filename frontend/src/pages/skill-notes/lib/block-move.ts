import { Fragment, type Node as PMNode } from '@tiptap/pm/model'
import type { EditorState, Transaction } from '@tiptap/pm/state'

import { isList } from './block-unit'
import { COLUMN, COLUMNS, sharedOut } from './columns'
import { questionIds } from './question-node'
import { replaceChildren } from './unit-edit'

/**
 * Déplacer un bloc en le glissant (à la Notion) — la règle, sans le DOM.
 *
 * Ce qu'on glisse : un **bloc** (cf. `block-unit`) — un enfant du document
 * ou d'un conteneur de blocs (une colonne, et ceux que déclare le registre :
 * `BODY_CONTAINERS`), ou un **élément de liste**, avec ses sous-éléments ; un
 * titre comme un autre, seul. On le lâche **avant** ou **après** un bloc
 * repère — là où vit ce repère, donc dedans ou dehors —, ou à son bord
 * **gauche** ou **droit** : ce bord ouvre des colonnes (le repère et le bloc
 * côte à côte, à parts égales), ou, dans des colonnes, en ajoute une (toutes
 * redeviennent égales).
 *
 * Un élément garde le type de sa liste, comme le bloc à puces de Notion :
 * lâché parmi les éléments d'une liste du même type, il y entre ; ailleurs,
 * il forme une liste d'un élément (qui rejoint une liste voisine du même
 * type). Un bloc — ou un élément d'un autre type — lâché entre deux éléments
 * coupe leur liste en deux autour de lui.
 *
 * Une colonne vidée disparaît (les autres gardent leurs proportions) ; des
 * colonnes réduites à une seule rendent ses blocs à la page ; une liste
 * vidée disparaît ; un autre conteneur vidé reçoit le contenu minimal de son
 * schéma (un paragraphe vide).
 *
 * Nœuds et repère sont désignés par **identité** (les nœuds ProseMirror sont
 * immuables) : si le document a changé entre-temps, on ne les retrouve pas
 * et rien ne bouge.
 */
export interface Dragged {
  node: PMNode
  /** La liste d'un élément glissé ; nul pour un autre bloc. */
  list?: PMNode | null
}

/** Ce que devient le bloc glissé hors d'une liste de son type. */
const standalone = (d: Dragged) =>
  d.list ? d.list.type.create(d.list.attrs, d.node, d.list.marks) : d.node

/**
 * Une liste posée en `i` rejoint ses voisines du même type (le bloc à puces
 * glissé contre une liste à puces y entre).
 */
function joinAround(children: PMNode[], i: number) {
  const join = (a: PMNode, b: PMNode) =>
    a.type.create(a.attrs, a.content.append(b.content), a.marks)
  const node = children[i]
  if (!isList(node)) return
  const next = children[i + 1]
  if (next && next.type === node.type) children.splice(i, 2, join(node, next))
  const prev = children[i - 1]
  if (prev && prev.type === node.type)
    children.splice(i - 1, 2, join(prev, children[i]))
}

export type DropSide = 'before' | 'after' | 'left' | 'right'

export interface Drop {
  side: DropSide
  ref: PMNode
}

const kids = (node: PMNode) => {
  const out: PMNode[] = []
  node.forEach((child) => out.push(child))
  return out
}

/** `node` refait avec `children` : ce qui le remplace dans son parent. */
function rebuild(node: PMNode, children: PMNode[]): PMNode[] {
  const name = node.type.name
  if ((name === COLUMN || isList(node)) && !children.length) return []
  if (name === COLUMNS) {
    if (children.length === 1) return kids(children[0])
    return [node.copy(Fragment.from(sharedOut(children)))]
  }
  const content = Fragment.from(children)
  if (!node.type.validContent(content)) {
    // Un conteneur vidé : son contenu minimal.
    const filled = node.type.createAndFill(node.attrs, null, node.marks)
    if (filled && !children.length) return [filled]
  }
  return [node.copy(content)]
}

/** `parent` sans `target` (où qu'il soit dessous) ; nul s'il n'y est pas. */
function remove(parent: PMNode, target: PMNode): PMNode[] | null {
  const children = kids(parent)
  const i = children.indexOf(target)
  if (i >= 0) {
    children.splice(i, 1)
    // Deux listes du même type qui se touchent ne font plus qu'une.
    if (i > 0) joinAround(children, i - 1)
    return rebuild(parent, children)
  }
  for (let k = 0; k < children.length; k++) {
    if (children[k].isTextblock || children[k].isLeaf) continue
    const inner = remove(children[k], target)
    if (!inner) continue
    children.splice(k, 1, ...inner)
    // Une liste vidée laisse se toucher ses voisines.
    if (!inner.length && k > 0) joinAround(children, k - 1)
    return rebuild(parent, children)
  }
  return null
}

/**
 * `parent` avec le bloc glissé posé selon `drop` — ce qui le remplace dans
 * son propre parent (une liste coupée en deux : trois nœuds) ; nul si le
 * repère n'y est pas.
 */
function insert(parent: PMNode, d: Dragged, drop: Drop): PMNode[] | null {
  const { side, ref } = drop
  const schema = parent.type.schema
  const children = kids(parent)
  const after = side === 'after' || side === 'right'
  const lateral = side === 'left' || side === 'right'
  const block = standalone(d)
  const column = (node: PMNode) =>
    schema.nodes[COLUMN].create(null, Fragment.from(node))

  if (lateral && parent.type.name === COLUMNS) {
    // Au bord d'un bloc d'une colonne : une colonne de plus, à côté.
    const c = children.findIndex((col) => kids(col).includes(ref))
    if (c >= 0) {
      children.splice(c + (after ? 1 : 0), 0, column(block))
      return [parent.copy(Fragment.from(sharedOut(children, true)))]
    }
  }
  const i = children.indexOf(ref)
  if (i >= 0) {
    const at = i + (after ? 1 : 0)
    if (isList(parent)) {
      // Parmi les éléments d'une liste de son type : il y entre.
      if (d.list?.type === parent.type) {
        children.splice(at, 0, d.node)
        return [parent.copy(Fragment.from(children))]
      }
      // Sinon la liste se coupe autour de lui.
      const head = children.slice(0, at)
      const tail = children.slice(at)
      return [
        ...(head.length ? [parent.copy(Fragment.from(head))] : []),
        block,
        ...(tail.length ? [parent.copy(Fragment.from(tail))] : []),
      ]
    }
    if (!lateral) {
      children.splice(at, 0, block)
      joinAround(children, at)
    } else {
      // Au bord d'un bloc hors colonnes : les deux, côte à côte.
      const pair = side === 'left' ? [block, ref] : [ref, block]
      children[i] = schema.nodes[COLUMNS].create(
        null,
        Fragment.from(pair.map(column)),
      )
    }
    return [parent.copy(Fragment.from(children))]
  }
  for (let k = 0; k < children.length; k++) {
    if (children[k].isTextblock || children[k].isLeaf) continue
    const inner = insert(children[k], d, drop)
    if (!inner) continue
    children.splice(k, 1, ...inner)
    return [parent.copy(Fragment.from(children))]
  }
  return null
}

/** Les feuilles hors texte (images, équations…) : aucune ne se perd. */
function leaves(doc: PMNode): number {
  let n = 0
  doc.descendants((node) => {
    if (node.isLeaf && !node.isText) n++
  })
  return n
}

/**
 * Le document après le déplacement ; nul si le geste ne change rien, n'est
 * pas permis par le schéma, ou perdrait quoi que ce soit.
 */
export function moveResult(
  doc: PMNode,
  dragged: Dragged,
  drop: Drop,
): PMNode | null {
  if (dragged.node === drop.ref) return null
  const without = remove(doc, dragged.node)
  if (without?.length !== 1) return null
  const next = insert(without[0], dragged, drop)?.[0]
  if (!next) return null

  // Sécurité des données : un document valide, qui garde tout son texte,
  // toutes ses questions et ses autres feuilles — sinon rien ne bouge.
  try {
    next.check()
  } catch {
    return null
  }
  if (next.eq(doc)) return null
  if (next.textContent.length !== doc.textContent.length) return null
  const ids = (d: PMNode) => questionIds(d).sort().join()
  if (ids(next) !== ids(doc)) return null
  if (leaves(next) !== leaves(doc)) return null
  return next
}

/**
 * La transaction du déplacement : un seul remplacement, sur les nœuds du
 * premier niveau qui changent. Le bloc est retiré et reposé dans la même
 * transaction : la garde des questions la laisse passer.
 */
export function moveTransaction(
  state: EditorState,
  dragged: Dragged,
  drop: Drop,
): Transaction | null {
  const { doc } = state
  const next = moveResult(doc, dragged, drop)
  if (!next) return null
  const tr = state.tr
  replaceChildren(tr, 0, kids(doc), kids(next))
  return tr.doc.eq(next) ? tr : null
}
