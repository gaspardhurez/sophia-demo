import type { Resource } from './types'

/**
 * La tuile d'une ressource : rien ne la saisit, le serveur lit sa sorte au
 * lien quand il est posé (`kind`, `domain/resource_kind.py`) — 📺 une vidéo,
 * 📘 un texte (article, doc, PDF) ou une référence sans lien (un livre, un
 * cours), 🔗 un autre lien (page illisible, accueil d'un site, outil).
 */
export function resourceEmoji({
  reference,
  kind,
}: Pick<Resource, 'reference' | 'kind'>): string {
  if (kind === 'video') return '📺'
  if (kind === 'text' || !resourceHref(reference)) return '📘'
  return '🔗'
}

/** Le lien d'une ressource, s'il en est un (sinon une simple référence). */
export function resourceHref(reference: string | null): string | null {
  return reference && /^https?:\/\//i.test(reference) ? reference : null
}
