/**
 * Le défilement automatique au bord de l'écran, partagé par le glisser d'un
 * bloc (`useBlockDrag`) et le rectangle de sélection (`useMarquee`) : près du
 * haut ou du bas de ce qui défile, la page avance, d'autant plus vite qu'on
 * est près du bord.
 */

/** La zone, au bord de l'écran, où la page défile ; la vitesse max (px/image). */
const SCROLL_EDGE = 90
const SCROLL_SPEED = 18

/** Ce qui défile autour de `el` : son premier parent défilant, ou la page. */
export function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p)
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      p.scrollHeight > p.clientHeight
    )
      return p
  }
  return null
}

export const scrollTopOf = (el: HTMLElement | null) =>
  el ? el.scrollTop : window.scrollY

/**
 * Fait défiler `scroller` d'un pas, le pointeur à la hauteur `y` ; vrai si
 * la page a bougé.
 */
export function edgeScroll(scroller: HTMLElement | null, y: number): boolean {
  const { top, bottom } = scroller
    ? scroller.getBoundingClientRect()
    : { top: 0, bottom: window.innerHeight }
  const near = (d: number) => 1 - Math.max(0, d) / SCROLL_EDGE
  const speed =
    y < top + SCROLL_EDGE
      ? -SCROLL_SPEED * near(y - top)
      : y > bottom - SCROLL_EDGE
        ? SCROLL_SPEED * near(bottom - y)
        : 0
  if (!speed) return false
  const before = scrollTopOf(scroller)
  const dy = Math.round(speed)
  if (scroller) scroller.scrollTop += dy
  else window.scrollBy(0, dy)
  return scrollTopOf(scroller) !== before
}
