/**
 * Le triangle d'un pli (menu dépliant, titre dépliant ; relevé Notion §1.4) :
 * un bouton de 24 × 24, rayon 4, centré sur la première ligne — sans `top`,
 * il reste à sa place dans le flux, sous l'air d'un titre ; ouvert
 * pointe en bas, fermé tourne de −90°, en 0,2 s `ease-out`. Le clic ne prend
 * pas le focus : le curseur reste où il était.
 */
export function foldButton(onToggle: () => void) {
  const button = document.createElement('button')
  button.type = 'button'
  button.contentEditable = 'false'
  button.className =
    'absolute left-0 mt-[calc((1lh-24px)/2)] flex size-6 cursor-pointer select-none items-center justify-center rounded-[4px] text-foreground transition-colors duration-[20ms] ease-in hover:bg-foreground/[0.06]'
  button.innerHTML =
    '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" class="transition-transform duration-200 ease-out"><path fill="currentColor" d="M2.8 5.2a.8.8 0 0 1 .6-1.2h9.2a.8.8 0 0 1 .6 1.2l-4.6 6.3a.8.8 0 0 1-1.2 0z"/></svg>'
  button.addEventListener('mousedown', (e) => e.preventDefault())
  button.addEventListener('click', (e) => {
    e.preventDefault()
    onToggle()
  })
  const render = (open: boolean) => {
    button.setAttribute('aria-expanded', String(open))
    button.setAttribute('aria-label', open ? 'Replier' : 'Ouvrir')
    button.firstElementChild?.classList.toggle('-rotate-90', !open)
  }
  return { button, render }
}
