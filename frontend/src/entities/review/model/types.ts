import type { components } from '@/shared/api'

/**
 * Un commentaire de Sophia sur les notes d'une ressource (#173) : ce qu'il
 * relève (`kind`), son ancrage (`anchor` : le passage `quote` à surligner,
 * ou l'oubli à insérer **après** le bloc qui contient `quote`), son message,
 * « où regarder » dans la source, son statut (résolu = archivé) et son fil.
 * Dérivé du contrat.
 */
export type ReviewComment = components['schemas']['ReviewCommentRead']
/** Une réponse du fil : de l'utilisateur, ou de Sophia. */
export type ReviewReply = components['schemas']['ReviewReplyRead']
/** Ce que rend une vérification : les **nouveaux** commentaires, ou la
 *  demande de coller la source (`needs_paste`, avec son motif). */
export type ReviewRun = components['schemas']['ReviewRun']
export type ReviewKind = components['schemas']['ReviewKind']
export type ReviewStatus = components['schemas']['ReviewStatus']
/** Pourquoi la source n'a pas pu être lue : pas de lien, page illisible,
 *  pas de sous-titres, trop longue. */
export type PasteReason = components['schemas']['PasteReason']

/** Les libellés écran des quatre choses que Sophia relève (`prod/Notes`). */
export const REVIEW_KIND_LABEL: Record<ReviewKind, string> = {
  inexact: 'Inexact',
  surface: 'En surface',
  omission: 'Oubli',
  literal_translation: 'Traduit mot à mot',
}
