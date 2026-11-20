/**
 * Source unique de la couleur d'un domaine : mappe une clé de palette curée
 * (miroir du back) vers des jeux de classes Tailwind. Les classes sont écrites
 * en toutes lettres (le JIT Tailwind ne peut pas les construire dynamiquement).
 * Consommé par le calendrier, les cartes et les pages.
 */

export type DomainColorKey =
  | 'emerald'
  | 'teal'
  | 'sky'
  | 'blue'
  | 'violet'
  | 'fuchsia'
  | 'rose'
  | 'amber'
  | 'orange'
  | 'lime'

export interface DomainColorClasses {
  /** Repos : pastille douce (activité, chip). */
  soft: string
  /** Accompli : même teinte que `soft`, en plus dense. Reste pastel — à
   *  préférer à `solid`, qui change de couleur perçue. */
  filled: string
  /** Focus / plein (activité sélectionnée ou en drag). */
  solid: string
  /** Pastille pleine (sélecteur, point d'accent). */
  dot: string
  /** Anneau d'accent — la sélection, quand elle doit rester dans la teinte. */
  ring: string
  /** Texte accentué (titres, libellés). */
  text: string
  /**
   * **Encre** du domaine, en fond : le disque de `DoneMark`.
   *
   * Même nuance que `text` (700), mais `text` est une classe de *texte* et ne
   * peut pas peindre un disque. Et **pas de variante sombre**, contrairement à
   * `text` : un 300 sous une coche blanche ne se lirait pas, là où un 700 tient
   * sur fond clair comme sur fond sombre.
   */
  ink: string
  /** Au **survol** seulement : fond doux, bord et texte à l'encre — un
   *  contrôle neutre au repos qui prend la teinte du domaine sous le pointeur
   *  (la coche d'une réalisation, design #27). */
  softHover: string
  /** Fond **lavé** d'un bloc : la base à 8 % (moitié de `soft`), bord à
   *  40 % — le bloc « En cours d'apprentissage » (design #27). */
  wash: string
  /** Filet dans la teinte : la base à 20 %, le séparateur d'un bloc lavé. */
  rule: string
  /** Bord d'une chip de suivi : la base à 25 % (design #34, kit/Suivi). */
  edge: string
}

export const DEFAULT_DOMAIN_COLOR: DomainColorKey = 'sky'

/** Liste ordonnée pour le sélecteur (clé + libellé FR). */
export const DOMAIN_COLORS: { key: DomainColorKey; label: string }[] = [
  { key: 'emerald', label: 'Émeraude' },
  { key: 'teal', label: 'Sarcelle' },
  { key: 'sky', label: 'Ciel' },
  { key: 'blue', label: 'Bleu' },
  { key: 'violet', label: 'Violet' },
  { key: 'fuchsia', label: 'Fuchsia' },
  { key: 'rose', label: 'Rose' },
  { key: 'amber', label: 'Ambre' },
  { key: 'orange', label: 'Orange' },
  { key: 'lime', label: 'Citron vert' },
]

