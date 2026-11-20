import { Extension, Mark } from '@tiptap/core'
import type { Mark as Mark_, Node as PMNode } from '@tiptap/pm/model'
import {
  type EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

import { HEADING, PARAGRAPH } from './blocks'
import { QUESTION_REF, QUESTIONS, questionsIn } from './question-anchors'

/**
 * **Les exemples** des notes (#211, `kit/Exemple`) : un exemple illustre un
 * passage d'un bloc de texte — un paragraphe, le texte d'un élément de
 * liste —, ou le bloc entier.
 *
 * Ils vivent **dans le document**, sans table : un passage porte la marque
 * `example` (son id, son titre, son texte) ; un exemple du bloc entier est
 * dans l'attribut `examples` du bloc de texte. Une marque suit l'édition
 * d'elle-même — un passage réécrit en partie la garde, un bloc déplacé
 * l'emporte, un texte effacé l'emporte aussi. Le serveur ne lit pas les
 * exemples : rien à y changer.
 *
 * (Les commentaires de Sophia, eux, se retrouvent par leur citation, sans
 * rien écrire dans les notes — `review-anchors` : un passage réécrit perd
 * son commentaire, et c'est voulu. Un exemple doit au contraire suivre son
 * passage.)
 */

export const EXAMPLE = 'example'

/** Ce qu'un exemple porte. */
export interface ExampleData {
  id: string
  /** Facultatif : vide s'il n'en a pas. */
  title: string
  text: string
}

/** Un exemple du document, avec sa place. */
export interface PlacedExample extends ExampleData {
  /** Le début du bloc de texte où il commence. */
  block: number
  /** Le début du bloc de texte où il finit (le même pour un seul bloc). */
  lastBlock: number
  /** Le passage illustré ; pour le bloc entier, tout son texte. */
  from: number
  to: number
  /** Sur le bloc entier (pas de passage). */
  whole: boolean
}

/** La marque d'un passage illustré. Au repos, elle ne se voit pas. */
export const ExampleMark = Mark.create({
  name: EXAMPLE,
  // Une frappe au bord du passage ne l'allonge pas.
  inclusive: false,
  // Les annotations peuvent se chevaucher (#213) : deux exemples sur un
  // même texte.
  excludes: '',

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-example'),
        renderHTML: (attrs) => ({ 'data-example': attrs.id as string }),
      },
      title: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-example-title') ?? '',
        renderHTML: (attrs) =>
          attrs.title ? { 'data-example-title': attrs.title as string } : {},
      },
      text: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-example-text') ?? '',
        renderHTML: (attrs) => ({ 'data-example-text': attrs.text as string }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-example]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0]
  },
})

/** Les exemples du bloc entier : un attribut du bloc de texte. */
const wholeBlockExamples = Extension.create({
  name: 'wholeBlockExamples',
  addGlobalAttributes() {
    return [
      {
        types: [PARAGRAPH],
        attributes: {
          examples: {
            default: null,
            // Entrée au milieu du bloc : la seconde moitié n'en hérite pas.
            keepOnSplit: false,
            parseHTML: () => null,
            renderHTML: () => ({}),
          },
        },
      },
    ]
  },
})

/** Les exemples d'un bloc entier, lus sans confiance (le JSON enregistré). */
function blockExamples(node: PMNode): ExampleData[] {
  const raw: unknown = node.attrs.examples
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (e): e is ExampleData =>
      typeof e?.id === 'string' && typeof e?.text === 'string',
  )
}

/** Un morceau de passage marqué : un nœud de texte et son bloc. */
interface Piece {
  from: number
  to: number
  block: number
  mark: Mark_
}

/** Les morceaux marqués de chaque id (marque `mark`), dans l'ordre du document. */
function piecesById(doc: PMNode, mark: string): Map<string, Piece[]> {
  const byId = new Map<string, Piece[]>()
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    node.forEach((child, offset) => {
      // Plusieurs marques d'un même type (des questions qui se chevauchent).
      for (const m of child.marks) {
        const id = m.attrs.id as string | null | undefined
        if (m.type.name !== mark || !id) continue
        const from = pos + 1 + offset
        const list = byId.get(id) ?? []
        list.push({ from, to: from + child.nodeSize, block: pos, mark: m })
        byId.set(id, list)
      }
    })
    return false
  })
  return byId
}

