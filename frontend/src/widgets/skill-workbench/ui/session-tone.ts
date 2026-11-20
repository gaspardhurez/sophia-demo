import type { CSSProperties } from 'react'

import type { SessionState } from '../model/sessions'

/** La teinte d'une séance du bloc Séances (#160, `kit/Seances savoir`). */

/** Les teintes du domaine, en valeurs CSS (`domainColorValues`). */
export type SessionColors = { ink: string; base: string }

/** L'encre du domaine, posée en variable : `DoneMark` la lit en classe
 *  (`bg-(--sessions-ink)`), y compris dans la liste du jour, qui vit hors du
 *  bloc (portail). */
export const inkVar = (colors: SessionColors) =>
  ({ '--sessions-ink': colors.ink }) as CSSProperties

/** La teinte d'une séance — sa case, ses étiquettes : faite, au fond du
 *  domaine ; passée non faite, en rouge (palette Notion) ; à venir, en
 *  pointillé. */
export function tone(
  state: SessionState,
  colors: SessionColors,
): { className: string; style?: CSSProperties } {
  if (state === 'done')
    return {
      className: '',
      style: {
        background: `color-mix(in oklch, ${colors.base} 14%, transparent)`,
        color: colors.ink,
      },
    }
  if (state === 'late')
    return {
      className:
        'bg-[#FFE2DD] text-[#5D1715] dark:bg-[#6E3630] dark:text-[#EDB1A8]',
    }
  return {
    className:
      'border border-dashed border-ring/70 bg-background text-foreground/75',
  }
}
