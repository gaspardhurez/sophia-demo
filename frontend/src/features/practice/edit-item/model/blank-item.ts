import type { PracticeItem, PracticeNature } from '@/entities/practice'

/**
 * Un objet qui n'existe pas encore — la modale de création est la même que
 * celle d'édition, vide. Un formulaire à part aurait divergé au premier champ
 * ajouté, et on écrit un exercice comme on le corrige.
 */
export function blankItem(
  skillId: string,
  nature: PracticeNature,
): PracticeItem {
  return {
    id: '',
    skill_id: skillId,
    nature,
    kind: 'manual',
    title: '',
    emoji: null,
    instructions: null,
    reference: null,
    eval_mode: 'self',
    statement_source: null,
    solution_source: null,
    created_at: '',
    sessions: 0,
  }
}