/**
 * Ce texte peut-il porter la marque `mark` ? Pas dans un bloc qui la refuse
 * (le code), ni sous une marque qui l'exclut (le code en ligne).
 */
function canCarry(node: PMNode, parent: PMNode | null, mark = EXAMPLE) {
  const type = node.type.schema.marks[mark]
  return (
    !!parent?.type.allowsMarkType(type) &&
    // Une marque d'annotation n'exclut que ses semblables, pas le texte.
    !node.marks.some((m) => m.type !== type && m.type.excludes(type))
  )
}

/** Entre `from` et `to`, aucun texte qui aurait pu porter la marque. */
function joined(doc: PMNode, from: number, to: number, mark: string) {
  let gap = false
  doc.nodesBetween(from, to, (node, _pos, parent) => {
    if (gap) return false
    if (node.isText && canCarry(node, parent, mark)) gap = true
    return !node.isText
  })
  return !gap
}

/**
 * Combien des morceaux d'une annotation forment son passage : le premier, et
 * ceux qui le continuent — entre eux, seulement des limites de blocs ou du
 * texte qui ne peut pas porter la marque (du code en ligne). Au-delà (un
 * doublon collé ailleurs), ce n'est plus elle.
 */
function runLength(doc: PMNode, pieces: Piece[], mark: string) {
  let n = 1
  while (
    n < pieces.length &&
    joined(doc, pieces[n - 1].to, pieces[n].from, mark)
  )
    n++
  return n
}

/** Un passage marqué : l'id de son annotation, sa marque, sa place. */
export interface MarkedPassage {
  id: string
  mark: Mark_
  block: number
  lastBlock: number
  from: number
  to: number
}

/**
 * Les passages d'une marque d'annotation (`example`, `questionRef`), dans
 * l'ordre du document : pour chaque id, son premier passage **continu**, qui
 * peut traverser plusieurs blocs qui se suivent.
 */
export function markedPassages(doc: PMNode, mark: string): MarkedPassage[] {
  return [...piecesById(doc, mark)].map(([id, pieces]) => {
    const run = pieces.slice(0, runLength(doc, pieces, mark))
    const first = run[0]
    const last = run[run.length - 1]
    return {
      id,
      mark: first.mark,
      block: first.block,
      lastBlock: last.block,
      from: first.from,
      to: last.to,
    }
  })
}

/**
 * Les exemples du document, dans l'ordre du texte. Un passage est **continu**
 * et peut traverser plusieurs blocs qui se suivent (un paragraphe et sa
 * liste, une section) ; un exemple du bloc entier couvre le texte de son
 * bloc. Un id qui revient plus loin, détaché de son passage, est ignoré.
 */
export function examplesIn(doc: PMNode): PlacedExample[] {
  const found: PlacedExample[] = []
  const seen = new Set<string>()
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    for (const e of blockExamples(node)) {
      if (seen.has(e.id)) continue
      seen.add(e.id)
      found.push({
        ...e,
        title: e.title ?? '',
        block: pos,
        lastBlock: pos,
        from: pos + 1,
        to: pos + node.nodeSize - 1,
        whole: true,
      })
    }
    return false
  })
  for (const p of markedPassages(doc, EXAMPLE)) {
    if (seen.has(p.id)) continue
    found.push({
      id: p.id,
      title: (p.mark.attrs.title as string) ?? '',
      text: (p.mark.attrs.text as string) ?? '',
      block: p.block,
      lastBlock: p.lastBlock,
      from: p.from,
      to: p.to,
      whole: false,
    })
  }
  // Le bloc entier d'abord, à début égal.
  return found.sort(
    (a, b) => a.from - b.from || Number(b.whole) - Number(a.whole),
  )
}

/**
 * Un exemple **en cours d'écriture** (`kit/Exemple`, « Créer », « Modifier ») :
 * le passage choisi — ou le bloc entier —, éclairé tant que la carte de
 * saisie est ouverte. Ses positions suivent les changements du document.
 */
export interface ExampleDraft {
  /** Son numéro : un formulaire par brouillon commencé. */
  seq: number
  /** Ce qu'on écrit (#213) : un exemple, ou une question. */
  kind: AnnotationKind
  /** Le début du bloc où commence le passage, et de celui où il finit. */
  block: number
  lastBlock: number
  from: number
  to: number
  whole: boolean
  /** L'exemple qu'on modifie ; nul pour un nouveau. */
  edit: ExampleData | null
  /** Écrit sur un titre : une question de section, la bulle à gauche. */
  heading: boolean
}

