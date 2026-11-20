import { formatWait } from '@/entities/recall'

/**
 * L'attente (#103, 6m) : ne s'affiche que s'il ne reste que des questions en
 * attente. Un dos de carte rayé, à la teinte du domaine, le chrono en grand
 * (celle qui revient la première), « n questions reviennent », **Passer
 * outre** (elle se pose tout de suite) et **Quitter, je reviendrai**. Pas de
 * notification : une interro quittée se retrouve dans la to-do du jour.
 */
export function WaitCard({
  wait,
  count,
  ink,
  soft,
  bord,
  onSkip,
  onQuit,
}: {
  /** Les millisecondes avant la première qui revient. */
  wait: number
  /** Les questions qui restent. */
  count: number
  ink: string
  soft: string
  bord: string
  onSkip: () => void
  onQuit: () => void
}) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-2xl border"
      style={{
        borderColor: bord,
        color: ink,
        background: `repeating-linear-gradient(135deg, color-mix(in oklab, ${soft} 45%, var(--color-card)) 0 10px, ${soft} 10px 20px)`,
        boxShadow: `0 2px 0 ${bord}, 0 20px 28px -16px oklch(0.3 0.05 168 / 0.35)`,
      }}
    >
      <span className="font-heading text-[44px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
        {formatWait(wait)}
      </span>
      <span className="text-[13px]">
        {count > 1 ? `${count} questions reviennent` : 'Une question revient'}
      </span>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onSkip}
          className="h-[34px] rounded-[7px] border bg-card px-3.5 text-[13px] font-semibold"
          style={{ borderColor: bord }}
        >
          Passer outre
        </button>
        <button
          type="button"
          onClick={onQuit}
          className="h-[34px] rounded-[7px] px-3.5 text-[13px] font-semibold hover:bg-card/60"
        >
          Quitter, je reviendrai
        </button>
      </div>
    </div>
  )
}
