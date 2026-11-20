/** Les trois temps du cadrage, dans l'ordre. */
export const STEPS = [
  { key: 'intention', label: 'Intention' },
  { key: 'scope', label: 'Périmètre' },
  { key: 'resources', label: 'Ressources' },
] as const

export type StepKey = (typeof STEPS)[number]['key']
