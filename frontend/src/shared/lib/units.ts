/**
 * Affichage des unités.
 *
 * Le catalogue vit côté serveur (table `units`, référencée par clé étrangère) —
 * ici on ne garde que ce qui relève du rendu : les teintes et l'accord.
 *
 * Le type est **structurel** : la couche `shared` ne connaît pas les entités.
 */

export type UnitKind = 'time' | 'distance' | 'count' | 'other'

export type UnitTone =
  | 'default'
  | 'gray'
  | 'brown'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red'

/** Forme minimale attendue pour afficher une unité. */
export interface UnitLike {
  name: string
  /** Pluriel résolu (saisi, sinon `pluralOf`). */
  effective_plural?: string
  /** Libellé de pastille résolu (saisi, sinon singulier capitalisé). */
  effective_label?: string
  kind?: UnitKind
  /**
   * Secondes que vaut UNE unité (60, 3600) ; `null` = ce n'est pas une durée.
   * Porte à la fois le fait et l'échelle — l'un ne sert à rien sans l'autre.
   */
  seconds_per_unit?: number | null
  tone: UnitTone
}

/**
 * Teintes reprises de la palette d'étiquettes Notion : basse saturation,
 * dominante chaude, texte foncé de la même famille. Elles servent à
 * **distinguer**, pas à hiérarchiser — la couleur porteuse de sens dans Sophia
 * reste celle du domaine.
 */
export const UNIT_TONES: { key: UnitTone; label: string }[] = [
  { key: 'default', label: 'Par défaut' },
  { key: 'gray', label: 'Gris' },
  { key: 'brown', label: 'Marron' },
  { key: 'orange', label: 'Orange' },
  { key: 'yellow', label: 'Jaune' },
  { key: 'green', label: 'Vert' },
  { key: 'blue', label: 'Bleu' },
  { key: 'purple', label: 'Violet' },
  { key: 'pink', label: 'Rose' },
  { key: 'red', label: 'Rouge' },
]

const TONE_CLASSES: Record<UnitTone, string> = {
  default: 'bg-[#EFEFEE] text-[#32302C] dark:bg-[#373737] dark:text-[#D4D4D4]',
  gray: 'bg-[#E3E2E0] text-[#32302C] dark:bg-[#454B4E] dark:text-[#CFCFCD]',
  brown: 'bg-[#EEE0DA] text-[#442A1E] dark:bg-[#603B2C] dark:text-[#D5B3A2]',
  orange: 'bg-[#FADEC9] text-[#49290E] dark:bg-[#854C1D] dark:text-[#EFC5A0]',
  yellow: 'bg-[#FDECC8] text-[#402C1B] dark:bg-[#89632A] dark:text-[#EFD9A8]',
  green: 'bg-[#DBEDDB] text-[#1C3829] dark:bg-[#2B593F] dark:text-[#B3D5BF]',
  blue: 'bg-[#D3E5EF] text-[#183347] dark:bg-[#28456C] dark:text-[#AFCBE3]',
  purple: 'bg-[#E8DEEE] text-[#412454] dark:bg-[#492F64] dark:text-[#CDB3E0]',
  pink: 'bg-[#F5E0E9] text-[#4C2337] dark:bg-[#69314C] dark:text-[#E5B3CC]',
  red: 'bg-[#FFE2DD] text-[#5D1715] dark:bg-[#6E3630] dark:text-[#EDB1A8]',
}

/** Classes d'une teinte. */
export function toneClasses(tone: UnitTone | null | undefined): string {
  return TONE_CLASSES[tone ?? 'default']
}

/**
 * Teinte **proposée** à la création, dérivée du nom. Déterministe, donc stable
 * d'un appel à l'autre ; l'utilisateur peut ensuite en choisir une autre.
 * Calcul propre au front : le back ne propose rien, il prend la teinte envoyée
 * (`default` si aucune).
 */
export function defaultTone(name: string): UnitTone {
  const u = name.trim().toLowerCase()
  let h = 0
  for (let i = 0; i < u.length; i++) h = (h * 31 + u.charCodeAt(i)) >>> 0
  // On saute `default` et `gray` : une teinte proposée doit se voir.
  const pickable = UNIT_TONES.slice(2)
  return pickable[h % pickable.length].key
}

