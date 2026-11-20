import { Check, X } from 'lucide-react'

import { cn } from '@/shared/lib/utils'

/**
 * Les trois tailles du kit, et le calibre de coche qui va avec chacune.
 *
 * Le trait s'épaissit quand le disque rétrécit : à 10px une coche de 3 se perd,
 * elle tient à 3,5.
 *
 * **La coche laisse toujours 2px de marge**, de sorte que l'écart disque−coche
 * soit PAIR. Les calibres du kit (9 dans 14, 10 dans 15) laissaient 2,5px de
 * chaque côté : centrée, la coche tombait alors sur un demi-pixel, et sur un
 * écran sans densité double son trait de 3px se rééchantillonnait — ce qui se
 * lit comme une coche mal centrée alors que sa géométrie est juste. Le kit
 * visait déjà une marge constante (2 / 2,5 / 2,5) ; on la rend exacte.
 *
 * Le calibre de coin est passé de 10 à 12 (coche 6 → 8) : sur les pastilles de
 * la bande « jour », qui ne portent qu'un emoji, la coche était le seul signe
 * du fait et se perdait.
 */
const TAILLES = {
  /** En coin d'une pastille de 24px (cf. `DailyPill`). */
  pill: { disque: 'size-[12px]', coche: 'size-[8px]', trait: 3.5 },
  /** Sur la ligne fine d'un bloc d'un quart d'heure (11 px de haut). */
  thin: { disque: 'size-[8px]', coche: 'size-[6px]', trait: 4 },
  /** En tête d'un bloc horaire ou d'une pilule étalée. */
  block: { disque: 'size-[14px]', coche: 'size-[10px]', trait: 3 },
  /** Sur une ligne de liste — agenda, panneau savoir. */
  row: { disque: 'size-[15px]', coche: 'size-[11px]', trait: 3 },
  /**
   * La ligne du panneau latéral, un cran plus serrée. Hors kit : c'est la
   * densité d'`ActivityStateDot`, qu'on ne perd pas en passant par la pièce.
   */
  rowDense: { disque: 'size-[13px]', coche: 'size-[9px]', trait: 3 },
} as const

export type DoneMarkSize = keyof typeof TAILLES

/**
 * **La** coche de complétion — une seule forme pour tout le produit.
 *
 * Quatre signalétiques disaient « fait » : un fond densifié sur la pastille
 * quotidienne, un `CheckCircle2` filaire avec titre barré sur les blocs, un
 * disque sombre sur les lignes, un autre en coin bas-droit dans l'agenda. Rien
 * ne se ressemblait, et le fond densifié ne se lisait même pas comme un
 * accompli — plutôt comme une mise en avant, puisque rien ne disait lequel des
 * deux états était le fait.
 *
 * Décidée par le design (changelog #16) : disque plein à l'encre du domaine,
 * coche blanche. **Le fond de l'objet ne change plus** quand il est fait — la
 * coche porte seule la nouvelle, et la teinte de repos reste la teinte de
 * repos.
 *
 * La couleur arrive en `className` plutôt que d'être calculée ici : `shared`
 * ignore ce qu'est un domaine. L'appelant passe `domainColor(...).ink`, ou rien
 * quand l'objet n'appartient à aucun domaine — le disque tombe alors sur
 * `foreground`, comme il l'a toujours fait sur les lignes.
 */
export function DoneMark({
  size = 'row',
  className,
}: {
  size?: DoneMarkSize
  /** Fond du disque — `domainColor(...).ink`. Défaut : `bg-foreground`. */
  className?: string
}) {
  const { disque, coche, trait } = TAILLES[size]
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-foreground text-background',
        disque,
        className,
      )}
    >
      <Check className={coche} strokeWidth={trait} />
    </span>
  )
}

/**
 * La croix de l'activité **ratée** (24/10/2026) : le pendant de la coche, au
 * même calibre — disque gris, croix blanche. Elle dit « pas fait » là où la
 * coche dit « fait », sans attendre qu'on lise le fond ou l'opacité.
 */
export function MissedMark({
  size = 'row',
  className,
}: {
  size?: DoneMarkSize
  className?: string
}) {
  const { disque, coche, trait } = TAILLES[size]
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-zinc-300 text-white dark:bg-zinc-600 dark:text-zinc-300',
        disque,
        className,
      )}
    >
      <X className={coche} strokeWidth={trait} />
    </span>
  )
}
