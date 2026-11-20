/**
 * Le registre des blocs des notes : un fichier par type de bloc, chacun une
 * `BlockSpec` (cf. `types.ts`) — ses extensions TipTap ou sa part de
 * StarterKit, ses entrées du menu « / », son placeholder, ses conteneurs.
 * L'éditeur (`editor-extensions`), le menu « / » et le placeholder lisent
 * cette liste ; aucun d'eux ne nomme un bloc.
 *
 * Ajouter un bloc :
 * 1. créer `lib/blocks/<nom>.ts` qui exporte sa `BlockSpec` ;
 * 2. l'ajouter à `BLOCKS` ci-dessous — l'ordre de la liste est celui du menu
 *    « / » (dans chaque section, cf. `BLOCK_SECTIONS`) ;
 * 3. c'est tout : rien d'autre à modifier pour l'éditeur, le menu ou les
 *    placeholders.
 */
import { blockquoteBlock } from './blockquote'
import { bulletListBlock } from './bullet-list'
import { calloutBlock } from './callout'
import { codeBlockBlock } from './code-block'
import { collapsibleHeadingBlock } from './collapsible-heading'
import { columnsBlock } from './columns'
import { equationBlock } from './equation'
import { exampleBlock } from './example'
import { dividerBlock } from './divider'
import { headingBlock } from './heading'
import { imageBlock } from './image'
import { orderedListBlock } from './ordered-list'
import { paragraphBlock } from './paragraph'
import { questionBlock } from './question'
import { resourceMentionBlock } from './resource-mention'
import { skillLinkBlock } from './skill-link'
import { tableBlock } from './table'
import { taskListBlock } from './task-list'
import { textChildrenBlock } from './text-children'
import { toggleBlock } from './toggle'
import type { BlockItem, BlockSpec } from './types'

export const BLOCKS: BlockSpec[] = [
  paragraphBlock,
  exampleBlock,
  questionBlock,
  headingBlock,
  bulletListBlock,
  orderedListBlock,
  taskListBlock,
  toggleBlock,
  calloutBlock,
  codeBlockBlock,
  blockquoteBlock,
  tableBlock,
  equationBlock,
  dividerBlock,
  collapsibleHeadingBlock,
  columnsBlock,
  imageBlock,
  skillLinkBlock,
  resourceMentionBlock,
  textChildrenBlock,
]

/** Toutes les entrées, dans l'ordre du registre. */
export const BLOCK_ITEMS: BlockItem[] = BLOCKS.flatMap((b) => b.items ?? [])

/** Les entrées du menu « / ». */
export const SLASH_ITEMS = BLOCK_ITEMS.filter((i) => !i.hideInSlash)

/** Les entrées de « Transformer en » : celles qui changent le bloc. */
export const TURN_INTO_ITEMS = BLOCK_ITEMS.filter(
  (i) => i.action.kind === 'transform',
)

/** Le bloc qui possède un nœud (pour son placeholder). */
const BY_NODE = new Map(BLOCKS.flatMap((b) => b.nodes.map((n) => [n, b])))
export const blockOfNode = (type: string) => BY_NODE.get(type)

/**
 * Les nœuds dont les enfants sont des blocs : le document et les conteneurs
 * déclarés (la colonne). Le menu « / », « Faire une question » et le glisser
 * ne regardent que leurs enfants.
 */
export const BODY_CONTAINERS = new Set([
  'doc',
  ...BLOCKS.flatMap((b) => b.containers ?? []),
])

/** Les listes, et le nœud de leurs éléments (`list` des specs). */
export const LIST_ITEM_OF = new Map(
  BLOCKS.flatMap((b) => (b.list ? [[b.name, b.list] as const] : [])),
)

/** La spec qui déclare une entrée du menu. */
export const specOfItem = (item: BlockItem) =>
  BLOCKS.find((b) => b.items?.includes(item))

export { HEADING, HEADING_LEVELS } from './heading'
export { PARAGRAPH } from './paragraph'
export { TABLE } from './table'
export {
  BLOCK_SECTIONS,
  type BlockAction,
  type BlockContext,
  type BlockItem,
  type BlockSection,
  type BlockSpec,
  SECTION_LABELS,
} from './types'
