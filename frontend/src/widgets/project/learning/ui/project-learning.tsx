import { ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { type Activity, actsOfItem, useActivities } from '@/entities/activity'
import { type DomainColorClasses } from '@/entities/domain'
import { type Project } from '@/entities/project'
import { usePracticeItems } from '@/entities/practice'
import { cn } from '@/shared/lib/utils'

import { StartCard } from './start-card'
import { ago, posedAt } from './when'

const PHASES = ['Étude', 'Pratique', 'Mise en situation', 'Rétention'] as const

interface Skill {
  skill_id: string
  name: string
  level: number
  /** Rang dans la séquence ; nul = hors séquence, sans rang. */
  position: number | null
}

/**
 * « En cours d'apprentissage » (design #27) : les savoirs visés qui sont
 * ouverts — ni vierges ni acquis. Une jauge par savoir, les quatre phases du
 * cycle et la phase nommée au bout ; dessous, ce qui est en cours dans cette
 * phase. Aucune action d'acquisition ici : on regarde, on ouvre le savoir.
 *
 * Dans l'ordre de la séquence, rang en tête ; hors séquence, pas de rang.
 * « Premier » ne se dit que d'une séquence : sans elle, on n'invente pas
 * d'ordre.
 *
 * Rien de commencé ni d'acquis (#61) : à la place, la carte de départ, qui
 * commence le premier savoir — ce bloc est le point d'entrée de
 * l'apprentissage.
 */
export function ProjectLearning({
  project,
  color,
  domainEmoji,
  onOpenSkill,
}: {
  project: Project
  color: DomainColorClasses
  domainEmoji?: string | null
  /** Ouvre le savoir sur sa page (la page projet décide où). */
  onOpenSkill: (skillId: string) => void
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const skills: Skill[] = project.learning
  if (skills.length === 0) return null
  if (skills.every((s) => s.level === 0))
    return (
      <StartCard
        projectId={project.id}
        skills={skills}
        color={color}
        domainEmoji={domainEmoji}
      />
    )

  const opened = skills.filter((s) => s.level > 0 && s.level < 4)
  const acquired = skills.every((s) => s.level === 4)
  const multi = opened.length > 1
  const isOpen = (s: Skill, i: number) =>
    !multi || (open[s.skill_id] ?? i === 0)
  const first = skills.find((s) => s.position !== null && s.level === 0)
  // Le savoir qu'on ouvre : le déplié, sinon le premier de la séquence.
  const linked = opened.find((s, i) => isOpen(s, i)) ?? first

  return (
    <section
      className={cn(
        'relative shrink-0 overflow-hidden rounded-[10px] border text-foreground',
        color.wash,
      )}
    >
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-0.5">
        <span
          className={cn(
            'text-[11px] font-semibold tracking-[.06em] uppercase',
            color.text,
          )}
        >
          En cours d'apprentissage
        </span>
        {multi && (
          <span
            className={cn(
              'inline-flex h-[18px] items-center rounded-full border-0 px-1.5 text-[11px] font-semibold',
              color.soft,
              color.text,
            )}
          >
            {opened.length} savoirs
          </span>
        )}
      </div>

      {opened.map((s, i) => (
        <div key={s.skill_id}>
          {i > 0 && <Rule color={color} />}
          <OpenSkill
            skill={s}
            color={color}
            domainEmoji={domainEmoji}
            detail={isOpen(s, i)}
            onToggle={
              multi
                ? () =>
                    setOpen((prev) => ({
                      ...prev,
                      [s.skill_id]: !isOpen(s, i),
                    }))
                : undefined
            }
          />
        </div>
      ))}

      {opened.length === 0 && (
        <p className={cn('px-3.5 pt-1.5 pb-3 text-[13px]', color.text)}>
          {acquired
            ? `${skills.length} / ${skills.length} savoirs acquis`
            : first
              ? `Premier : ${first.name}`
              : 'Rien de commencé'}
        </p>
      )}

      {/* Le pied reste, lien ou pas : le bloc garde sa forme. */}
      <Rule color={color} />
      <div className="flex min-h-9 items-center px-3.5 py-2">
        {!acquired && linked && (
          <button
            type="button"
            onClick={() => onOpenSkill(linked.skill_id)}
            className={cn('ml-auto text-xs hover:underline', color.text)}
          >
            Ouvrir le savoir ↗
          </button>
        )}
      </div>
    </section>
  )
}

/** Séparateur dans la teinte : la base à 20 %, le bord doux du bloc. */
function Rule({ color }: { color: DomainColorClasses }) {
  return <div aria-hidden className={cn('border-t', color.rule)} />
}

function OpenSkill({
  skill,
  color,
  domainEmoji,
  detail,
  onToggle,
}: {
  skill: Skill
  color: DomainColorClasses
  domainEmoji?: string | null
  detail: boolean
  onToggle?: () => void
}) {
  const phase = skill.level - 1
  return (
    <div className="grid gap-2.5 px-3.5 pt-2.5 pb-3">
      <div className="grid gap-1.5">
        <div
          onClick={onToggle}
          className={cn(
            'flex min-w-0 items-baseline gap-2',
            onToggle && 'cursor-pointer',
          )}
        >
          {onToggle && (
            <ChevronRight
              className={cn(
                'size-3 shrink-0 self-center transition-transform',
                color.text,
                detail && 'rotate-90',
              )}
            />
          )}
          {/* La case du rang reste, vide hors séquence : les noms
              s'alignent. */}
          <span
            className={cn(
              'min-w-4 shrink-0 text-[11px] tabular-nums opacity-75',
              color.text,
            )}
          >
            {skill.position}
          </span>
          <span className="min-w-0 flex-1 truncate font-semibold">
            {skill.name}
          </span>
          {!detail && (
            <span className={cn('shrink-0 text-xs', color.text)}>
              {PHASES[phase]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 pl-6">
          <span className="flex flex-1 gap-[3px]">
            {PHASES.map((p, j) => (
              <span
                key={p}
                title={p}
                className={cn(
                  'h-[5px] flex-1 rounded-[2px]',
                  j < phase
                    ? color.ink
                    : j === phase
                      ? color.dot
                      : cn(color.dot, 'opacity-20'),
                )}
              />
            ))}
          </span>
          {detail && (
            <span
              className={cn(
                'min-w-[74px] shrink-0 text-right text-xs font-semibold',
                color.text,
              )}
            >
              {PHASES[phase]}
            </span>
          )}
        </div>
      </div>
      {detail && (
        <PhaseObjects
          skill={skill}
          phase={phase}
          color={color}
          domainEmoji={domainEmoji}
        />
      )}
    </div>
  )
}

/** Une carte d'objet : badge emoji, titre, une ligne de repères. */
interface Thing {
  key: string
  emoji: string
  title: string
  meta: string
  word?: string
}

/**
 * Ce qui est en cours dans la phase : les notes à l'étude ; en pratique chaque
 * exercice qui a des activités, dans l'ordre de la rampe ; en application la
 * mise en situation et le mot de sa dernière passe.
 */
function PhaseObjects({
  skill,
  phase,
  color,
  domainEmoji,
}: {
  skill: Skill
  phase: number
  color: DomainColorClasses
  domainEmoji?: string | null
}) {
  const { data: activities } = useActivities({ skillId: skill.skill_id })
  const { data: items } = usePracticeItems(skill.skill_id)
  const all = activities ?? []
  const emoji = domainEmoji ?? '🎯'

  let things: Thing[] = []
  if (phase === 0) {
    const study = all.filter((a) =>
      a.acts.some((x) => x.skill_id === skill.skill_id && x.kind === 'study'),
    )
    things = [
      {
        key: 'notes',
        emoji: '📝',
        title: `Notes — ${skill.name}`,
        meta: timeline(study, false),
      },
    ]
  } else {
    const nature = phase === 1 ? 'isolated' : 'situation'
    things = (items ?? [])
      .filter((it) => it.nature === nature)
      .flatMap((it) => {
        const mine = all.filter((a) => actsOfItem(a, it.id).length > 0)
        if (mine.length === 0) return []
        const word = [...mine]
          .filter((a) => a.done && a.notes)
          .sort((a, b) =>
            (b.start_at ?? '').localeCompare(a.start_at ?? ''),
          )[0]?.notes
        return [
          {
            key: it.id,
            emoji: it.emoji || emoji,
            title: it.title,
            meta: timeline(mine, phase === 1),
            word: phase === 2 ? (word ?? undefined) : undefined,
          },
        ]
      })
  }

  if (things.length === 0)
    return (
      <p className="text-xs text-muted-foreground">
        Rien de posé dans cette phase.
      </p>
    )

  return (
    <div className="grid gap-1.5">
      {things.map((t) => (
        <div key={t.key} className="grid gap-1.5">
          <div className="flex min-w-0 items-center gap-3 rounded-[9px] border border-transparent bg-card/65 px-4 py-3">
            <span
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-[7px] border-0 text-sm',
                color.soft,
              )}
            >
              {t.emoji}
            </span>
            <span className="grid min-w-0 flex-1 gap-px">
              <span className="text-[13px] font-medium text-pretty">
                {t.title}
              </span>
              <span className="text-[11px] leading-[1.4] text-pretty text-muted-foreground tabular-nums">
                {t.meta}
              </span>
            </span>
          </div>
          {t.word && (
            <p className="-mt-0.5 ml-3.5 text-xs leading-[1.45] text-pretty text-foreground/70 italic">
              « {t.word} »
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

/** « 3 passes · dernière il y a 3 j · posée demain 18:00 ». */
function timeline(list: Activity[], passes: boolean): string {
  const done = list
    .filter((a) => a.done && a.start_at)
    .sort((a, b) => b.start_at!.localeCompare(a.start_at!))
  const now = new Date().toISOString()
  const next = list
    .filter((a) => !a.done && a.start_at && a.start_at >= now)
    .sort((a, b) => a.start_at!.localeCompare(b.start_at!))[0]
  const parts: string[] = []
  if (passes && done.length > 0) parts.push(`${done.length} fois`)
  if (done[0])
    parts.push(`${passes ? 'dernière' : 'Dernière'} ${ago(done[0].start_at!)}`)
  if (next) parts.push(`posée ${posedAt(next.start_at!)}`)
  const line = parts.join(' · ')
  if (!line) return 'Rien de posé'
  return line.charAt(0).toUpperCase() + line.slice(1)
}
