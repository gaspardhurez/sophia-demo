import type { components } from '@/shared/api'

/** Une unité du référentiel, telle que renvoyée par l'API. */
export type Unit = components['schemas']['UnitRead']
export type UnitCreate = components['schemas']['UnitCreate']
export type UnitUpdate = components['schemas']['UnitUpdate']
/** Ce qu'une suppression délierait. */
export type UnitUsage = components['schemas']['UnitUsage']
