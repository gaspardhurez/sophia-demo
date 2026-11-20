import { Check } from 'lucide-react'
import type { ReactNode } from 'react'

import type { DomainColorClasses } from '@/entities/domain'
import {
  type AcquisitionPlan,
  cycleProgress,
  PHASES,
  type PhaseProgress,
  phasesProgress,
  type RampItem,
  recallLaunched,
} from '@/entities/plan'
import { cn } from '@/shared/lib/utils'
import { CHIP_TONES } from '@/shared/ui'

/**
 * L'acquisition en miniature — **toutes les phases à la fois**.
 *
 * Sur la page on choisit une phase et on travaille dedans ; ici on ne travaille
 * pas, on regarde. Un sélecteur obligerait à cliquer pour savoir ce qu'il y a
 * dans les autres, alors que le panneau n'a qu'un seul travail : répondre
 * « où en est ce savoir » sans faire perdre l'arbre.
 */
export function PanelAcquisition({
  plan,
  items,
  accent,
  domainEmoji,
}: {
  plan: AcquisitionPlan
  items: RampItem[]
  accent: DomainColorClasses
  domainEmoji: string
}) {
  const phases = phasesProgress(plan, items).filter((p) => p.state !== 'off')
  const { done, total } = cycleProgress(plan, items)

  return (
    <section className="px-5 pt-4 pb-5">
      <h3 className="mb-2.5 flex items-center gap-2 font-heading text-[13px] font-semibold">
        L'acquisition
        <span
          aria-hidden
          className="block h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
        >
          <span
            className={cn('block h-full rounded-full', accent.dot)}
            style={{ width: total > 0 ? `${(done / total) * 100}%` : 0 }}
          />
        </span>
        <span className="shrink-0 text-[11px] font-semibold text-muted-foreground tabular-nums">
          {done}/{total}
        </span>
      </h3>

      <div className="flex flex-col gap-3.5">
        {phases.map((phase) => (
          <PhaseBlock
            key={phase.key}
            phase={phase}
            items={items}
            plan={plan}
            accent={accent}
            domainEmoji={domainEmoji}
          />
        ))}
      </div>
    </section>
  )
}

function PhaseBlock({
  phase,
  items,
  plan,
  accent,
  domainEmoji,
}: {
  phase: PhaseProgress
  items: RampItem[]
  plan: AcquisitionPlan
  accent: DomainColorClasses
  domainEmoji: string
}) {
  const nature = PHASES.find((p) => p.key === phase.key)?.nature
  const rows =
    phase.key === 'retention'
      ? items.filter((i) => i.in_retention)
      : nature
        ? items.filter((i) => i.nature === nature)
        : []

  return (
    <div className="flex flex-col gap-1.5">
      {/* L'en-tête d'une phase garde le même fond quel que soit son état : ce
          qui la distingue, c'est sa pastille, et la teinte est déjà prise par
          les objets en dessous. */}
      <div className="flex items-center gap-[7px] rounded-[7px] bg-muted px-2 py-[5px]">
        <PhaseDot phase={phase} accent={accent} />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
          {phase.label}
        </span>
        {phase.total > 0 && (
          <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            {phase.key === 'retention'
              ? phase.meta
              : `${phase.done} sur ${phase.total}`}
          </span>
        )}
      </div>

      {phase.key === 'study' ? (
        <MiniRow
          emoji="📓"
          badge={accent.soft}
          title="Notes"
          // Cochée comme dans la tuile : dès le test lancé (« j'ai étudié »).
          trailing={
            plan.study_mastered || recallLaunched(plan) ? <MiniCheck /> : null
          }
        />
      ) : (
        rows.map((item) => (
          <MiniItem
            key={item.id}
            item={item}
            accent={accent}
            domainEmoji={domainEmoji}
          />
        ))
      )}
    </div>
  )
}

/**
 * La pastille d'une phase — pleine si validée, en secteur si entamée.
 *
 * Le secteur est celui de la page, dans la teinte du domaine : le panneau dit
 * la même chose que la page, en plus petit, il ne dit pas moins.
 */
function PhaseDot({
  phase,
  accent,
}: {
  phase: PhaseProgress
  accent: DomainColorClasses
}) {
  if (phase.state === 'done') {
    return (
      <span
        aria-hidden
        className={cn(
          'grid size-[13px] shrink-0 place-items-center rounded-full bg-current',
          accent.text,
        )}
      >
        <Check className="size-2 text-white" strokeWidth={3} />
      </span>
    )
  }
  if (phase.state === 'doing' && phase.ratio > 0) {
    const pct = Math.round(phase.ratio * 100)
    return (
      <span
        aria-hidden
        className={cn(
          'size-[13px] shrink-0 rounded-full border-[1.5px]',
          accent.text,
        )}
        style={{
          borderColor: 'currentColor',
          background: `conic-gradient(currentColor 0 ${pct}%, transparent ${pct}% 100%)`,
        }}
      />
    )
  }
  return (
    <span
      aria-hidden
      className="size-[13px] shrink-0 rounded-full border-[1.5px] border-ring"
    />
  )
}

function MiniItem({
  item,
  accent,
  domainEmoji,
}: {
  item: RampItem
  accent: DomainColorClasses
  domainEmoji: string
}) {
  return (
    <MiniRow
      emoji={item.emoji || domainEmoji || '•'}
      badge={item.kind === 'integrated' ? CHIP_TONES.sky : accent.soft}
      title={item.title}
      trailing={
        item.mastered ? (
          <MiniCheck />
        ) : item.sessions > 0 ? (
          <MiniChip className={CHIP_TONES.amber}>En cours</MiniChip>
        ) : item.nature === 'situation' ? (
          <MiniChip className={CHIP_TONES.neutral}>Pas réussie</MiniChip>
        ) : null
      }
    />
  )
}

/**
 * Une ligne d'objet en miniature — une **carte bordée**, pas une ligne nue.
 *
 * Sur la page les items d'une phase se suivent dans un panneau qui les
 * contient ; ici ils flottent sous leur en-tête, et sans bordure ils se
 * confondraient avec la phase suivante.
 */
function MiniRow({
  emoji,
  badge,
  title,
  trailing,
}: {
  emoji: string
  badge: string
  title: string
  trailing: ReactNode
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-[5px]">
      <span
        aria-hidden
        className={cn(
          'grid size-[22px] shrink-0 place-items-center rounded-md border text-[11px]',
          badge,
        )}
      >
        {emoji}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs leading-tight">
        {title}
      </span>
      {trailing}
    </div>
  )
}

/** La coche d'un objet validé — carrée, comme sur la page, en plus petit. */
function MiniCheck() {
  return (
    <span
      aria-label="Réussi"
      className={cn(
        'grid size-[17px] shrink-0 place-items-center rounded-[3px] text-[10px] font-semibold',
        CHIP_TONES.emerald,
      )}
    >
      ✓
    </span>
  )
}

/** Les chips du panneau : un cran plus petites que celles de la page. */
function MiniChip({
  children,
  className,
}: {
  children: ReactNode
  className: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-[3px] px-[5px] py-px text-[10px] font-medium',
        className,
      )}
    >
      {children}
    </span>
  )
}
