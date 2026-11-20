/** Un point, en coordonnées d'un conteneur (ou de la fenêtre). */
export type Point = { x: number; y: number }

/** Un rectangle aligné sur les axes. */
export type Box = { left: number; top: number; right: number; bottom: number }

/** Le rectangle tiré entre deux points, dans n'importe quel sens. */
export function boxOf(a: Point, b: Point): Box {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  }
}

/** Le même rectangle décalé de `dx`, `dy` (conteneur → fenêtre). */
export function shiftBox(b: Box, dx: number, dy: number): Box {
  return {
    left: b.left + dx,
    top: b.top + dy,
    right: b.right + dx,
    bottom: b.bottom + dy,
  }
}

/** Le lasso prend un bloc qu'il **touche**, comme Finder ou Notion Calendar :
 *  pas besoin de l'englober. Deux bords qui se touchent seulement ne comptent
 *  pas. */
export function touches(a: Box, b: Box): boolean {
  return (
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  )
}

/** En dessous de cette taille (px), le geste n'a pas tiré de rectangle : c'est
 *  un clic, pas un lasso. */
export const LASSO_MIN = 4

export function isLasso(b: Box): boolean {
  return b.right - b.left >= LASSO_MIN || b.bottom - b.top >= LASSO_MIN
}
