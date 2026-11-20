import { Extension } from '@tiptap/core'
import {
  createTable,
  Table,
  TableCell,
  TableHeader,
  TableRow,
} from '@tiptap/extension-table'
import { Table2 } from 'lucide-react'

import { cn } from '@/shared/lib/utils'

import { NotesTableView } from '../../ui/blocks/table-view'
import { placeBlock } from './place-block'
import type { BlockSpec } from './types'

/**
 * Le tableau simple (pas une base de données), à la Notion : une grille de
 * paragraphes, 3 × 3 à l'insertion, sans ligne d'en-tête — le menu du
 * tableau l'active. Bordures de 1 px partout (extérieur comme intérieur),
 * cellules 9 × 7 px de padding, texte 14/20 (35 px par ligne d'une ligne),
 * en-tête en graisse 500 sur un fond à 3 %. Colonnes de 120 px, qui se
 * redimensionnent en glissant leur bord ; trop large pour la colonne de
 * texte, il défile (cf. `NotesTableView`).
 *
 * Sélectionnable comme un bloc : `allowTableNodeSelection`, sans quoi
 * `prosemirror-tables` change la `NodeSelection` du tableau en sélection de
 * toutes ses cellules — et défait la sélection de blocs.
 */
export const TABLE = 'table'

/** Largeur minimale d'une colonne au glisser (px). */
const COLUMN_MIN = 60

const CELL = cn(
  'relative border border-border px-[9px] py-[7px] text-left align-top text-[14px] leading-5',
  // Pas le padding des paragraphes du document : la cellule fait l'espace.
  '[&_p]:m-0 [&_p]:py-0!',
)

/** Une cellule ne contient que des paragraphes (pas de blocs dedans). */
const Cell = TableCell.extend({ content: 'paragraph+' }).configure({
  HTMLAttributes: { class: CELL },
})
const Header = TableHeader.extend({ content: 'paragraph+' }).configure({
  HTMLAttributes: { class: cn(CELL, 'bg-foreground/3 font-medium') },
})

const NotesTable = Table.configure({
  resizable: true,
  cellMinWidth: COLUMN_MIN,
  lastColumnResizable: true,
  allowTableNodeSelection: true,
  View: NotesTableView,
})

/**
 * Tab et ⇧Tab passent de cellule en cellule — Tab dans la dernière ajoute une
 * ligne (TipTap). Priorité haute : dans un tableau, ils passent avant les
 * autres usages de Tab (l'indentation) ; hors tableau, ils ne font rien.
 */
const tableKeys = Extension.create({
  name: 'tableKeys',
  priority: 1000,
  addKeyboardShortcuts() {
    const inTable = () => this.editor.isActive(TABLE)
    return {
      Tab: () => {
        if (!inTable()) return false
        if (this.editor.commands.goToNextCell()) return true
        this.editor.chain().addRowAfter().goToNextCell().run()
        return true
      },
      'Shift-Tab': () => {
        if (!inTable()) return false
        this.editor.commands.goToPreviousCell()
        return true
      },
    }
  },
})

export const tableBlock: BlockSpec = {
  name: TABLE,
  nodes: [TABLE, 'tableRow', 'tableCell', 'tableHeader'],
  extensions: () => [NotesTable, TableRow, Cell, Header, tableKeys],
  // Une cellule vide n'invite à rien (sans quoi celle du paragraphe s'y lit).
  placeholder: { text: '' },
  items: [
    {
      id: 'table',
      label: 'Tableau',
      section: 'blocks',
      aliases: ['tableau', 'table', 'grille', 'grid'],
      icon: Table2,
      action: {
        kind: 'insert',
        run: (editor, range) =>
          placeBlock(editor, range, createTable(editor.schema, 3, 3, false)),
      },
    },
  ],
}