/** Les deux sortes d'annotation (#213). */
export type AnnotationKind = 'example' | 'question'

/**
 * L'exemple éclairé (survolé ou épinglé), celui qu'on écrit, et celui dont
 * on choisit le nouveau passage (`moving`).
 */
interface ExamplesState {
  /** Le passage éclairé : l'annotation survolée ou épinglée. */
  lit: LitRange | null
  draft: ExampleDraft | null
  moving: { kind: AnnotationKind; id: string } | null
  /** Pourquoi la dernière validation du nouveau passage a été refusée. */
  problem: PassageProblem | null
  erasing: Erasing | null
}

/**
 * Une modification retenue parce qu'elle effaçait un passage illustré (ou
 * le bloc d'un exemple) : elle attend la confirmation (`confirmErase`).
 */
export interface Erasing {
  tr: Transaction
  examples: ExampleData[]
  /** Les ids des questions qu'elle effacerait (#213). */
  questions: string[]
}

/** La méta d'une transaction qui a le droit d'effacer des exemples. */
const ERASE_OK = 'exampleEraseOk'

const key = new PluginKey<ExamplesState>('examples')

type Meta = Partial<ExamplesState>

function dispatchMeta(view: EditorView, meta: Meta) {
  view.dispatch(view.state.tr.setMeta(key, meta).setMeta('addToHistory', false))
}

/** Un passage à éclairer — ou tout le texte d'un bloc (`whole`). */
export interface LitRange {
  block: number
  from: number
  to: number
  whole: boolean
}

const sameRange = (a: LitRange | null, b: LitRange | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.block === b.block &&
    a.from === b.from &&
    a.to === b.to &&
    a.whole === b.whole)

/** Éclaire le passage d'une annotation (`null` : aucun). */
export function setLit(view: EditorView, range: LitRange | null) {
  if (sameRange(key.getState(view.state)?.lit ?? null, range)) return
  dispatchMeta(view, {
    lit: range && {
      block: range.block,
      from: range.from,
      to: range.to,
      whole: range.whole,
    },
  })
}

/** L'exemple en cours d'écriture, s'il y en a un. */
export function exampleDraftOf(state: EditorState): ExampleDraft | null {
  return key.getState(state)?.draft ?? null
}

/** Une annotation dont on change le passage : sa sorte, son id, sa place. */
export interface MovingAnnotation {
  kind: AnnotationKind
  id: string
  block: number
  lastBlock: number
  from: number
  to: number
  whole: boolean
}

/** Un exemple ou une question du document, à sa place. */
function placedOf(
  doc: PMNode,
  kind: AnnotationKind,
  id: string,
): MovingAnnotation | null {
  const found =
    kind === 'example'
      ? examplesIn(doc).find((e) => e.id === id)
      : questionsIn(doc).find((q) => q.id === id)
  if (!found) return null
  const { block, lastBlock, from, to, whole } = found
  return { kind, id, block, lastBlock, from, to, whole }
}

/** L'annotation dont on choisit le nouveau passage, s'il y en a une. */
export function movingAnnotationOf(
  state: EditorState,
): MovingAnnotation | null {
  const moving = key.getState(state)?.moving
  return moving ? placedOf(state.doc, moving.kind, moving.id) : null
}

/**
 * Le texte de `from` à `to` porte-t-il du texte qui peut recevoir une
 * annotation (pas du code, en bloc ou en ligne) ?
 */
function hasText(state: EditorState, from: number, to: number) {
  let text = false
  state.doc.nodesBetween(from, to, (node, _pos, parent) => {
    if (text) return false
    if (node.isText && canCarry(node, parent)) text = true
    return !node.isText
  })
  return text
}

/**
 * Peut-on annoter le texte de `from` à `to` ? Un passage qui contient du
 * texte — dans un bloc ou à travers plusieurs qui se suivent. Les
 * annotations peuvent se chevaucher (#213).
 */
export function canIllustrate(state: EditorState, from: number, to: number) {
  return from < to && hasText(state, from, to)
}

/**
 * Le passage d'une sélection, ramené au texte : une sélection qui commence
 * en fin de bloc ou finit en début de bloc (un triple-clic, un glisser
 * jusqu'à la ligne suivante) ne déborde pas sur un bloc sans texte choisi.
 * Avec le début du premier bloc et du dernier.
 */
