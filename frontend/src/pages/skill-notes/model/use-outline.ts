import { useEffect, useState } from 'react'

/** Où s'arrête un titre choisi au sommaire : un peu sous le haut, pas collé. */
const LANDING = 64

/**
 * Le titre qu'on lit, pour le sommaire de la colonne : le dernier dont le
 * haut a passé la moitié de l'écran ; -1 tant qu'on n'a pas atteint le
 * premier (ou que les notes ne sont pas affichées). En bas de page, le
 * dernier.
 *
 * `titles` rend les titres du sommaire tels que l'éditeur les montre, dans
 * l'ordre ; `deps` relance l'écoute quand ils changent (autres titres, autre
 * vue).
 */
export function useOutline(titles: () => HTMLElement[], deps: string) {
  const [current, setCurrent] = useState(-1)
  useEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const root = document.documentElement
        const line = window.innerHeight / 2
        const els = titles()
        let i = -1
        els.forEach((el, k) => {
          if (el.getBoundingClientRect().top <= line) i = k
        })
        // En bas de page, les derniers titres n'atteignent jamais la ligne :
        // on est alors sur le dernier.
        if (
          els.length &&
          window.scrollY + window.innerHeight >= root.scrollHeight - 2
        )
          i = els.length - 1
        setCurrent(i)
      })
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    // La page grandit ou rapetisse à la frappe, sans défilement.
    const sizes = new ResizeObserver(update)
    sizes.observe(document.body)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      sizes.disconnect()
    }
    // `titles` relit le DOM à chaque fois ; `deps` suffit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps])
  return current
}

/**
 * Mener au titre choisi au sommaire : défilement doux (direct si l'on a
 * demandé moins de mouvement), le titre s'arrête à `LANDING` px sous le haut ;
 * puis un halo d'accent (~14 %) le montre et s'estompe.
 */
export function goToHeading(el: HTMLElement | undefined) {
  if (!el) return
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  window.scrollTo({
    top: el.getBoundingClientRect().top + window.scrollY - LANDING,
    behavior: still ? 'auto' : 'smooth',
  })
  flash(el)
}

/**
 * Le surlignage d'un bloc qu'on vient de mener sous les yeux — titre choisi au
 * sommaire, question ouverte par « Voir dans les notes » : un halo d'accent
 * (~14 %) qui s'estompe en 1,5 s.
 */
export function flash(el: HTMLElement) {
  const halo = (alpha: number) =>
    `color-mix(in oklch, var(--note-accent, var(--primary)) ${alpha}%, transparent)`
  const frame = (alpha: number) => ({
    backgroundColor: halo(alpha),
    boxShadow: `0 0 0 4px ${halo(alpha)}`,
    borderRadius: '4px',
  })
  // Une animation, pas un style posé : ProseMirror ne voit pas de mutation.
  el.animate([frame(14), { ...frame(14), offset: 0.4 }, frame(0)], {
    duration: 1500,
    easing: 'ease-out',
  })
}
