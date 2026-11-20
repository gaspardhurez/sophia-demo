import type { RecallAnswer, RecallSession } from './types'

/** Le délai avant de repasser une question ratée, comme le serveur
 *  (`RETRY_DELAY`) — pour l'anneau qui se remplit sur le rail. */
export const RETRY_DELAY_MS = 10 * 60 * 1000

/** « Réviser » se propose dès le 3ᵉ passage d'une question (#103). */
export const REVISE_FROM_PASSAGE = 3

/** Les questions dans l'ordre de la file — celui du rail : une question
 *  ratée est passée derrière les autres. */
export function inQueue(session: RecallSession): RecallAnswer[] {
  return [...session.answers].sort((a, b) => a.queue_rank - b.queue_rank)
}

/** Les questions qui restent à savoir, dans l'ordre de la file. */
export function remaining(session: RecallSession): RecallAnswer[] {
  return inQueue(session).filter((a) => !a.known)
}

/** Les millisecondes avant de pouvoir repasser la question ; 0 si elle
 *  peut l'être. */
export function waitLeft(answer: RecallAnswer, now: number): number {
  if (!answer.available_at) return 0
  return Math.max(0, new Date(answer.available_at).getTime() - now)
}

/** Ce qu'on relâche avec « Passer outre » : une question **à une échéance
 *  donnée**. Ratée à nouveau, ou les notes rouvertes, elle a une nouvelle
 *  échéance et attend à nouveau. */
export const releaseKey = (answer: RecallAnswer): string =>
  `${answer.id}@${answer.available_at ?? ''}`

/** Une question qui attend son délai (ni échu, ni passé outre). */
export function isWaiting(
  answer: RecallAnswer,
  now: number,
  released: ReadonlySet<string> = new Set(),
): boolean {
  return (
    !answer.known &&
    waitLeft(answer, now) > 0 &&
    !released.has(releaseKey(answer))
  )
}

/**
 * Ce qui se joue maintenant (#103) : la première question de la file qui
 * n'attend pas — un délai échu la pose d'office —, sinon l'attente, sur la
 * question qui reviendra la première. `null` : tout est su.
 */
export function nextUp(
  session: RecallSession,
  now: number,
  released: ReadonlySet<string> = new Set(),
):
  | { answer: RecallAnswer; waiting: false }
  | { answer: RecallAnswer; waiting: true; wait: number; count: number }
  | null {
  const queue = remaining(session)
  if (!queue.length) return null
  const ready = queue.find((a) => !isWaiting(a, now, released))
  if (ready) return { answer: ready, waiting: false }
  const soonest = queue.reduce((best, a) =>
    waitLeft(a, now) < waitLeft(best, now) ? a : best,
  )
  return {
    answer: soonest,
    waiting: true,
    wait: waitLeft(soonest, now),
    count: queue.length,
  }
}

/** Le passage qui se joue : un de plus que ceux déjà jugés. */
export function passageOf(answer: RecallAnswer): number {
  return answer.attempts.filter((a) => a.known != null).length + 1
}

/** Le texte du passage en cours (ouvert, pas encore jugé), s'il y en a un. */
export function openAnswerText(answer: RecallAnswer): string {
  const last = answer.attempts.at(-1)
  return last && last.known == null ? (last.answer ?? '') : ''
}

/** « 7:42 » : une attente, en minutes et secondes. */
export function formatWait(ms: number): string {
  const total = Math.ceil(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