function passageAt(state: EditorState, from: number, to: number) {
  const { doc } = state
  let $from = doc.resolve(from)
  let $to = doc.resolve(to)
  if ($from.parentOffset === $from.parent.content.size && from < to) {
    const next = TextSelection.findFrom(doc.resolve($from.after()), 1, true)
    if (next && next.from < to) $from = next.$from
  }
  if ($to.parentOffset === 0 && $from.pos < to) {
    const prev = TextSelection.findFrom(doc.resolve($to.before()), -1, true)
    if (prev && prev.to > $from.pos) $to = prev.$to
  }
  return {
    from: $from.pos,
    to: $to.pos,
    block: $from.before(),
    lastBlock: $to.before(),
  }
}

let drafts = 0

/**
 * Ouvre le formulaire d'une annotation (`kind`) : sur le passage de `from` à
 * `to` (un ou plusieurs blocs), ou sur tout le bloc de texte qui commence en
 * `block` (sans passage). Une question écrite sur un titre est une question
 * de **section** : sur le titre entier. Le curseur se pose à la fin du
 * passage : la barre de sélection s'efface.
 */
export function startAnnotationDraft(
  view: EditorView,
  at: { block: number } | { from: number; to: number },
  kind: AnnotationKind = 'example',
) {
  const { state } = view
  let draft: ExampleDraft
  const onHeading = (pos: number) =>
    state.doc.nodeAt(pos)?.type.name === HEADING
  const wholeBlock = (block: number): ExampleDraft | null => {
    const node = state.doc.nodeAt(block)
    if (!node?.isTextblock) return null
    return {
      seq: ++drafts,
      kind,
      block,
      lastBlock: block,
      from: block + 1,
      to: block + node.nodeSize - 1,
      whole: true,
      edit: null,
      heading: node.type.name === HEADING,
    }
  }
  if ('block' in at) {
    const whole = wholeBlock(at.block)
    // Un exemple du bloc entier vit sur un paragraphe.
    if (!whole || (kind === 'example' && whole.heading)) return
    draft = whole
  } else {
    if (!canIllustrate(state, at.from, at.to)) return
    const place = passageAt(state, at.from, at.to)
    const section =
      kind === 'question' &&
      place.block === place.lastBlock &&
      onHeading(place.block)
        ? wholeBlock(place.block)
        : null
    draft = section ?? {
      seq: ++drafts,
      kind,
      ...place,
      whole: false,
      edit: null,
      heading: onHeading(place.block),
    }
  }
  view.dispatch(
    state.tr
      .setSelection(TextSelection.create(state.doc, draft.to))
      .setMeta(key, { draft, moving: null } satisfies Meta)
      .setMeta('addToHistory', false),
  )
}

/** Ouvre la carte de saisie sur un exemple existant, pré-remplie. */
export function startExampleEdit(view: EditorView, id: string) {
  const example = examplesIn(view.state.doc).find((e) => e.id === id)
  if (!example) return
  const { id: _, title, text, ...place } = example
  dispatchMeta(view, {
    draft: {
      seq: ++drafts,
      kind: 'example',
      ...place,
      edit: { id, title, text },
      heading: false,
    },
    moving: null,
  })
}

/**
 * Ouvre le formulaire d'une question existante, pré-rempli de son énoncé
 * et de sa réponse (un élément par ligne).
 */
export function startQuestionEdit(
  view: EditorView,
  id: string,
  content: { prompt: string; answer: string },
) {
  const placed = placedOf(view.state.doc, 'question', id)
  if (!placed) return
  const { kind: _, id: __, ...place } = placed
  dispatchMeta(view, {
    draft: {
      seq: ++drafts,
      kind: 'question',
      ...place,
      edit: { id, title: content.prompt, text: content.answer },
      heading: view.state.doc.nodeAt(placed.block)?.type.name === HEADING,
    },
    moving: null,
  })
}

/** Sur `tr`, le brouillon se ferme (son annotation vient d'être écrite). */
export function withoutDraft(tr: Transaction) {
  return tr.setMeta(key, { draft: null } satisfies Meta)
}

/** Ferme le formulaire sans rien écrire. */
export function cancelExampleDraft(view: EditorView) {
  if (!exampleDraftOf(view.state)) return
  dispatchMeta(view, { draft: null })
}

