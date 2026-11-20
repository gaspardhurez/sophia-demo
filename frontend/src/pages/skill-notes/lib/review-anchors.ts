import type { Editor } from '@tiptap/core'
import type { Node as PmNode, ResolvedPos } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

import './review.css'
import { TEXT_ITEM } from './text-children'

/**
 * **L'ancrage des commentaires de Sophia** dans les notes d'une ressource
 * (#173, `prod/Notes`, idéation `Verifier notes` 2a).
 *
 * Le serveur rend, pour chaque commentaire, `quote` : un extrait recopié
 * d'**un seul bloc** des notes, tel qu'il y figurait (il écarte ce qui ne
 * s'y retrouve pas, `quote_in_notes`). L'écran le **recherche dans le
 * document à l'affichage** et le surligne par une **décoration** ProseMirror
 * — rien n'est écrit dans le document enregistré.
 *
 * Pourquoi pas une marque persistée (`comment` dans le JSON des notes) :
 * - le document est le seul chemin d'écriture des notes, et il part d'un
 *   bloc à chaque frappe : une marque vivrait au rythme de l'autosave, d'un
 *   collage, d'un glisser, d'un « Annuler la dictée » — chacun peut la
 *   couper, la dupliquer ou la perdre, et le serveur n'en saurait rien ;
 * - deux vérités pour un même ancrage (la marque dans le doc, `quote` en
 *   base) finiraient par diverger ; ici il n'y en a qu'une, `quote` ;
 * - supprimer ou résoudre un commentaire n'a pas à réécrire les notes ;
 * - la règle est celle du serveur : un passage modifié depuis ne se
 *   retrouve plus, et le commentaire le dit (« passage introuvable ») au
 *   lieu de surligner autre chose.
 * Le prix : un passage réécrit perd son surlignage. C'est voulu — le
 * commentaire portait sur l'ancien texte.
 *
 * La recherche suit la normalisation du serveur (`_normalize`) : guillemets
 * typographiques ramenés à leur forme droite, blancs repliés en une espace,
 * bords rognés ; et sa lecture d'un bloc (`note_blocks`) : le texte, une
 * espace pour un saut de ligne, `$latex$` pour une formule en ligne, rien
 * pour une mention ou un emoji. Première occurrence, dans l'ordre du
 * document — celle que le serveur a validée.
 */

/** Ce que l'écran donne à ancrer : un commentaire, réduit à son ancrage. */
export interface ReviewAnchorInput {
  id: string
  /** `passage` : `quote` surligné ; `insertion` : l'oubli, après son bloc. */
  anchor: 'passage' | 'insertion'
  quote: string
  /** Ouvert : surligné (ou son trait « + ») ; résolu : ancré sans marque,
   *  pour que sa ligne repliée se cale encore à sa hauteur. */
  open: boolean
}

/** Où un extrait a été trouvé : sa plage, et la place d'un oubli. */
export interface Located {
  from: number
  to: number
  /** Après le bloc qui contient l'extrait : là où s'insère un oubli. */
  after: number
}

interface AnchorsState {
  inputs: ReviewAnchorInput[]
  activeId: string | null
  /** Les ids dont l'extrait ne se retrouve plus, triés : une clé stable. */
  missing: string
  decorations: DecorationSet
}

interface AnchorsMeta {
  inputs: ReviewAnchorInput[]
  activeId: string | null
}

export const reviewAnchorsKey = new PluginKey<AnchorsState>('reviewAnchors')

// --- La recherche -------------------------------------------------------------

const QUOTES: Record<string, string> = {
  '’': "'",
  '‘': "'",
  '“': '"',
  '”': '"',
  '«': '"',
  '»': '"',
}

/** Un caractère lu dans un bloc, et la plage du document qu'il occupe. */
interface Char {
  ch: string
  from: number
  to: number
}

/** La normalisation du serveur, sur une chaîne. */
export function normalizeQuote(text: string): string {
  return text
    .replace(/[’‘“”«»]/g, (c) => QUOTES[c])
    .replace(/\s+/g, ' ')
    .trim()
}

