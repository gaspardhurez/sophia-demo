import { Play } from 'lucide-react'

/**
 * La carte de départ d'un cycle prévu (`prod/Savoir` jusqu'au 24/10, reprise
 * le 26/10) : dans la colonne de droite, à la place des notes — l'encre
 * foncée du domaine, son emoji en filigrane, « Cycle prévu », le titre en
 * grand (🎯 le projet), et ▶ Démarrer en blanc.
 */
export function StartCard({
  emoji,
  title,
  ink,
  pending = false,
  onStart,
}: {
  emoji: string
  title: string
  /** L'encre foncée du domaine (CSS) : le fond, et le texte du bouton. */
  ink: string
  pending?: boolean
  onStart: () => void
}) {
  return (
    <div
      className="relative flex flex-col gap-3 overflow-hidden rounded-xl px-4 pt-[18px] pb-4 text-white"
      style={{ background: ink }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-[18px] -right-3.5 rotate-[-8deg] text-[112px] leading-none opacity-[.16]"
      >
        {emoji}
      </span>
      <span className="relative text-[11px] font-semibold tracking-[.08em] uppercase opacity-80">
        Cycle prévu
      </span>
      <span className="relative font-heading text-2xl leading-[1.1] font-bold text-balance">
        {title}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={onStart}
        className="relative inline-flex h-9 items-center gap-2 self-start rounded-[9px] bg-white px-4 text-[13px] font-bold transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{ color: ink }}
      >
        <Play className="size-3 fill-current" />
        Démarrer
      </button>
    </div>
  )
}
