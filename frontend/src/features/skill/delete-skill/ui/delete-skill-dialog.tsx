import { useState } from 'react'

import { domainColorValues, useDomains } from '@/entities/domain'
import { type Skill, useDeleteSkill } from '@/entities/skill'
import { ApiError } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@/shared/ui'

/**
 * Supprimer un savoir (design #27, `kit/Supprimer savoir` depuis #65) : ce qui est
 * perdu, puis le sort de ses enfants — remontés à sa place, ou supprimés avec.
 *
 * Ses cycles et ses exercices partent avec lui ; ses activités restent au
 * calendrier, détachées. Les projets qui le visaient perdent un objectif.
 */
export function DeleteSkillDialog({
  skill,
  childCount: children,
  parentName,
  projects,
  cycleCount,
  onClose,
  onDeleted,
}: {
  skill: Skill
  /** Ses enfants directs. */
  childCount: number
  /** Son parent, s'il en a un — là où ses enfants remonteraient. */
  parentName: string | null
  /** Les projets qui le visent. */
  projects: { id: string; title: string }[]
  /** Ses cycles, tous états confondus. */
  cycleCount: number
  onClose: () => void
  onDeleted: () => void
}) {
  const remove = useDeleteSkill()
  const [kids, setKids] = useState<'lift' | 'delete'>('lift')
  const { data: domains } = useDomains()

  async function confirm() {
    try {
      await remove.mutateAsync({ id: skill.id, children: kids })
      onDeleted()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'La suppression a échoué',
      )
    }
  }

  const lines: { mark: string; text: string }[] = projects.map((o) => ({
    mark: '🎯',
    text: `${o.title} perd un objectif.`,
  }))
  if (cycleCount > 0)
    lines.push({
      mark: '·',
      text: `${cycleCount > 1 ? 'Ses cycles' : 'Son cycle'} et ses exercices sont supprimés. Ses activités restent au calendrier, sans savoir.`,
    })
  if (!lines.length)
    lines.push({
      mark: '·',
      text: "Il n'est lié à aucun projet et n'a pas encore de cycle.",
    })

  // Coché : un anneau épais à l'encre du domaine.
  const ink = domainColorValues(
    domains?.find((d) => d.id === skill.domain_id)?.color,
  ).ink
  const radio = (on: boolean) =>
    cn(
      'size-3.5 shrink-0 rounded-full bg-card',
      on ? 'border-[4.5px]' : 'border-[1.5px] border-ring',
    )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Supprimer « {skill.name} » ?</DialogTitle>
        </DialogHeader>
        <div className="grid gap-1.5">
          {lines.map((l) => (
            <div
              key={l.text}
              className="flex items-start gap-2 text-[13px] leading-[1.45] text-pretty text-muted-foreground"
            >
              <span className="w-4 shrink-0 text-center">{l.mark}</span>
              {l.text}
            </div>
          ))}
        </div>
        {children > 0 && (
          <div className="grid gap-2 border-t pt-3">
            <span className="text-xs font-semibold">
              {children > 1 ? `Ses ${children} savoirs` : 'Son savoir'}
            </span>
            {(
              [
                [
                  'lift',
                  parentName
                    ? `Les remonter sous « ${parentName} »`
                    : 'Les remonter au domaine',
                ],
                ['delete', 'Les supprimer avec'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setKids(key)}
                className="flex items-center gap-2 text-left text-[13px]"
              >
                <span
                  className={radio(kids === key)}
                  style={kids === key ? { borderColor: ink } : undefined}
                />
                {label}
              </button>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="ghost"
            isPending={remove.isPending}
            className="bg-destructive/10 text-destructive hover:bg-destructive/20"
            onClick={() => void confirm()}
          >
            Supprimer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