/** Le texte d'un bloc, caractère par caractère, avec sa place. */
function blockChars(node: PmNode, pos: number): Char[] {
  const chars: Char[] = []
  node.forEach((child, offset) => {
    const at = pos + 1 + offset
    if (child.isText) {
      const text = child.text ?? ''
      for (let i = 0; i < text.length; i++)
        chars.push({ ch: text[i], from: at + i, to: at + i + 1 })
    } else if (child.type.name === 'hardBreak') {
      chars.push({ ch: ' ', from: at, to: at + child.nodeSize })
    } else if (child.type.name === 'inlineMath') {
      const latex = child.attrs.latex
      if (typeof latex === 'string')
        for (const ch of `$${latex}$`)
          chars.push({ ch, from: at, to: at + child.nodeSize })
    }
  })
  return chars
}

/** Le même texte, normalisé comme le serveur, chaque caractère gardant sa
 *  place : une espace repliée prend celle du premier blanc. */
function normalizeChars(chars: Char[]): Char[] {
  const out: Char[] = []
  for (const c of chars) {
    if (/\s/.test(c.ch)) {
      if (out.length && out[out.length - 1].ch !== ' ')
        out.push({ ...c, ch: ' ' })
    } else out.push({ ...c, ch: QUOTES[c.ch] ?? c.ch })
  }
  if (out.length && out[out.length - 1].ch === ' ') out.pop()
  return out
}

const LIST_ITEMS = new Set(['listItem', 'taskItem', TEXT_ITEM])

/**
 * Là où s'insère un oubli : après le bloc qui contient l'extrait. Une ligne
 * de liste s'entend avec sa puce (après l'élément, pas au milieu de lui), un
 * paragraphe parent avec ses enfants ;
 * une cellule, avec son tableau (on ne glisse pas un trait entre deux
 * lignes d'un tableau).
 */
function insertionPoint($pos: ResolvedPos, blockEnd: number): number {
  if (LIST_ITEMS.has($pos.parent.type.name)) return $pos.after($pos.depth)
  for (let d = $pos.depth; d > 0; d--)
    if ($pos.node(d).type.name === 'table') return $pos.after(d)
  return blockEnd
}

/** Les blocs de texte du document, lus une fois pour toutes les recherches. */
function readBlocks(
  doc: PmNode,
): { pos: number; node: PmNode; chars: Char[] }[] {
  const blocks: { pos: number; node: PmNode; chars: Char[] }[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const chars = normalizeChars(blockChars(node, pos))
    if (chars.length) blocks.push({ pos, node, chars })
    return false
  })
  return blocks
}

/**
 * Cherche chaque extrait dans le document : sa première occurrence dans
 * **un** bloc (un extrait à cheval sur deux blocs ne s'ancre pas, comme au
 * serveur). Rend la place de chaque extrait trouvé.
 */
export function locateQuotes(
  doc: PmNode,
  quotes: { id: string; quote: string }[],
): Map<string, Located> {
  const found = new Map<string, Located>()
  if (!quotes.length) return found
  const blocks = readBlocks(doc)
  const texts = blocks.map((b) => b.chars.map((c) => c.ch).join(''))
  for (const { id, quote } of quotes) {
    const needle = normalizeQuote(quote)
    if (!needle) continue
    for (let i = 0; i < blocks.length; i++) {
      const at = texts[i].indexOf(needle)
      if (at < 0) continue
      const { pos, node, chars } = blocks[i]
      found.set(id, {
        from: chars[at].from,
        to: chars[at + needle.length - 1].to,
        after: insertionPoint(doc.resolve(pos), pos + node.nodeSize),
      })
      break
    }
  }
  return found
}

// --- Les décorations ----------------------------------------------------------

/** Le trait pointillé « + » d'un oubli, entre deux blocs (`prod/Notes`). */
function gapWidget(id: string, active: boolean): HTMLElement {
  const gap = document.createElement('div')
  gap.className = active ? 'review-gap is-active' : 'review-gap'
  gap.contentEditable = 'false'
  gap.dataset.reviewGap = id
  const plus = document.createElement('span')
  plus.className = 'review-gap-plus'
  plus.textContent = '+'
  const line = document.createElement('span')
  line.className = 'review-gap-line'
  gap.append(plus, line)
  return gap
}

