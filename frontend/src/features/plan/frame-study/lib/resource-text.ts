/** La borne du serveur sur le titre d'une ressource (`string(200)`). */
const TITLE_MAX = 200

/** Ce qu'on a écrit dans « Tu as déjà des ressources ? » est-il un lien ? */
export function isLink(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim())
}

/** Un lien tel qu'on le lit : sans protocole ni `www.` (« youtu.be/8kQ2 »). */
export function shortLink(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '')
}

/**
 * Le titre d'une ressource ajoutée depuis le cadrage : celui que le serveur
 * a lu à la page du lien, sinon le lien lui-même, sinon le texte écrit
 * (un livre, un cours) — borné comme au serveur.
 */
export function resourceTitle(text: string, read: string | null): string {
  const title = read?.trim() || (isLink(text) ? shortLink(text) : text.trim())
  return title.slice(0, TITLE_MAX)
}

/** La tuile d'une ressource proposée, d'après sa sorte (comme
 *  `resourceEmoji` : 📺 une vidéo, 📘 un texte, 🔗 un autre lien). */
export function proposalEmoji(kind: 'video' | 'text' | null): string {
  return kind === 'video' ? '📺' : kind === 'text' ? '📘' : '🔗'
}

/**
 * Le type, la durée et la date d'une ressource proposée, en clair
 * (« Vidéo · 14 min · mars 2025 ») ; ce qui manque est omis.
 */
export function proposalMeta({
  kind,
  duration,
  date,
}: {
  kind: 'video' | 'text' | null
  duration: string | null
  date: string | null
}): string {
  const type = kind === 'video' ? 'Vidéo' : kind === 'text' ? 'Article' : null
  return [type, duration, date].filter(Boolean).join(' · ')
}

/**
 * La ligne grise d'une ressource dans « Ajoutées » : son auteur et le site
 * où elle se lit, ou « Référence sans lien » (`prod/Cadrer etude -
 * Ressources`).
 */
export function resourceSubline({
  author,
  reference,
}: {
  author: string | null
  reference: string | null
}): string {
  const site =
    reference && isLink(reference) ? shortLink(reference).split('/')[0] : null
  return [author, site].filter(Boolean).join(' · ') || 'Référence sans lien'
}
