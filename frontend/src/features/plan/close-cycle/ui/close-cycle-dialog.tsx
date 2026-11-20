import { useState } from 'react'

import {
  type AcquisitionPlan,
  phasesProgress,
  rampOf,
  useCompletePlan,
  usePlanTransition,
} from '@/entities/plan'
import { usePracticeItems } from '@/entities/practice'
import { ApiError } from '@/shared/api'
import { fmtShortDate } from '@/shared/lib/date'
import { cn } from '@/shared/lib/utils'
import {
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@/shared/ui'

type Issue = 'acquired' | 'abandoned'

/**
 * Terminer l'acquisition — **deux issues, et elles ne disent pas la même
 * chose**.
 *
 * *Acquis* fait passer le savoir en rétention : la construction s'arrête,
 * l'entretien commence. *Abandonner* ferme le cycle sans l'acquérir, et il se
 * reprend tel quel plus tard.
 *
 * Le récap n'est pas une condition : on peut terminer avec des phases
 * inachevées. `is_satisfied` **oriente**, il ne tranche pas — c'est le droit de
 * décider, celui que la doctrine réserve partout à l'utilisateur.
 *
 * Déclarer acquis, c'est aussi choisir **ce qu'on garde en rétention** : une
 * case par objet de la rampe, cochée d'après ce que le cycle gardait déjà —
 * et, en tête, l'**Interro** quand le cycle en a une (#80) : gardée, sa courbe
 * continue après l'acquis ; sinon elle s'arrête.
 */
export function CloseCycleDialog({
  plan,
  open,
  onOpenChange,
  domainEmoji = '',
}: {
  plan: AcquisitionPlan
  /** L'emoji d'un objet qui n'en a pas : celui du domaine. */
  domainEmoji?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: library } = usePracticeItems(plan.skill_id)
  const complete = useCompletePlan()
  const abandon = usePlanTransition('abandon')
  const [issue, setIssue] = useState<Issue>('acquired')
  const ramp = rampOf(plan, library ?? [])
  const [kept, setKept] = useState<Set<string> | null>(null)
  const keep =
    kept ?? new Set(ramp.filter((i) => i.in_retention).map((i) => i.id))
  // L'interro se garde si sa courbe a démarré et n'est pas terminée : une
  // seule courbe, qui continue en rétention ; finie, il ne se passe plus rien.
  const hasRecall = plan.recall_stage != null && !plan.recall_finished
  const [keepRecall, setKeepRecall] = useState(plan.recall_in_retention)

  const phases = phasesProgress(plan, ramp).filter(
    (p) => p.state !== 'off' && p.key !== 'retention',
  )

  function toggle(id: string) {
    const next = new Set(keep)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setKept(next)
  }

  async function confirm() {
    try {
      if (issue === 'acquired')
        await complete.mutateAsync({
          id: plan.id,
          retentionItemIds: [...keep],
          recallInRetention: hasRecall ? keepRecall : undefined,
        })
      else await abandon.mutateAsync(plan.id)
      toast.success(issue === 'acquired' ? 'Savoir acquis' : 'Cycle abandonné')
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'La clôture a échoué')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-[512px]">
        <DialogHeader>
          <DialogTitle className="text-lg">Terminer l'acquisition</DialogTitle>
          <DialogDescription>
            {plan.target_level && `« ${plan.target_level} » — `}
            {plan.opened_at
              ? `cycle ouvert le ${fmtShortDate(new Date(plan.opened_at))}.`
              : 'cycle sans date d’ouverture.'}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-lg border border-border">
          {phases.map((p) => (
            <div
              key={p.key}
              className="flex items-center gap-3 border-b border-border/60 px-3.5 py-2.5 last:border-b-0"
            >
              <span className="min-w-0 flex-1 text-[13px]">{p.label}</span>
              {p.state === 'done' ? (
                <Chip tone="emerald">
                  ✓ {p.key === 'study' ? 'validée' : 'complète'}
                </Chip>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {p.key === 'study'
                    ? 'à valider'
                    : `${p.done} sur ${p.total} réussis`}
                </span>
              )}
            </div>
          ))}
        </div>

        <section className="flex flex-col gap-2">
          <h3 className="font-heading text-[13px] font-semibold">
            Ce que tu déclares
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <IssueCard
              selected={issue === 'acquired'}
              onSelect={() => setIssue('acquired')}
              title="Acquis"
              detail="Le cycle se ferme, la rétention prend le relais."
            />
            <IssueCard
              selected={issue === 'abandoned'}
              onSelect={() => setIssue('abandoned')}
              title="Abandonner"
              detail="Le cycle se ferme, reprenable plus tard."
            />
          </div>
        </section>

        {issue === 'acquired' && (ramp.length > 0 || hasRecall) && (
          <section className="flex flex-col gap-2">
            <h3 className="font-heading text-[13px] font-semibold">
              Garder en rétention
            </h3>
            <div className="overflow-hidden rounded-lg border border-border">
              {hasRecall && (
                <KeepRow
                  on={keepRecall}
                  onToggle={() => setKeepRecall(!keepRecall)}
                  emoji="🧠"
                  title="Interro"
                />
              )}
              {ramp.map((item) => (
                <KeepRow
                  key={item.id}
                  on={keep.has(item.id)}
                  onToggle={() => toggle(item.id)}
                  emoji={item.emoji || domainEmoji || '•'}
                  title={item.title}
                />
              ))}
            </div>
          </section>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            disabled={complete.isPending || abandon.isPending}
            onClick={() => void confirm()}
          >
            {issue === 'acquired' ? 'Déclarer acquis' : 'Abandonner le cycle'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Une case de « Garder en rétention ». */
function KeepRow({
  on,
  onToggle,
  emoji,
  title,
}: {
  on: boolean
  onToggle: () => void
  emoji: string
  title: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onToggle}
      className="flex w-full items-center gap-2.5 border-b border-border/60 px-3 py-2 text-left text-[13px] last:border-b-0 hover:bg-muted/40"
    >
      <span
        aria-hidden
        className={cn(
          'grid size-4 shrink-0 place-items-center rounded-[4px] text-[10px] text-background',
          on ? 'bg-foreground' : 'border-[1.5px] border-ring/70 bg-card',
        )}
      >
        {on && '✓'}
      </span>
      <span className="shrink-0">{emoji}</span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
    </button>
  )
}

function IssueCard({
  selected,
  onSelect,
  title,
  detail,
}: {
  selected: boolean
  onSelect: () => void
  title: string
  detail: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'rounded-[10px] p-3 text-left transition-colors',
        selected
          ? 'border-[1.5px] border-foreground bg-muted'
          : 'border border-border bg-card hover:bg-muted/40',
      )}
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>
    </button>
  )
}
