import { useCallback, useEffect, useRef } from 'react'

/**
 * Délai d'attente avant d'ouvrir le panneau, le temps de voir venir un second
 * clic.
 *
 * **Réglé au-dessus de l'écart naturel d'un double-clic**, et c'est le FLASH
 * qui commande la valeur — pas la réactivité du clic simple, contrairement à ce
 * qu'on croyait d'abord. Si le minuteur tire entre les deux clics, le panneau
 * s'ouvre, se peint, puis se referme au second : on voit un clignotement qui
 * dure l'écart du double-clic moins ce seuil. Aucune logique ne peut l'éviter —
 * à 100ms, rien ne dit qu'un second clic arrive à 140. Seul un seuil plus large
 * que le geste l'élimine.
 *
 * Descendu jusqu'à 50ms puis remonté par paliers, à l'usage : c'est vers 250
 * que le clignotement disparaît sans que l'ouverture paraisse traîner. Le seuil
 * du système reste plus généreux encore (500ms par défaut sur macOS).
 *
 * Se tromper vers le haut reste bénin : un double-clic plus lent que le seuil
 * coche quand même — `onDoubleClick` part de toute façon — et referme ce que le
 * premier clic avait ouvert.
 */
const ATTENTE_MS = 250

/**
 * Un clic ouvre, deux cochent.
 *
 * Le calendrier n'avait que le clic simple — ouvrir le panneau — et cocher
 * depuis la grille demandait de viser une coche de 14px, ou de passer par le
 * panneau. Le double-clic coche directement.
 *
 * Les deux gestes partagent leur premier clic, donc l'ouverture **attend** :
 * sans ce délai, le panneau se serait déjà ouvert quand le second clic arrive.
 * C'est le prix du geste, et il se paie sur le clic simple — d'où un délai
 * court (cf. `ATTENTE_MS`).
 *
 * Le rectangle est capturé **tout de suite** et non dans le minuteur :
 * `currentTarget` vaut `null` dès que le gestionnaire a rendu la main, et c'est
 * lui qui place le panneau.
 *
 * **Recliquer une activité dont le panneau est déjà ouvert ne fait rien.** Le
 * clic simple ouvre ; quand c'est déjà ouvert sur elle, il n'a plus rien à
 * faire, et le seul geste qui reste utile est le double-clic, qui coche. Le
 * délai n'a pas davantage de sens là : il ne sert qu'à voir venir un second
 * clic avant d'ouvrir, et il n'y a plus d'ouverture à retarder.
 *
 * Ouvrir sur une AUTRE activité garde le délai : c'est bien une ouverture, et
 * un double-clic sur elle doit la cocher sans que le panneau saute d'abord.
 *
 * **Un double-clic ne laisse jamais de panneau derrière lui.** S'il est plus
 * lent que le seuil, le minuteur a déjà tiré quand le second clic arrive :
 * `onDoubleClick` referme alors ce que le premier clic venait d'ouvrir. Le
 * geste veut dire « coche », pas « ouvre » — et il ne doit pas produire deux
 * effets selon la vitesse du poignet. Un filet implicite jouait ce rôle avant
 * (le second `pointerdown` refermait au passage) ; il a disparu quand les blocs
 * ont cessé d'être traités comme un « clic en dehors ».
 *
 * **Maj + clic ajoute ou retire l'activité de la sélection** (`onShiftClick`,
 * calendrier) : tout de suite, sans attendre un second clic — Maj + double-clic
 * ne coche pas, il ne ferait que sélectionner puis désélectionner.
 */
export function useSelectOrToggle(
  onSelect: (rect: DOMRect) => void,
  onToggleDone: () => void,
  /** Le panneau est ouvert **sur cette activité-là**. */
  dejaOuvertIci = false,
  /** Referme le panneau — appelé si le double-clic arrive trop tard. */
  onFermer?: () => void,
  /** Maj + clic : ajouter ou retirer de la sélection. */
  onShiftClick?: () => void,
) {
  const minuteur = useRef<number | null>(null)
  /** Le minuteur a-t-il eu le temps d'ouvrir avant le second clic ? */
  const aOuvert = useRef(false)

  const annuler = useCallback(() => {
    if (minuteur.current !== null) {
      window.clearTimeout(minuteur.current)
      minuteur.current = null
    }
  }, [])

  // Un bloc peut disparaître entre le clic et l'ouverture — déplacé hors de la
  // semaine visible, supprimé depuis le menu contextuel.
  useEffect(() => annuler, [annuler])

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      // Le second clic d'un double remonte aussi ici : `detail` vaut alors 2 et
      // c'est `onDoubleClick` qui tranche.
      if (e.detail > 1) return
      if (e.shiftKey && onShiftClick) {
        annuler()
        onShiftClick()
        return
      }
      // Déjà ouvert sur elle : rien à faire, et surtout pas la refermer.
      if (dejaOuvertIci) return
      const rect = e.currentTarget.getBoundingClientRect()
      annuler()
      aOuvert.current = false
      minuteur.current = window.setTimeout(() => {
        minuteur.current = null
        aOuvert.current = true
        onSelect(rect)
      }, ATTENTE_MS)
    },
    [annuler, onSelect, dejaOuvertIci, onShiftClick],
  )

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      // La grille crée une activité au double-clic dans le vide : sur un bloc,
      // le geste lui appartient.
      e.stopPropagation()
      if (e.shiftKey && onShiftClick) return
      annuler()
      // Double-clic plus lent que le seuil : le panneau s'est ouvert entre les
      // deux clics, on le referme. Rien à refermer si le premier clic n'a rien
      // ouvert — panneau déjà sur cette activité, ou minuteur arrêté à temps.
      if (aOuvert.current) {
        aOuvert.current = false
        onFermer?.()
      }
      onToggleDone()
    },
    [annuler, onFermer, onToggleDone, onShiftClick],
  )

  return { onClick, onDoubleClick }
}
