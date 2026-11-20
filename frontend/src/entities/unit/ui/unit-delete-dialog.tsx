import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

import { ApiError } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  toast,
} from '@/shared/ui'

import { useDeleteUnit, useUnits, useUnitUsage } from '../api/queries'
import type { Unit, UnitUsage } from '../model/types'

/** Ce que devient chaque usage sans remplacement (décision du 24/09/2026). */
const LINES: {
  key: keyof UnitUsage
  axis: string
  one: string
  many: string
  fate: string
  /** Rien ne survit : dit en rouge. Délié : dit en gris. */
  lost: boolean
}[] = [
  {
    key: 'totals',
    axis: 'Totaux',
    one: 'total',
    many: 'totaux',
    fate: 'Supprimés',
    lost: true,
  },
  {
    key: 'metrics',
    axis: 'Résultats',
    one: 'métrique',
    many: 'métriques',
    fate: 'Sans unité',
    lost: false,
  },
  {
    key: 'activity_types',
    axis: 'Activités types',
    one: 'activité type',
    many: 'activités types',
    fate: 'Sans unité',
    lost: false,
  },
  {
    key: 'values',
    axis: 'Activités',
    one: 'valeur déclarée',
    many: 'valeurs déclarées',
    fate: 'Supprimées',
    lost: true,
  },
]

const label = (u: Pick<Unit, 'emoji' | 'effective_label'>) =>
  `${u.emoji ? `${u.emoji} ` : ''}${u.effective_label}`

/**
 * Supprimer une unité — annoncer le sort de chaque usage, et proposer de la
 * **remplacer** (design #27).
 *
 * Remplacer est le geste du ménage — un doublon, une faute de frappe : tout
 * bascule vers l'autre unité, sans conversion, puis celle-ci disparaît. Sans
 * remplacement, Totaux et valeurs déclarées partent avec elle, métriques et
 * activités types restent sans unité. C'est le back qui tranche ; l'écran annonce.
 */
export function UnitDeleteDialog({
  unit,
  onClose,
  onDeleted,
}: {
  unit: Unit | null
  onClose: () => void
  /** Après coup : l'unité de remplacement, s'il y en a une. */
  onDeleted?: (replaceBy: string | null) => void
}) {
  const { data: usage } = useUnitUsage(unit?.id ?? null)
  const { data: units } = useUnits()
  const remove = useDeleteUnit()
  const [replaceBy, setReplaceBy] = useState<string | null>(null)

  const candidates = (units ?? []).filter((u) => u.id !== unit?.id)
  const replacement = candidates.find((u) => u.id === replaceBy)
  const lines = LINES.filter((l) => (usage?.[l.key] ?? 0) > 0)

  function close() {
    setReplaceBy(null)
    onClose()
  }

  async function confirm() {
    if (!unit) return
    try {
      await remove.mutateAsync({
        id: unit.id,
        replaceBy: replaceBy ?? undefined,
      })
      onDeleted?.(replaceBy)
      close()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'La suppression a échoué',
      )
    }
  }

  return (
    <Dialog open={unit !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Supprimer « {unit?.effective_label} » ?</DialogTitle>
        </DialogHeader>

        {lines.length > 0 && (
          <ul className="grid">
            {lines.map((l) => {
              const n = usage?.[l.key] ?? 0
              return (
                <li
                  key={l.key}
                  className="flex h-[34px] items-center gap-2 border-b border-border/70 last:border-0"
                >
                  <span className="w-24 shrink-0 text-[10px] uppercase tracking-[.05em] text-muted-foreground">
                    {l.axis}
                  </span>
                  <span className="font-heading text-sm font-semibold tabular-nums">
                    {n}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {n > 1 ? l.many : l.one}
                  </span>
                  <span
                    className={cn(
                      'ml-auto text-[13px] font-medium',
                      l.lost && !replacement
                        ? 'text-destructive'
                        : 'text-muted-foreground',
                    )}
                  >
                    {replacement ? `→ ${label(replacement)}` : l.fate}
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        {lines.length > 0 && (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            Remplacer par
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 border-b-[1.5px] border-dashed border-ring text-foreground"
                >
                  {replacement ? (
                    label(replacement)
                  ) : (
                    <span className="text-muted-foreground">une unité</span>
                  )}
                  <ChevronDown className="size-3" strokeWidth={2.5} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-60 w-56 overflow-y-auto"
              >
                {candidates.map((u) => (
                  <DropdownMenuItem
                    key={u.id}
                    onSelect={() => setReplaceBy(u.id)}
                  >
                    {label(u)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Annuler
          </Button>
          {replacement ? (
            <Button isPending={remove.isPending} onClick={() => void confirm()}>
              Remplacer et supprimer
            </Button>
          ) : (
            <Button
              variant="ghost"
              isPending={remove.isPending}
              className="bg-destructive/10 text-destructive hover:bg-destructive/15"
              onClick={() => void confirm()}
            >
              {lines.length > 0 ? 'Supprimer quand même' : 'Supprimer'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