/**
 * Écrit l'exemple en cours : la marque sur son passage, ou une entrée de
 * plus dans les exemples du bloc — ou, pour une modification, son nouveau
 * titre et son nouveau texte à sa place. Un exemple sans texte ne s'écrit
 * pas.
 */
export function commitExampleDraft(
  view: EditorView,
  content: { title: string; text: string },
) {
  const { state } = view
  const draft = exampleDraftOf(state)
  const text = content.text.trim()
  if (!draft || draft.kind !== 'example' || !text) return
  const example: ExampleData = {
    id: draft.edit?.id ?? crypto.randomUUID(),
    title: content.title.trim(),
    text,
  }
  const tr = state.tr.setMeta(key, { draft: null } satisfies Meta)
  if (draft.edit) {
    const placed = examplesIn(state.doc).find((e) => e.id === example.id)
    const node = placed && state.doc.nodeAt(placed.block)
    if (!placed || !node) return
    if (placed.whole)
      // À sa place parmi les exemples du bloc.
      tr.setNodeAttribute(
        placed.block,
        'examples',
        blockExamples(node).map((e) => (e.id === example.id ? example : e)),
      )
    else {
      dropExample(tr, placed)
      putExample(tr, { ...placed, ...example })
    }
  } else {
    putExample(tr, { ...draft, ...example })
  }
  view.dispatch(tr)
}

/** Supprime un exemple : sa marque partout où elle est, ou son entrée. */
export function removeExample(view: EditorView, id: string) {
  const placed = examplesIn(view.state.doc).find((e) => e.id === id)
  if (!placed) return
  const tr = view.state.tr.setMeta(ERASE_OK, true)
  dropExample(tr, placed)
  view.dispatch(tr)
}

/** La modification qui attend la confirmation de l'effacement, s'il y en a. */
export function erasingOf(state: EditorState): Erasing | null {
  return key.getState(state)?.erasing ?? null
}

/**
 * L'effacement confirmé : la modification retenue passe, ses exemples
 * avec elle — si rien n'a bougé depuis.
 */
export function confirmErase(view: EditorView) {
  const erasing = erasingOf(view.state)
  if (!erasing) return
  dispatchMeta(view, { erasing: null })
  if (erasing.tr.before === view.state.doc)
    view.dispatch(erasing.tr.setMeta(ERASE_OK, true))
}

/** L'effacement refusé : le texte reste. */
export function cancelErase(view: EditorView) {
  if (!erasingOf(view.state)) return
  dispatchMeta(view, { erasing: null })
}

/**
 * « Changer le passage » : l'ancien passage en pointillé, et **sélectionné**
 * dans le texte — on l'ajuste (⇧ + clic, ⇧ + flèches) ou on en sélectionne un
 * autre, puis on valide (`applyPassageChange`).
 */
export function startPassageChange(
  view: EditorView,
  id: string,
  kind: AnnotationKind = 'example',
) {
  const placed = placedOf(view.state.doc, kind, id)
  if (!placed) return
  view.dispatch(
    view.state.tr
      .setSelection(
        TextSelection.create(view.state.doc, placed.from, placed.to),
      )
      .setMeta(key, { moving: { kind, id }, draft: null } satisfies Meta)
      .setMeta('addToHistory', false),
  )
  view.focus()
}

export function cancelPassageChange(view: EditorView) {
  if (!key.getState(view.state)?.moving) return
  dispatchMeta(view, { moving: null })
}

/** Pourquoi la sélection ne peut pas devenir le passage (rien : elle peut). */
export type PassageProblem = 'empty'

/** Ce qui empêche la sélection de devenir le passage de l'exemple déplacé. */
export function passageProblem(state: EditorState): PassageProblem | null {
  const placed = movingAnnotationOf(state)
  const { from, to, empty } = state.selection
  if (!placed) return null
  if (empty || !hasText(state, from, to)) return 'empty'
  return null
}

/**
 * La sélection devient le passage de l'exemple qu'on déplace, si elle le
 * peut (`passageProblem`). Le curseur se pose à la fin du nouveau passage.
 */
/** Le refus de la dernière validation, à dire dans le bandeau. */
export function passageProblemOf(state: EditorState): PassageProblem | null {
  return key.getState(state)?.problem ?? null
}

/**
 * Valider le nouveau passage (Entrée, « Valider ») : il s'applique, ou le
 * refus se dit (`passageProblemOf`).
 */