/**
 * Accorde une unité selon la valeur, **en ligne** (après un nombre) : minuscule
 * et forme brève. Le pluriel résolu vient du serveur.
 */
/**
 * Le pluriel par défaut d'un mot compté : « + s », sauf s'il finit déjà par
 * s, x ou z (« fois », « prix », « nez »). Même règle que le back
 * (`domain/unit.py`), pour les unités comme pour le mot d'un Total (#58).
 */
export function pluralOf(singular: string): string {
  return /[sxz]$/i.test(singular) ? singular : `${singular}s`
}

export function unitLabel(
  unit: UnitLike | null | undefined,
  count: number,
): string {
  if (!unit) return ''
  if (Math.abs(count) <= 1) return unit.name
  return unit.effective_plural ?? pluralOf(unit.name)
}

/**
 * Libellé de **pastille** : capitalisé par défaut. Une vignette tout en
 * minuscules fait négligé, alors qu'en ligne après un nombre la minuscule
 * s'impose — deux usages, deux formes.
 */
export function unitBadge(unit: UnitLike): string {
  return unit.effective_label ?? unit.name[0].toUpperCase() + unit.name.slice(1)
}

/**
 * Unité de durée : la valeur s'y écrit et s'y lit en `mm:ss`. Une telle unité
 * ne se déclare pas sur une activité — sa durée se lit au calendrier (Total en
 * mode durée).
 *
 * Le critère est `seconds_per_unit`, pas `kind` : ce dernier codait « divise par
 * 3600 » sous un nom qui promettait « c'est du temps ».
 */
export function isTimeUnit(unit: UnitLike | null | undefined): boolean {
  return Boolean(unit?.seconds_per_unit)
}

/**
 * Une valeur (dans son unité) en `mm:ss` — ou `h:mm:ss` au-delà de l'heure.
 *
 * **Rien de spécial n'est stocké** : 49:30 est le nombre 49,5 dans une unité qui
 * vaut 60 secondes. Toute l'arithmétique — record, comparaison à la cible,
 * échelle de la courbe — continue de travailler sur un nombre ordinaire ; seule
 * la lecture change. Une seconde vaut 0,0167 minute, un flottant la porte sans
 * peine.
 */
export function formatDuration(
  value: number,
  unit: UnitLike | null | undefined,
): string {
  const total = Math.round(Math.abs(value) * (unit?.seconds_per_unit ?? 1))
  const sign = value < 0 ? '-' : ''
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${sign}${h}:${pad(m)}:${pad(s)}` : `${sign}${m}:${pad(s)}`
}

/**
 * `"49:30"` → la valeur dans l'unité (49,5 en minutes). `null` si illisible.
 *
 * Un nombre nu reste accepté et pris **dans l'unité** : taper « 50 » sur un
 * chrono en minutes donne 50 minutes, pas 50 secondes. C'est la lecture qu'on
 * fait spontanément d'un champ dont l'unité est affichée à côté.
 */
export function parseDuration(
  text: string,
  unit: UnitLike | null | undefined,
): number | null {
  const raw = text.trim().replace(',', '.')
  if (!raw) return null
  const parts = raw.split(':')
  if (parts.length === 1) {
    const n = Number(parts[0])
    return Number.isFinite(n) ? n : null
  }
  if (parts.length > 3) return null
  // Lues de droite à gauche : « 90:00 » vaut 90 min, « 1:30:00 » vaut 1 h 30.
  const scales = [1, 60, 3600]
  let seconds = 0
  for (const [i, part] of [...parts].reverse().entries()) {
    const n = Number(part)
    if (!Number.isFinite(n) || n < 0) return null
    seconds += n * scales[i]
  }
  return seconds / (unit?.seconds_per_unit ?? 1)
}

/** La valeur telle qu'on la donne à lire : `mm:ss` sur une durée, sinon nue. */
export function formatValue(
  value: number,
  unit: UnitLike | null | undefined,
): string {
  return isTimeUnit(unit)
    ? formatDuration(value, unit)
    : value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
}