function build(
  doc: PmNode,
  inputs: ReviewAnchorInput[],
  activeId: string | null,
): Pick<AnchorsState, 'missing' | 'decorations'> {
  const found = locateQuotes(doc, inputs)
  const decorations: Decoration[] = []
  const missing: string[] = []
  for (const input of inputs) {
    const at = found.get(input.id)
    if (!at) {
      missing.push(input.id)
      continue
    }
    const active = input.id === activeId
    // Toujours une marque sans style sur l'extrait : la hauteur où se cale
    // la carte, même résolue (sa ligne repliée reste à son passage).
    const marked = input.open && input.anchor === 'passage'
    decorations.push(
      Decoration.inline(
        at.from,
        at.to,
        {
          class: marked
            ? active
              ? 'review-passage is-active'
              : 'review-passage'
            : '',
          'data-review-anchor': input.id,
        },
        { inclusiveStart: false, inclusiveEnd: false },
      ),
    )
    if (input.open && input.anchor === 'insertion')
      decorations.push(
        Decoration.widget(at.after, () => gapWidget(input.id, active), {
          side: -1,
          key: `${input.id}:${active ? 'a' : 'i'}`,
          ignoreSelection: true,
        }),
      )
  }
  return {
    missing: missing.sort().join(' '),
    decorations: DecorationSet.create(doc, decorations),
  }
}

/**
 * Le plugin des ancrages : il garde les commentaires à ancrer et l'actif,
 * et recalcule ses décorations à chaque changement du document — un
 * passage réécrit cesse d'être surligné, un passage retrouvé (⌘Z) l'est
 * de nouveau. Il n'écrit rien : ses transactions de mise à jour sortent de
 * l'historique et ne changent pas le document (l'autosave les ignore).
 */
function reviewAnchorsPlugin(): Plugin<AnchorsState> {
  return new Plugin<AnchorsState>({
    key: reviewAnchorsKey,
    state: {
      init: () => ({
        inputs: [],
        activeId: null,
        missing: '',
        decorations: DecorationSet.empty,
      }),
      apply: (tr, prev, _old, state) => {
        const meta = tr.getMeta(reviewAnchorsKey) as AnchorsMeta | undefined
        if (!meta && !tr.docChanged) return prev
        const inputs = meta?.inputs ?? prev.inputs
        const activeId = meta ? meta.activeId : prev.activeId
        return { inputs, activeId, ...build(state.doc, inputs, activeId) }
      },
    },
    props: {
      decorations: (state) => reviewAnchorsKey.getState(state)?.decorations,
    },
  })
}

/** Pose le plugin sur un éditeur déjà créé (les extensions des notes sont
 *  figées à la création) ; rend de quoi le retirer. */
export function installReviewAnchors(editor: Editor): () => void {
  editor.registerPlugin(reviewAnchorsPlugin())
  return () => {
    if (!editor.isDestroyed) editor.unregisterPlugin(reviewAnchorsKey)
  }
}

/** Donne au plugin les commentaires à ancrer et l'actif. */
export function setReviewAnchors(
  editor: Editor,
  inputs: ReviewAnchorInput[],
  activeId: string | null,
) {
  if (editor.isDestroyed || !reviewAnchorsKey.getState(editor.state)) return
  const meta: AnchorsMeta = { inputs, activeId }
  editor.view.dispatch(
    editor.state.tr
      .setMeta(reviewAnchorsKey, meta)
      .setMeta('addToHistory', false),
  )
}

/** Les ids dont l'extrait ne se retrouve plus (clé stable, triée). */
export function missingAnchors(editor: Editor): string {
  return reviewAnchorsKey.getState(editor.state)?.missing ?? ''
}

/** Le plugin a-t-il reçu ce commentaire (sa décoration est-elle posée) ? */
export function anchorKnown(editor: Editor, id: string): boolean {
  return !!reviewAnchorsKey
    .getState(editor.state)
    ?.inputs.some((input) => input.id === id)
}

/**
 * L'élément où se cale la carte d'un commentaire : le trait « + » d'un oubli
 * ouvert, sinon la marque posée sur son extrait (la première, quand des
 * marques de mise en forme la découpent).
 */
export function anchorElement(editor: Editor, id: string): HTMLElement | null {
  const root = editor.view.dom
  return (
    root.querySelector<HTMLElement>(`[data-review-gap="${id}"]`) ??
    root.querySelector<HTMLElement>(`[data-review-anchor="${id}"]`)
  )
}
