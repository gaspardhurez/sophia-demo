import type {
  ChainedCommands,
  Editor,
  Extensions,
  NodeViewRenderer,
} from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { StarterKitOptions } from '@tiptap/starter-kit'
import type { LucideIcon } from 'lucide-react'

/**
 * Ce que la page fournit aux extensions des blocs : leurs vues React.
 */
export interface BlockContext {
  /** La vue React d'une image (cf. `ImageView`). */
  imageView?: NodeViewRenderer
  /** La vue React d'un lien vers un savoir (cf. `SkillLinkView`). */
  skillLinkView?: NodeViewRenderer
  /** La vue React d'une mention de ressource (cf. `ResourceMentionView`). */
  resourceMentionView?: NodeViewRenderer
  /** L'encadré d'une question dans le texte (cf. `QuestionBoxView`) ; sans
   *  elle, la question ne se montre pas (« Préparer les questions »). */
  questionView?: NodeViewRenderer
  /** L'encadré d'un exemple dans le texte (cf. `ExampleBoxView`). */
  exampleView?: NodeViewRenderer
}

/**
 * Les sections du menu « / », dans l'ordre d'affichage. `inline` : ce qui
 * s'insère dans le texte du bloc (l'équation en ligne), comme « À l'intérieur
 * d'un bloc » chez Notion.
 */
export const BLOCK_SECTIONS = ['learn', 'blocks', 'inline'] as const
export type BlockSection = (typeof BLOCK_SECTIONS)[number]

export const SECTION_LABELS: Record<BlockSection, string> = {
  learn: 'Apprentissage',
  blocks: 'Blocs',
  inline: 'En ligne',
}

/**
 * Ce que fait une entrée.
 * - `transform` : change le bloc du curseur (paragraphe → titre, liste…). Le
 *   menu « / » retire d'abord le « / » ; « Transformer en » (poignée, barre
 *   de sélection) l'applique tel quel. Seules ces entrées-là y figurent.
 * - `insert` : un bloc à part, qui ne se transforme pas (la question).
 */
export type BlockAction =
  | {
      kind: 'transform'
      apply: (chain: ChainedCommands) => ChainedCommands
    }
  | {
      kind: 'insert'
      run: (editor: Editor, range: { from: number; to: number }) => void
    }

/** Une entrée du menu « / » (et de « Transformer en »). */
export interface BlockItem {
  /** Unique dans le registre (sert de clé). */
  id: string
  label: string
  section: BlockSection
  /** Autres mots qui la trouvent au filtre, FR et EN (sans casse ni accents). */
  aliases: string[]
  icon: LucideIcon
  /** Le raccourci Markdown à afficher (`#`, `-`, `>`…), s'il existe. */
  markdown?: string
  /** Absente du menu « / », présente dans « Transformer en » (Texte). */
  hideInSlash?: boolean
  action: BlockAction
}

/**
 * La zone du marqueur d'un élément de puces ou numéroté : son texte est à
 * 30 px du bord de la liste (`entities/note/lib/prose.ts`).
 */
export const LIST_MARKER = 30

/**
 * Un type de bloc : un fichier par type dans `lib/blocks/`, listé dans
 * `lib/blocks/index.ts`.
 */
export interface BlockSpec {
  /** Le nom du type (unique), en général celui de son nœud principal. */
  name: string
  /** Les nœuds qu'il possède : son placeholder s'y applique. */
  nodes: string[]
  /**
   * Les extensions TipTap qu'il apporte — ses nœuds, et ses règles d'entrée
   * Markdown s'il ne les tient pas de StarterKit.
   */
  extensions?: (ctx: BlockContext) => Extensions
  /** Sa part de la configuration de StarterKit, s'il en est un nœud. */
  starterKit?: Partial<StarterKitOptions>
  /** Ses entrées du menu « / », dans l'ordre. */
  items?: BlockItem[]
  /**
   * Le texte d'invite d'un bloc vide. Par défaut sous le curseur seulement
   * (Notion) ; `always` : sur tout bloc vide du type (les titres).
   */
  placeholder?: { text: string | ((node: PMNode) => string); always?: boolean }
  /**
   * Les nœuds dont les enfants sont des blocs de la page (la colonne) : le
   * menu « / », « Faire une question » et le glisser y regardent.
   */
  containers?: string[]
  /**
   * Une liste : ses éléments (`item`, le nœud de chaque élément) sont chacun
   * un bloc de la page, comme chez Notion — la liste elle-même n'est qu'une
   * enveloppe (cf. `block-unit`). `marker` : la largeur de la zone du
   * marqueur à gauche du texte de l'élément (puce, numéro ; la case d'une
   * tâche est dans l'élément : 0), d'où partent sa poignée et son halo.
   */
  list?: { item: string; marker: number }
}
