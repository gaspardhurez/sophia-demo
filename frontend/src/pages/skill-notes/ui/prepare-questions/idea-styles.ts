/**
 * Le rose des suggestions de Sophia (`prod/Notes`, « Préparer les
 * questions ») : la maquette le donne en dur (#E4A9C4, #FDF7FA, #7A4A62,
 * #4C2337…) ; ici il se tire du rose de la palette des notes
 * (`--note-text-pink`, clair ou sombre, posé par `.notes-palette`) — comme
 * le vert de la dictée —, pour suivre le mode sombre. Les encres mêlent ce
 * rose au texte de l'app : sombres sur fond clair, claires sur fond sombre.
 */

/** L'encre des libellés (#7A4A62) : raison, « Pas besoin », l'angle, le
 *  libellé de l'interrupteur. */
export const IDEA_LABEL =
  'text-[color-mix(in_oklch,var(--note-text-pink)_60%,var(--foreground))]'

/** L'encre du texte d'une carte (#4C2337). */
export const IDEA_TEXT =
  'text-[color-mix(in_oklch,var(--note-text-pink)_28%,var(--foreground))]'

/** La carte : trait pointillé rose (#E4A9C4), fond rosé (#FDF7FA). */
export const IDEA_CARD =
  'rounded-lg border border-dashed border-(--note-text-pink)/45 bg-(--note-text-pink)/5'

/** « Écrire la question » : fond de la page, liseré rose (#EBCFDC). */
export const IDEA_WRITE = `cursor-pointer rounded-md bg-card text-[12.5px] font-medium shadow-[inset_0_0_0_1px] shadow-(--note-text-pink)/28 disabled:cursor-default disabled:opacity-60 ${IDEA_TEXT}`

/** « Pas besoin » : texte seul, fond rose au survol (#F5E0E9). */
export const IDEA_DISMISS = `cursor-pointer rounded-md text-[12.5px] font-medium hover:bg-(--note-text-pink)/16 ${IDEA_LABEL}`

/** L'interrupteur allumé (#7A4A62). */
export const IDEA_SWITCH_ON =
  'bg-[color-mix(in_oklch,var(--note-text-pink)_60%,var(--foreground))]'
