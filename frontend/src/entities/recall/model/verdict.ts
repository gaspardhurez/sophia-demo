import type { RecallSessionSummary, RecallVerdict } from './types'

/** Le verdict des passations d'avant le 07/10/2026, tel que l'écran le
 *  dit. Les suivantes n'en ont plus : elles sont terminées quand chaque
 *  question a été sue une fois. */
export const VERDICT_LABELS: Record<RecallVerdict, string> = {
  passed: 'Réussi',
  partial: 'Partiel',
  failed: 'Raté',
}

/** Ce que l'historique dit d'une passation terminée : son ancien verdict,
 *  sinon « Terminée ». */
export function recallLabel(session: RecallSessionSummary): string {
  return session.verdict ? VERDICT_LABELS[session.verdict] : 'Terminée'
}

/** « 3 sur 4 » ; « 3 sur 4 au 1er essai » quand la passation a pu en
 *  compter d'autres (sans verdict : depuis le 07/10/2026). */
export function recallScore(session: RecallSessionSummary): string {
  const score = `${session.known_count ?? 0} sur ${session.total}`
  return session.verdict ? score : `${score} au 1er essai`
}

/**
 * Où la frise J+1…J+90 se lit après une passation (`prod/Interro` 3d à 3f) :
 * les crans atteints, le cran visé, et s'il y a recul. Seule une ancienne
 * passation ratée a reculé (les crans perdus se barrent) ; depuis le
 * 07/10/2026, une interro terminée avance toujours d'un cran.
 */
export function curveAfter(session: RecallSessionSummary): {
  reached: number
  target: number
  setback: boolean
} {
  const after = session.stage_after ?? session.stage_before
  if (session.verdict === 'failed')
    return { reached: session.stage_before, target: 0, setback: true }
  return { reached: after, target: after, setback: false }
}
