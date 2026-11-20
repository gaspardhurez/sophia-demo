import { COLUMN, COLUMNS, Column, Columns } from '../columns'
import type { BlockSpec } from './types'

/**
 * Les colonnes (cf. `../columns`) : nées du glisser, pas du menu « / ». La
 * colonne est un conteneur de blocs.
 */
export const columnsBlock: BlockSpec = {
  name: COLUMNS,
  nodes: [COLUMNS, COLUMN],
  extensions: () => [Columns, Column],
  containers: [COLUMN],
}
