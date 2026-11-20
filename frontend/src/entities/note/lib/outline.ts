import type { NotesDoc } from '../model/types'

interface JsonNode {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  content?: JsonNode[]
}

/** Une partie des notes, vue en miniature : son titre (nul pour le texte qui
 *  précède tout titre) et le début de son texte. */
export interface NotesPart {
  title: string | null
  text: string
}

/** Assez pour remplir la vignette ; elle coupe le reste par sa hauteur. */
const MAX = 240

/** Les nœuds qui ne disent rien en miniature : la question renvoie à son
 *  contenu (la réponse attendue n'a pas à paraître), l'image n'a pas de
 *  texte. */
const SKIPPED = new Set(['question', 'image'])

/** Le texte d'un nœud, ses blocs séparés d'une espace. */
function textOf(node: JsonNode): string {
  if (SKIPPED.has(node.type ?? '')) return ''
  if (node.type === 'hardBreak') return ' '
  if (node.text) return node.text
  const children = node.content ?? []
  // Un bloc qui ne porte que du texte en ligne : ses morceaux se suivent
  // sans blanc ; des blocs (liste, colonnes, dépliant…) : une espace entre.
  const inline = children.every((c) => c.text != null || c.type === 'hardBreak')
  return children
    .map(textOf)
    .join(inline ? '' : ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Borne un texte à `MAX` caractères, coupé à un mot, « … » en fin. */
function clip(text: string): string {
  if (text.length <= MAX) return text
  const cut = text.slice(0, MAX)
  const space = cut.lastIndexOf(' ')
  return `${(space > MAX / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/**
 * Le plan des notes, pour leur miniature (#160, `kit/Feuille notes`) : une
 * partie par titre — le texte qui le suit jusqu'au titre suivant, mis bout à
 * bout et borné —, et le texte d'avant tout titre en partie sans titre. Seuls
 * les titres de premier rang du document découpent : un titre logé dans des
 * colonnes ou un dépliant compte comme du texte.
 */
export function notesOutline(doc: NotesDoc | null | undefined): NotesPart[] {
  const parts: { title: string | null; chunks: string[] }[] = []
  let current: { title: string | null; chunks: string[] } | null = null
  for (const node of ((doc as JsonNode | null)?.content ?? []) as JsonNode[]) {
    if (node.type === 'heading') {
      const title = textOf(node)
      if (!title) continue
      current = { title, chunks: [] }
      parts.push(current)
      continue
    }
    const text = textOf(node)
    if (!text) continue
    if (!current) {
      current = { title: null, chunks: [] }
      parts.push(current)
    }
    current.chunks.push(text)
  }
  return parts.map((p) => ({ title: p.title, text: clip(p.chunks.join(' ')) }))
}
