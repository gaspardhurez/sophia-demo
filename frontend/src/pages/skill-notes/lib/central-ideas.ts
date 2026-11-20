import type { JSONContent } from '@tiptap/core'

import { HEADING } from './blocks'
import { QUESTION } from './question-node'
import type { QuestionSection, SectionPart } from './question-sections'

/**
 * Les idées centrales d'une section, côté écran (« Préparer les questions »,
 * « 🧠 Suggestions », #173) : ce qu'on envoie au serveur, et où une idée se
 * rattache dans les notes — le passage qu'elle surligne, la partie qui montre
 * sa carte, la place de la question qu'on en écrit.
 *
 * **Le rattachement se fait au premier rang du document** : l'extrait de
 * l'idée (`quote`) désigne le bloc de premier rang qui le contient (une
 * liste entière, un paragraphe, des colonnes…). C'est ce bloc que la carte
 * surligne, et c'est **juste après lui** (et après les questions qui le
 * suivent déjà) que la question écrite se pose : elle aura ce bloc pour
 * passage, celui-là même que la carte montrait. Sans extrait — ou un extrait
 * qu'on ne retrouve pas, ou logé dans un titre —, rien n'est surligné et la
 * question se pose en fin de section (après son dernier bloc non vide).
 */

/** Un identifiant de section qui tient pendant la visite : son titre et son
 *  rang parmi les sections du même titre (« start » pour le texte d'avant
 *  tout titre). L'index du titre dans le document, lui, bouge dès qu'une
 *  question se pose plus haut. */
export function sectionIds(sections: QuestionSection[]): string[] {
  const seen = new Map<string, number>()
  return sections.map((s) => {
    if (!s.title) return 'start'
    const name = `${s.title.level}:${s.title.text}`
    const n = seen.get(name) ?? 0
    seen.set(name, n + 1)
    return `${name}#${n}`
  })
}

/** Le fragment d'une section, tel que le serveur l'attend : ses nœuds de
 *  premier rang, son titre compris. */
export function sectionFragment(
  doc: JSONContent,
  section: QuestionSection,
): Record<string, unknown> {
  return {
    type: 'doc',
    content: (doc.content ?? []).slice(section.from, section.to),
  }
}

/** Le texte d'un nœud, ses morceaux bout à bout. */
function textOf(node: JSONContent): string {
  if (node.text) return node.text
  return (node.content ?? []).map(textOf).join('')
}

/** La section a-t-elle du texte à trier, hors titres ? Un titre seul ne
 *  vaut pas un appel au modèle (le serveur, lui, s'y prêterait). */
export function sectionHasText(section: QuestionSection): boolean {
  return section.parts.some((p) =>
    p.blocks.some(
      (b) => b.type !== QUESTION && b.type !== HEADING && !!textOf(b).trim(),
    ),
  )
}

const QUOTES: Record<string, string> = {
  '’': "'",
  '‘': "'",
  '“': '"',
  '”': '"',
  '«': '"',
  '»': '"',
}

/** La forme commune d'un texte, comme le serveur la lit
 *  (`domain/review._normalize`) : guillemets droits, espaces resserrées. */
function normalize(text: string): string {
  return text
    .replace(/[’‘“”«»]/g, (c) => QUOTES[c])
    .replace(/\s+/g, ' ')
    .trim()
}

/** Les blocs de texte d'un nœud (ce qui porte du texte en ligne), en
 *  profondeur. */
function textBlocks(node: JSONContent): JSONContent[] {
  if (!node.content) return []
  if (node.content.some((c) => c.type === 'text')) return [node]
  return node.content.flatMap(textBlocks)
}

/** Où se lit une idée : l'index au premier rang du bloc qui contient son
 *  extrait, et le texte du bloc de texte qui le porte (la réponse attendue
 *  qu'on propose). */
export interface IdeaAnchor {
  index: number
  text: string
}

/** Le bloc de la section qui contient l'extrait ; nul sans extrait, s'il est
 *  introuvable ou logé dans un titre. */
export function ideaAnchor(
  doc: JSONContent,
  section: QuestionSection,
  quote: string | null,
): IdeaAnchor | null {
  const needle = quote ? normalize(quote) : ''
  if (!needle) return null
  const content = doc.content ?? []
  for (let i = section.from; i < section.to; i++) {
    if (content[i].type === HEADING) continue
    const block = textBlocks(content[i]).find((b) =>
      normalize(textOf(b)).includes(needle),
    )
    if (block) return { index: i, text: textOf(block).trim() }
  }
  return null
}

/** La partie qui montre la carte d'une idée : celle de son bloc, ou la
 *  dernière (là où sa question se posera). */
export function ideaPart(
  section: QuestionSection,
  anchor: IdeaAnchor | null,
): SectionPart {
  const parts = section.parts
  if (anchor) {
    const own = parts.find((p) => p.at.includes(anchor.index))
    if (own) return own
  }
  return parts[parts.length - 1]
}

/** Où se pose la question écrite d'après une idée (index au premier rang) :
 *  après son bloc et les questions qui le suivent déjà, sinon en fin de
 *  section. */
export function ideaPlace(
  doc: JSONContent,
  section: QuestionSection,
  anchor: IdeaAnchor | null,
): number {
  if (!anchor) return section.parts[section.parts.length - 1].end
  const content = doc.content ?? []
  let at = anchor.index + 1
  while (content[at]?.type === QUESTION) at++
  return at
}
