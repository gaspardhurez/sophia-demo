/**
 * Un élément du périmètre d'un cycle (`scope`) : son libellé, et s'il est
 * **dans ce cycle** (retenu) ou **hors de ce cycle** (gardé pour dire les
 * bords). Le périmètre reste un texte ; ces fonctions le lisent et
 * l'écrivent (« Cadrer l'étude » #175, en-tête des notes #176).
 */
export interface ScopeTag {
  label: string
  inCycle: boolean
}

/** L'en-tête de la ligne des bords, dans le texte du périmètre. */
const OUTSIDE = 'Hors de ce cycle :'
/** Entre deux bords de cette ligne : pas de virgule, un libellé peut en
 *  porter une (« Cibles : grille latérale, sortie de vitre »). */
const SEP = ' ; '
/** L'ancien séparateur (phase 1, tout sur une ligne), encore relu. */
const OLD_SEP = ' · '

/** Un libellé tel qu'il s'écrit : sans le séparateur des bords. */
export function scopeLabel(label: string): string {
  return label.trim().replaceAll(';', ',')
}

/**
 * Le texte du périmètre (`scope`) qu'écrit le cadrage — le même que celui
 * du serveur (`domain/framing.py`, `scope_text`) : un élément retenu par
 * ligne, puis « Hors de ce cycle : a ; b » s'il reste des bords. Rien de
 * retenu : pas de périmètre (`null`), même s'il reste des bords — « pas de
 * périmètre pour l'instant » est une sortie normale.
 *
 *     Placement sous le lob
 *     Frappe : effet latéral et coupé
 *     Hors de ce cycle : Volée côté revers ; Smash par 3
 */
export function formatScope(tags: readonly ScopeTag[]): string | null {
  const kept = tags
    .filter((t) => t.inCycle)
    .map((t) => scopeLabel(t.label))
    .filter(Boolean)
  if (!kept.length) return null
  const outside = tags
    .filter((t) => !t.inCycle)
    .map((t) => scopeLabel(t.label))
    .filter(Boolean)
  const lines = [...kept]
  if (outside.length) lines.push(`${OUTSIDE} ${outside.join(SEP)}`)
  return lines.join('\n')
}

/**
 * Le chemin inverse (`parse_scope` du serveur), pour **relancer** le
 * cadrage depuis le périmètre existant : chaque ligne non vide est un
 * élément retenu (puce `-`, `•` ou `*` de début de ligne retirée), la ligne
 * « Hors de ce cycle : … » donne les bords. Un périmètre écrit à la main se
 * relit ainsi ligne à ligne ; celui de la phase 1 (« a · b » sur une ligne)
 * se relit aussi.
 */
export function parseScope(scope: string | null | undefined): ScopeTag[] {
  const tags: ScopeTag[] = []
  const push = (label: string, inCycle: boolean) => {
    const l = label.trim()
    if (l && !tags.some((t) => t.label === l)) tags.push({ label: l, inCycle })
  }
  for (const raw of (scope ?? '').split('\n')) {
    const line = raw
      .trim()
      .replace(/^[-•*]+/, '')
      .trim()
    if (!line) continue
    if (line.startsWith(OUTSIDE)) {
      const rest = line.slice(OUTSIDE.length)
      const sep = rest.includes(SEP.trim()) ? SEP.trim() : OLD_SEP.trim()
      for (const part of rest.split(sep)) push(part, false)
    } else for (const part of line.split(OLD_SEP)) push(part, true)
  }
  return tags
}
