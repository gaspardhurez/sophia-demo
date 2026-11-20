/**
 * Les domaines d'un projet, en liste ordonnée (#203) : le premier est le
 * principal. Ces règles servent la pièce `kit/Domaines` et le menu de la tuile
 * à la création.
 */

/** Ajouter un domaine à la fin, ou le retirer — jamais le dernier. */
export function toggleDomain(ids: string[], id: string): string[] {
  if (!ids.includes(id)) return [...ids, id]
  return ids.length > 1 ? ids.filter((x) => x !== id) : ids
}

/** Déplacer `id` juste avant `before` : déposé en tête, il devient principal. */
export function moveDomain(
  ids: string[],
  id: string,
  before: string,
): string[] {
  const rest = ids.filter((x) => x !== id)
  const at = rest.indexOf(before)
  rest.splice(at < 0 ? rest.length : at, 0, id)
  return rest
}

/** Ce que la liste d'ajout écrit à droite d'un domaine. */
export function rankLabel(ids: string[], id: string): string {
  if (ids[0] === id) return 'Principal'
  return ids.includes(id) ? '✓' : ''
}