export function validatePassage(view: EditorView) {
  const problem = passageProblem(view.state)
  if (problem) dispatchMeta(view, { problem })
  else applyPassageChange(view)
}

export function applyPassageChange(view: EditorView): boolean {
  const { state } = view
  const placed = movingAnnotationOf(state)
  if (!placed || passageProblem(state)) return false
  const { from, to } = passageAt(
    state,
    state.selection.from,
    state.selection.to,
  )
  const tr = state.tr
  if (placed.kind === 'example') {
    const example = examplesIn(state.doc).find((e) => e.id === placed.id)
    if (!example) return false
    dropExample(tr, example)
    putExample(tr, { ...example, from, to, whole: false })
  } else {
    dropQuestion(tr, placed.id)
    tr.addMark(
      from,
      to,
      state.schema.marks[QUESTION_REF].create({ id: placed.id }),
    )
  }
  tr.setSelection(TextSelection.create(tr.doc, to))
  tr.setMeta(key, { moving: null } satisfies Meta)
  view.dispatch(tr)
  return true
}

/** Pose un exemple : sa marque sur le passage, ou une entrée du bloc. */
function putExample(
  tr: Transaction,
  example: PlacedExample | (ExampleDraft & ExampleData),
) {
  const data: ExampleData = {
    id: example.id,
    title: example.title,
    text: example.text,
  }
  if (example.whole) {
    const node = tr.doc.nodeAt(example.block)
    if (!node) return
    tr.setNodeAttribute(example.block, 'examples', [
      ...blockExamples(node),
      data,
    ])
  } else {
    tr.addMark(
      example.from,
      example.to,
      tr.doc.type.schema.marks[EXAMPLE].create(data),
    )
  }
}

/**
 * Retire un exemple : son entrée dans le bloc, ou chaque morceau marqué de
 * son id dans tout le document (un passage coupé, un doublon collé).
 */
function dropExample(tr: Transaction, example: PlacedExample) {
  if (example.whole) {
    const node = tr.doc.nodeAt(example.block)
    if (!node) return
    const rest = blockExamples(node).filter((e) => e.id !== example.id)
    tr.setNodeAttribute(example.block, 'examples', rest.length ? rest : null)
    return
  }
  const pieces: { from: number; to: number; mark: Mark_ }[] = []
  tr.doc.descendants((node, pos) => {
    if (!node.isText) return true
    const mark = node.marks.find(
      (m) => m.type.name === EXAMPLE && m.attrs.id === example.id,
    )
    if (mark) pieces.push({ from: pos, to: pos + node.nodeSize, mark })
    return false
  })
  for (const piece of pieces) tr.removeMark(piece.from, piece.to, piece.mark)
}

/**
 * Retire les ancres d'une question : ses marques dans tout le document, son
 * id dans les questions des blocs.
 */
function dropQuestion(tr: Transaction, id: string) {
  const pieces: { from: number; to: number; mark: Mark_ }[] = []
  const blocks: { pos: number; rest: string[] }[] = []
  tr.doc.descendants((node, pos) => {
    if (node.isTextblock) {
      const ids: unknown = node.attrs[QUESTIONS]
      if (Array.isArray(ids) && ids.includes(id))
        blocks.push({ pos, rest: ids.filter((x) => x !== id) })
      return true
    }
    if (!node.isText) return true
    for (const m of node.marks)
      if (m.type.name === QUESTION_REF && m.attrs.id === id)
        pieces.push({ from: pos, to: pos + node.nodeSize, mark: m })
    return false
  })
  for (const piece of pieces) tr.removeMark(piece.from, piece.to, piece.mark)
  for (const b of blocks)
    tr.setNodeAttribute(b.pos, QUESTIONS, b.rest.length ? b.rest : null)
}

/** Retire les ancres d'une question supprimée (le texte reste). */
export function removeQuestionAnchors(view: EditorView, id: string) {
  const tr = view.state.tr.setMeta(ERASE_OK, true)
  dropQuestion(tr, id)
  if (tr.docChanged) view.dispatch(tr)
}

/** Les exemples d'un document par id, lus une fois par document. */
const byDoc = new WeakMap<PMNode, Map<string, PlacedExample>>()
function examplesById(doc: PMNode) {
  let found = byDoc.get(doc)
  if (!found) {
    found = new Map(examplesIn(doc).map((e) => [e.id, e]))
    byDoc.set(doc, found)
  }
  return found
}