const CLASSES: Record<DomainColorKey, DomainColorClasses> = {
  emerald: {
    soft: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
    filled:
      'border-emerald-500/70 bg-emerald-500/35 text-emerald-900 dark:text-emerald-100',
    solid: 'border-emerald-600 bg-emerald-600 text-white',
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-300',
    ink: 'bg-emerald-700',
    softHover:
      'hover:border-emerald-700 hover:bg-emerald-500/20 hover:text-emerald-700 dark:hover:border-emerald-400 dark:hover:text-emerald-400',
    wash: 'border-emerald-500/40 bg-emerald-500/8',
    rule: 'border-emerald-500/20',
    edge: 'border-emerald-500/25',
  },
  teal: {
    soft: 'border-teal-500/40 bg-teal-500/15 text-teal-800 dark:text-teal-200',
    filled:
      'border-teal-500/70 bg-teal-500/35 text-teal-900 dark:text-teal-100',
    solid: 'border-teal-600 bg-teal-600 text-white',
    dot: 'bg-teal-500',
    ring: 'ring-teal-500',
    text: 'text-teal-700 dark:text-teal-300',
    ink: 'bg-teal-700',
    softHover:
      'hover:border-teal-700 hover:bg-teal-500/20 hover:text-teal-700 dark:hover:border-teal-400 dark:hover:text-teal-400',
    wash: 'border-teal-500/40 bg-teal-500/8',
    rule: 'border-teal-500/20',
    edge: 'border-teal-500/25',
  },
  sky: {
    soft: 'border-sky-500/40 bg-sky-500/15 text-sky-800 dark:text-sky-200',
    filled: 'border-sky-500/70 bg-sky-500/35 text-sky-900 dark:text-sky-100',
    solid: 'border-sky-600 bg-sky-600 text-white',
    dot: 'bg-sky-500',
    ring: 'ring-sky-500',
    text: 'text-sky-700 dark:text-sky-300',
    ink: 'bg-sky-700',
    softHover:
      'hover:border-sky-700 hover:bg-sky-500/20 hover:text-sky-700 dark:hover:border-sky-400 dark:hover:text-sky-400',
    wash: 'border-sky-500/40 bg-sky-500/8',
    rule: 'border-sky-500/20',
    edge: 'border-sky-500/25',
  },
  blue: {
    soft: 'border-blue-500/40 bg-blue-500/15 text-blue-800 dark:text-blue-200',
    filled:
      'border-blue-500/70 bg-blue-500/35 text-blue-900 dark:text-blue-100',
    solid: 'border-blue-600 bg-blue-600 text-white',
    dot: 'bg-blue-500',
    ring: 'ring-blue-500',
    text: 'text-blue-700 dark:text-blue-300',
    ink: 'bg-blue-700',
    softHover:
      'hover:border-blue-700 hover:bg-blue-500/20 hover:text-blue-700 dark:hover:border-blue-400 dark:hover:text-blue-400',
    wash: 'border-blue-500/40 bg-blue-500/8',
    rule: 'border-blue-500/20',
    edge: 'border-blue-500/25',
  },
  violet: {
    soft: 'border-violet-500/40 bg-violet-500/15 text-violet-800 dark:text-violet-200',
    filled:
      'border-violet-500/70 bg-violet-500/35 text-violet-900 dark:text-violet-100',
    solid: 'border-violet-600 bg-violet-600 text-white',
    dot: 'bg-violet-500',
    ring: 'ring-violet-500',
    text: 'text-violet-700 dark:text-violet-300',
    ink: 'bg-violet-700',
    softHover:
      'hover:border-violet-700 hover:bg-violet-500/20 hover:text-violet-700 dark:hover:border-violet-400 dark:hover:text-violet-400',
    wash: 'border-violet-500/40 bg-violet-500/8',
    rule: 'border-violet-500/20',
    edge: 'border-violet-500/25',
  },
  fuchsia: {
    soft: 'border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-800 dark:text-fuchsia-200',
    filled:
      'border-fuchsia-500/70 bg-fuchsia-500/35 text-fuchsia-900 dark:text-fuchsia-100',
    solid: 'border-fuchsia-600 bg-fuchsia-600 text-white',
    dot: 'bg-fuchsia-500',
    ring: 'ring-fuchsia-500',
    text: 'text-fuchsia-700 dark:text-fuchsia-300',
    ink: 'bg-fuchsia-700',
    softHover:
      'hover:border-fuchsia-700 hover:bg-fuchsia-500/20 hover:text-fuchsia-700 dark:hover:border-fuchsia-400 dark:hover:text-fuchsia-400',
    wash: 'border-fuchsia-500/40 bg-fuchsia-500/8',
    rule: 'border-fuchsia-500/20',
    edge: 'border-fuchsia-500/25',
  },
  rose: {
    soft: 'border-rose-500/40 bg-rose-500/15 text-rose-800 dark:text-rose-200',
    filled:
      'border-rose-500/70 bg-rose-500/35 text-rose-900 dark:text-rose-100',
    solid: 'border-rose-600 bg-rose-600 text-white',
    dot: 'bg-rose-500',
    ring: 'ring-rose-500',
    text: 'text-rose-700 dark:text-rose-300',
    ink: 'bg-rose-700',
    softHover:
      'hover:border-rose-700 hover:bg-rose-500/20 hover:text-rose-700 dark:hover:border-rose-400 dark:hover:text-rose-400',
    wash: 'border-rose-500/40 bg-rose-500/8',
    rule: 'border-rose-500/20',
    edge: 'border-rose-500/25',
  },
  amber: {
    soft: 'border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-200',
    filled:
      'border-amber-500/70 bg-amber-500/35 text-amber-900 dark:text-amber-100',
    solid: 'border-amber-600 bg-amber-600 text-white',
    dot: 'bg-amber-500',
    ring: 'ring-amber-500',
    text: 'text-amber-700 dark:text-amber-300',
    ink: 'bg-amber-700',
    softHover:
      'hover:border-amber-700 hover:bg-amber-500/20 hover:text-amber-700 dark:hover:border-amber-400 dark:hover:text-amber-400',
    wash: 'border-amber-500/40 bg-amber-500/8',
    rule: 'border-amber-500/20',
    edge: 'border-amber-500/25',
  },
  orange: {
    soft: 'border-orange-500/40 bg-orange-500/15 text-orange-800 dark:text-orange-200',
    filled:
      'border-orange-500/70 bg-orange-500/35 text-orange-900 dark:text-orange-100',
    solid: 'border-orange-600 bg-orange-600 text-white',
    dot: 'bg-orange-500',
    ring: 'ring-orange-500',
    text: 'text-orange-700 dark:text-orange-300',
    ink: 'bg-orange-700',
    softHover:
      'hover:border-orange-700 hover:bg-orange-500/20 hover:text-orange-700 dark:hover:border-orange-400 dark:hover:text-orange-400',
    wash: 'border-orange-500/40 bg-orange-500/8',
    rule: 'border-orange-500/20',
    edge: 'border-orange-500/25',
  },
  lime: {
    soft: 'border-lime-500/40 bg-lime-500/15 text-lime-800 dark:text-lime-200',
    filled:
      'border-lime-500/70 bg-lime-500/35 text-lime-900 dark:text-lime-100',
    solid: 'border-lime-600 bg-lime-600 text-white',
    dot: 'bg-lime-500',
    ring: 'ring-lime-500',
    text: 'text-lime-700 dark:text-lime-300',
    ink: 'bg-lime-700',
    softHover:
      'hover:border-lime-700 hover:bg-lime-500/20 hover:text-lime-700 dark:hover:border-lime-400 dark:hover:text-lime-400',
    wash: 'border-lime-500/40 bg-lime-500/8',
    rule: 'border-lime-500/20',
    edge: 'border-lime-500/25',
  },
}

