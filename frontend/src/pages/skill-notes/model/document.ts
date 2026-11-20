import type { JSONContent } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'

import type { Notes } from '@/entities/note'

import { COLUMN, COLUMNS } from '../lib/columns'
import { BODY_CONTAINERS, HEADING } from '../lib/editor-extensions'
import { QUESTION } from '../lib/question-node'

/**
 * Le document du serveur → celui de l'éditeur. Une question ne se place
 * qu'une fois : un nœud qui en répète une déjà posée plus haut est écarté,
 * comme celui d'une question inconnue (supprimée). Une colonne vide
 * disparaît, des colonnes réduites à une seule rendent ses blocs. Sans notes,
 * un paragraphe vide (« Page vide »).
 */
export function toEditorDoc(notes: Notes): JSONContent {
  const known = new Set(notes.questions.map((q) => q.id))
  const seen = new Set<string>()
  const clean = (nodes: JSONContent[]): JSONContent[] =>
    nodes.flatMap((node) => {
      if (node.type === QUESTION) {
        const id = node.attrs?.id as string | undefined
        if (!id || seen.has(id) || !known.has(id)) return []
        seen.add(id)
        return [node]
      }
      if (!node.content) return [node]
      const content = clean(node.content)
      if (node.type === COLUMN && !content.length) return []
      if (node.type === COLUMNS && content.length < 2)
        return content.flatMap((column) => column.content ?? [])
      return [{ ...node, content }]
    })
  const content = clean(
    ((notes.doc as JSONContent | null)?.content ?? []) as JSONContent[],
  )
  return {
    type: 'doc',
    content: content.length ? content : [{ type: 'paragraph' }],
  }
}

export interface Heading {
  level: number
  title: string
  /** La position du titre dans le document. */
  pos: number
}

/** Les titres du document, dans l'ordre — en colonne compris. */
export function headingsOf(doc: PMNode): Heading[] {
  const out: Heading[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === HEADING)
      out.push({
        level: node.attrs.level as number,
        title: node.textContent,
        pos,
      })
    return !node.isTextblock
  })
  return out
}

/**
 * Le bloc qui contient `pos` : l'enfant d'un conteneur de blocs
 * (`BODY_CONTAINERS`) le plus proche.
 */
export function blockAt(
  doc: PMNode,
  pos: number,
): { pos: number; node: PMNode } | null {
  const $pos = doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth--) {
    if (!BODY_CONTAINERS.has($pos.node(depth - 1).type.name)) continue
    return { pos: $pos.before(depth), node: $pos.node(depth) }
  }
  // Juste avant un bloc atomique (une question) : la position est entre deux
  // blocs, le nœud qui suit est le bloc.
  const after = $pos.nodeAfter
  if (after && BODY_CONTAINERS.has($pos.parent.type.name))
    return { pos, node: after }
  return null
}

/** La position du nœud de la question `id`, s'il est dans le document. */
export function questionPos(doc: PMNode, id: string): number | null {
  let found: number | null = null
  doc.descendants((node, pos) => {
    if (found !== null) return false
    if (node.type.name === QUESTION && node.attrs.id === id) found = pos
    return !node.isTextblock
  })
  return found
}
