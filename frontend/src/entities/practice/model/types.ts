import type { components } from '@/shared/api'

/** Un objet de pratique — exercice ou mise en situation. Dérivé du contrat. */
export type PracticeItem = components['schemas']['PracticeItemRead']
export type PracticeItemCreate = components['schemas']['PracticeItemCreate']
export type PracticeItemUpdate = components['schemas']['PracticeItemUpdate']
export type PracticeNature = components['schemas']['PracticeNature']
export type PracticeKind = components['schemas']['PracticeKind']
export type EvalMode = components['schemas']['EvalMode']