/** Les questions placées d'un document, lues une fois par document. */
const questionsByDoc = new WeakMap<PMNode, Set<string>>()
function questionIds(doc: PMNode) {
  let found = questionsByDoc.get(doc)
  if (!found) {
    found = new Set(questionsIn(doc).map((q) => q.id))
    questionsByDoc.set(doc, found)
  }
  return found
}

/**
 * Les annotations que `tr` ferait disparaître : leur passage effacé en
 * entier, leur bloc supprimé ou fondu dans un autre. Une annotation (⌘Z) ou
 * une transaction autorisée (`ERASE_OK`) n'en fait disparaître aucune.
 */
function erasedBy(
  tr: Transaction,
  state: EditorState,
): { examples: ExampleData[]; questions: string[] } {
  const none = { examples: [], questions: [] }
  if (!tr.docChanged || tr.getMeta(ERASE_OK) || tr.getMeta('history$'))
    return none
  const before = examplesById(state.doc)
  const asked = questionIds(state.doc)
  if (!before.size && !asked.size) return none
  const after = examplesById(tr.doc)
  const still = questionIds(tr.doc)
  return {
    examples: [...before.values()]
      .filter((e) => !after.has(e.id))
      .map(({ id, title, text }) => ({ id, title, text })),
    questions: [...asked].filter((id) => !still.has(id)),
  }
}

/**
 * Un exemple ne vit qu'à un endroit : son premier passage continu, ou sa
 * première entrée de bloc. Ailleurs — un bloc dupliqué, un passage collé plus
 * loin — sa marque ou son entrée tombe. Entrée au milieu d'un passage le
 * laisse entier, à cheval sur les deux blocs. (Couper puis coller un passage
 * le déplace : l'original parti, le collé est le premier.)
 */
function keepFirst(state: EditorState): Transaction | null {
  if (!examplesById(state.doc).size && !questionIds(state.doc).size) return null
  const seen = new Set<string>()
  const asked = new Set<string>()
  const tr = state.tr
  state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const list = blockExamples(node)
    const kept = list.filter((e) => !seen.has(e.id))
    for (const e of kept) seen.add(e.id)
    if (kept.length !== list.length)
      tr.setNodeAttribute(pos, 'examples', kept.length ? kept : null)
    // Les questions entières d'un bloc : la première place compte.
    const ids: unknown = node.attrs[QUESTIONS]
    if (Array.isArray(ids)) {
      const keptIds = ids.filter((id) => !asked.has(id))
      for (const id of keptIds) asked.add(id)
      if (keptIds.length !== ids.length)
        tr.setNodeAttribute(pos, QUESTIONS, keptIds.length ? keptIds : null)
    }
    return false
  })
  for (const [id, pieces] of piecesById(state.doc, QUESTION_REF)) {
    const keep = asked.has(id) ? 0 : runLength(state.doc, pieces, QUESTION_REF)
    for (const piece of pieces.slice(keep))
      tr.removeMark(piece.from, piece.to, piece.mark)
  }
  for (const [id, pieces] of piecesById(state.doc, EXAMPLE)) {
    // Un id aussi du bloc entier, ou des morceaux détachés de son passage.
    const keep = seen.has(id) ? 0 : runLength(state.doc, pieces, EXAMPLE)
    for (const piece of pieces.slice(keep))
      tr.removeMark(piece.from, piece.to, piece.mark)
  }
  return tr.docChanged ? tr.setMeta(ERASE_OK, true) : null
}

/** Les repères des passages : l'exemple ouvert, celui dont on change le passage. */
export const LIT = 'note-example-on'
export const MOVING = 'note-example-moving'

/**
 * Les repères du surlignage (`AnnotationMargin` dessine les bandes) :
 * l'annotation active (survolée ou épinglée), ou celle qu'on écrit ; celle
 * dont on change le passage, son ancien passage en pointillé.
 */
function decorations(state: EditorState) {
  const { lit, draft } = key.getState(state) ?? { lit: null, draft: null }
  const found: Decoration[] = []
  const moving = movingAnnotationOf(state)
  if (moving) found.push(...lightOn(state, moving, MOVING))
  const range = draft ?? lit
  if (range && !sameRange(range, moving))
    found.push(...lightOn(state, range, LIT))
  return found.length ? DecorationSet.create(state.doc, found) : null
}

