/** Largeur du panneau d'activité (`w-80`). */
const PANEL_W = 320

/**
 * Où ancrer le panneau d'activité à côté de l'élément cliqué : à sa droite, ou
 * à sa gauche quand la droite manque de place (les deux derniers jours d'une
 * semaine). Le haut s'aligne sur l'élément ; c'est le panneau qui remonte,
 * une fois sa hauteur connue, s'il dépasserait le bas de la fenêtre
 * (`fitPanelTop`).
 *
 * Partagé par le calendrier et la semaine de l'accueil : le même panneau
 * s'ouvre au même endroit relatif, d'où qu'on clique.
 */
export function panelPosBeside(
  rect: DOMRect,
  side: 'left' | 'right',
): { top: number; left: number } {
  const left =
    side === 'left'
      ? Math.max(8, rect.left - PANEL_W - 10)
      : Math.min(window.innerWidth - PANEL_W - 8, rect.right + 10)
  return {
    top: Math.max(8, rect.top),
    left,
  }
}

/**
 * Le haut d'un panneau ancré en `anchor`, une fois sa hauteur réelle connue :
 * il ne remonte que de ce qui dépasserait le bas de la fenêtre. On réservait
 * avant 460 px d'office — un panneau court ouvert en fin de journée remontait
 * comme s'il portait toutes ses sections. Plus haut que la fenêtre, il se
 * colle en haut et défile dedans.
 */
export function fitPanelTop(anchor: number, height: number): number {
  return Math.max(8, Math.min(anchor, window.innerHeight - height - 12))
}
