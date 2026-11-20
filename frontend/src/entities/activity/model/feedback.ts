import type { ActivityAct } from './types'

/**
 * Le **retour** d'une passe (#139) : un niveau de maîtrise sur 5, propre à
 * l'acte, sur la Pratique et la Mise en situation. Libellé, puis ce qu'il veut
 * dire.
 */
export const LEVELS = [
  { label: 'Raté', meaning: "Je n'y arrive pas, même avec une aide." },
  {
    label: 'Avec aide',
    meaning:
      "J'y arrive en m'appuyant sur une aide : les notes, un modèle, la solution, quelqu'un.",
  },
  {
    label: 'Avec erreurs',
    meaning: "J'y arrive seul, mais avec des erreurs ou des oublis.",
  },
  {
    label: 'Avec effort',
    meaning: "J'y arrive seul et juste, avec effort ou lentement.",
  },
  {
    label: 'Maîtrisé',
    meaning: 'Seul, juste et avec aisance : réussi à la perfection.',
  },
] as const

/** « 3/5 · Avec erreurs ». */
export function levelLabel(level: number): string {
  return `${level}/5 · ${LEVELS[level - 1]?.label ?? ''}`
}

/** Un acte qui prend un retour : la pratique (objet ou générique), ni
 *  l'étude ni l'interro. */
/** L'acte porte-t-il un retour : un niveau, une note, ou les deux. */
export function hasFeedback(act: {
  level?: number | null
  feedback?: string | null
}): boolean {
  return act.level != null || Boolean(act.feedback)
}

export function takesFeedback(act: Pick<ActivityAct, 'kind'>): boolean {
  return act.kind === 'practice'
}

/** Une séance qui porte de l'apprentissage au sens de la coche (#140) : une
 *  étude ou une passe. L'interro se valide par sa passation, pas ici. */
export function carriesLearning(a: { acts: Pick<ActivityAct, 'kind'>[] }) {
  return a.acts.some((x) => x.kind !== 'recall')
}

/** Les actes dont la coche décide : tous sauf l'interro. */
export function learningActs<T extends Pick<ActivityAct, 'kind'>>(acts: T[]) {
  return acts.filter((x) => x.kind !== 'recall')
}