/** Jeux de classes d'une couleur de domaine (repli sur la couleur par défaut
 * si la clé est absente/inconnue). */
export function domainColor(
  key: string | null | undefined,
): DomainColorClasses {
  return CLASSES[key as DomainColorKey] ?? CLASSES[DEFAULT_DOMAIN_COLOR]
}

/**
 * Les teintes d'un domaine en **valeurs CSS**, pour ce qui se peint et ne se
 * classe pas : un dégradé conique, un quadrillage, une couleur de trait SVG.
 * Les classes restent la règle ; ces variables viennent de la palette Tailwind
 * (`--color-teal-700`…), toujours émise.
 */
export interface DomainColorValues {
  /** L'encre (700) : traits, anneaux, coches. */
  ink: string
  /** La base (500). */
  base: string
  /** Le fond doux (500 à 15 %). */
  soft: string
  /** Le bord doux (500 à 40 %). */
  bord: string
  /** Le texte foncé sur fond doux (800). */
  fonce: string
}

export function domainColorValues(
  key: string | null | undefined,
): DomainColorValues {
  const k = (
    key && key in CLASSES ? key : DEFAULT_DOMAIN_COLOR
  ) as DomainColorKey
  const v = (shade: number) => `var(--color-${k}-${shade})`
  return {
    ink: v(700),
    base: v(500),
    soft: `color-mix(in oklab, ${v(500)} 15%, transparent)`,
    bord: `color-mix(in oklab, ${v(500)} 40%, transparent)`,
    fonce: v(800),
  }
}
