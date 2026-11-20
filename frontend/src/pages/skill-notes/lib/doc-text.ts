interface JsonNode {
  type?: string
  text?: string
  content?: JsonNode[]
}

/**
 * Un document de notes (JSON TipTap) porte-t-il du texte ? Ce que le
 * serveur demande avant de vérifier les notes d'une ressource (422 sinon) :
 * « Vérifier les notes », dans la colonne, ne vise qu'une ressource qui en
 * a. Une formule en ligne compte, comme au serveur.
 */
export function docHasText(doc: Record<string, unknown> | null | undefined) {
  const filled = (node: JsonNode): boolean =>
    node.type === 'inlineMath' ||
    Boolean(node.text?.trim()) ||
    (node.content ?? []).some(filled)
  return !!doc && filled(doc as JsonNode)
}