/**
 * Le repère d'un passage, de la classe `className` : il ne dessine rien —
 * l'éditeur ne peut le poser que morceau par morceau (texte, gras, code en
 * ligne sont des éléments distincts), et des boîtes différentes ne font pas
 * un surlignage continu. `ExampleMargin` mesure ses morceaux et dessine une
 * bande par ligne. Un exemple du bloc entier : tout le texte du bloc.
 */
function lightOn(
  state: EditorState,
  range: { block: number; whole: boolean; from: number; to: number },
  className: string,
): Decoration[] {
  const block = state.doc.nodeAt(range.block)
  const from = range.whole ? range.block + 1 : range.from
  const to = range.whole ? range.block + (block?.nodeSize ?? 2) - 1 : range.to
  return from < to ? [Decoration.inline(from, to, { class: className })] : []
}

const examplesPlugin = Extension.create({
  name: 'examplesState',
  // Avant les claviers des blocs : Entrée en « Changer le passage ».
  priority: 1000,
  addProseMirrorPlugins() {
    // La vue, pour ouvrir la confirmation d'un effacement retenu.
    let current: EditorView | null = null
    return [
      new Plugin<ExamplesState>({
        key,
        view: (view) => {
          current = view
          return {
            destroy: () => {
              current = null
            },
          }
        },
        state: {
          init: () => ({
            lit: null,
            draft: null,
            moving: null,
            problem: null,
            erasing: null,
          }),
          apply: (tr, value) => {
            let { lit, draft, moving, problem, erasing } = value
            // Le refus s'efface dès que la sélection bouge.
            if (problem && (tr.selectionSet || tr.docChanged)) problem = null
            if (draft && tr.docChanged) {
              const { mapping } = tr
              draft = {
                ...draft,
                block: mapping.map(draft.block, -1),
                lastBlock: mapping.map(draft.lastBlock, -1),
                from: mapping.map(draft.from, 1),
                to: mapping.map(draft.to, -1),
              }
              // Son texte effacé : plus rien à illustrer.
              if (!draft.whole && draft.from >= draft.to) draft = null
            }
            // Le passage éclairé suit le document.
            if (lit && tr.docChanged) {
              const { mapping } = tr
              lit = {
                ...lit,
                block: mapping.map(lit.block, -1),
                from: mapping.map(lit.from, 1),
                to: mapping.map(lit.to, -1),
              }
              if (lit.from > lit.to) lit = null
            }
            // Le document a bougé : la modification retenue n'a plus lieu.
            if (erasing && tr.docChanged) erasing = null
            const meta = tr.getMeta(key) as Meta | undefined
            if (meta && 'lit' in meta) lit = meta.lit ?? null
            if (meta && 'draft' in meta) draft = meta.draft ?? null
            if (meta && 'moving' in meta) moving = meta.moving ?? null
            if (meta && 'problem' in meta) problem = meta.problem ?? null
            if (meta && 'erasing' in meta) erasing = meta.erasing ?? null
            if (!moving) problem = null
            return lit === value.lit &&
              draft === value.draft &&
              moving === value.moving &&
              problem === value.problem &&
              erasing === value.erasing
              ? value
              : { lit, draft, moving, problem, erasing }
          },
        },
        // Effacer un passage illustré (ou le bloc d'un exemple) se confirme
        // (#211) : la modification est retenue, la confirmation s'ouvre.
        filterTransaction: (tr, state) => {
          const erased = erasedBy(tr, state)
          if (!erased.examples.length && !erased.questions.length) return true
          const view = current
          if (view)
            queueMicrotask(() => {
              if (view.isDestroyed || view.state.doc !== tr.before) return
              dispatchMeta(view, { erasing: { tr, ...erased } })
            })
          return false
        },
        appendTransaction: (trs, _old, state) =>
          trs.some((tr) => tr.docChanged) ? keepFirst(state) : null,
        props: {
          decorations,
          // « Changer le passage » : Entrée valide, Échap renonce — jamais
          // une coupure de bloc ni une frappe qui remplacerait la sélection.
          handleKeyDown: (view, event) => {
            if (!key.getState(view.state)?.moving) return false
            if (event.key === 'Enter') validatePassage(view)
            else if (event.key === 'Escape') cancelPassageChange(view)
            else return false
            return true
          },
        },
      }),
    ]
  },
})

/** Les extensions des exemples, à ajouter à celles de l'éditeur. */
export const noteExamples = [ExampleMark, wholeBlockExamples, examplesPlugin]
