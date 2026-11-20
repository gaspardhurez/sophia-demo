import { Check, ChevronRight, GripVertical, List, X } from 'lucide-react'
import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react'

import type { DomainColorClasses, DomainColorValues } from '@/entities/domain'
import {
  currentStep,
  type Project,
  stepIssue,
  useSetProjectSequence,
} from '@/entities/project'
import {
  buildSkillTree,
  type SkillNode,
  useDomainsSkills,
} from '@/entities/skill'
import { ApiError } from '@/shared/api'
import { toDateISO } from '@/shared/lib/date'
import { cn } from '@/shared/lib/utils'
import { toast } from '@/shared/ui'

import { Crans, PHASES } from './plan-skills'
import { periodOf } from './plan-step'

/** La clé d'un segment : l'id de l'étape, ou la séquence à plat. */
const FLAT = '__flat__'
type Arrangement = { segments: { key: string; ids: string[] }[]; bac: string[] }

/**
 * La séquence en édition (design #27, `prod/Savoirs`) : le bac « Hors
 * séquence » à gauche, les étapes à droite, chaque savoir se glisse — d'une
 * place à l'autre, d'une étape à l'autre, ou retour au bac. L'écran se range
 * tout de suite ; la séquence part d'un bloc au serveur. Un groupe du bac se
 * glisse aussi, par la poignée qui paraît au survol de son titre : il emmène
 * tous ses savoirs encore au bac.
 */
export function SequenceEdit({
  project,
  color,
  values,
  emoji,
  dimmed,
}: {
  project: Project
  color: DomainColorClasses
  values: DomainColorValues
  emoji?: string | null
  /** Le mode rattachement de la carte au-dessus l'estompe. */
  dimmed: boolean
}) {
  const write = useSetProjectSequence()
  const { data: skills } = useDomainsSkills(project.domain_ids)
  const today = toDateISO(new Date())
  const steps = useMemo(
    () => [...project.steps].sort((a, b) => a.order - b.order),
    [project.steps],
  )
  const learning = useMemo(
    () => new Map(project.learning.map((s) => [s.skill_id, s])),
    [project.learning],
  )

  // L'arrangement tel que le serveur le connaît.
  const server = useMemo<Arrangement>(() => {
    const ranked = project.learning
      .filter((s) => s.position !== null)
      .sort((a, b) => a.position! - b.position!)
    const segments = steps.length
      ? steps.map((st) => ({
          key: st.id,
          ids: ranked
            .filter((s) => st.skill_ids.includes(s.skill_id))
            .map((s) => s.skill_id),
        }))
      : [{ key: FLAT, ids: ranked.map((s) => s.skill_id) }]
    const bac = project.learning
      .filter((s) => s.position === null)
      .map((s) => s.skill_id)
    return { segments, bac }
  }, [project.learning, steps])
  const [arr, setArr] = useState(server)
  useEffect(() => setArr(server), [server])

  // Ce qu'on glisse : un savoir, ou tous ceux d'un groupe du bac.
  const [drag, setDrag] = useState<string[] | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const current = currentStep(project, today)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const isOpen = (key: string) =>
    open[key] ?? (key === FLAT || key === current?.id)
  const spring = useRef<ReturnType<typeof setTimeout>>(undefined)

  function move(ids: string[], dest: { key: string | null; index: number }) {
    const next: Arrangement = {
      segments: arr.segments.map((s) => ({
        ...s,
        ids: s.ids.filter((x) => !ids.includes(x)),
      })),
      bac: arr.bac.filter((x) => !ids.includes(x)),
    }
    if (dest.key === null) next.bac.push(...ids)
    else {
      const seg = next.segments.find((s) => s.key === dest.key)!
      // L'index a été pris avant le retrait : corriger si on descend dans la même étape.
      const before = arr.segments.find((s) => s.key === dest.key)!.ids
      const i =
        dest.index -
        before.slice(0, dest.index).filter((x) => ids.includes(x)).length
      seg.ids.splice(Math.max(0, Math.min(i, seg.ids.length)), 0, ...ids)
    }
    setArr(next)
    setDrag(null)
    setOver(null)
    write
      .mutateAsync({
        projectId: project.id,
        segments: next.segments.map((s) => ({
          step_id: s.key === FLAT ? null : s.key,
          skill_ids: s.ids,
        })),
      })
      .catch((err) => {
        setArr(server)
        toast.error(
          err instanceof ApiError ? err.message : 'Le rangement a échoué',
        )
      })
  }

  const overKey = (key: string) => (e: DragEvent) => {
    e.preventDefault()
    if (over !== key) setOver(key)
  }
  const start = (ids: string[]) => (e: DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', ids.join(','))
    setDrag(ids)
  }
  const end = () => {
    setDrag(null)
    setOver(null)
  }

  // Le bac, regroupé par parent, dans l'ordre de l'arbre (groupes et savoirs).
  // Un savoir sans parent est une branche : il se range sous son propre nom.
  const groups = useMemo(() => {
    const name = new Map((skills ?? []).map((s) => [s.id, s]))
    const rankOf = new Map<string, number>()
    const walk = (l: SkillNode[]) =>
      l.forEach((n) => {
        rankOf.set(n.id, rankOf.size)
        walk(n.children)
      })
    walk(buildSkillTree(skills ?? []))
    const last = Number.MAX_SAFE_INTEGER
    const out: { title: string; ids: string[] }[] = []
    for (const id of [...arr.bac].sort(
      (a, b) => (rankOf.get(a) ?? last) - (rankOf.get(b) ?? last),
    )) {
      const parent = name.get(id)?.parent_skill_id
      const title =
        (parent ? name.get(parent)?.name : name.get(id)?.name) ??
        learning.get(id)?.name ??
        ''
      let g = out.find((x) => x.title === title)
      if (!g) out.push((g = { title, ids: [] }))
      g.ids.push(id)
    }
    return out
  }, [arr.bac, skills, learning])

  let rank = 0
  const empty = arr.bac.length === 0 && !drag

  return (
    <div
      className={cn(
        'flex items-stretch overflow-hidden rounded-b-xl border bg-card shadow-xs transition-opacity duration-200',
        dimmed && 'opacity-40',
      )}
    >
      <aside
        onDragOver={overKey('bac')}
        onDrop={(e) => {
          e.preventDefault()
          // Un groupe du bac lâché sur le bac n'a pas bougé.
          if (drag && !drag.every((id) => arr.bac.includes(id)))
            move(drag, { key: null, index: 0 })
        }}
        className={cn(
          'flex shrink-0 flex-col gap-3.5 border-r bg-muted/40 px-3.5 py-4 transition-[width,background]',
          empty ? 'w-32' : 'w-[236px]',
          drag && 'outline-[1.5px] -outline-offset-[1.5px] outline-dashed',
        )}
        style={
          drag
            ? {
                outlineColor: over === 'bac' ? values.ink : values.bord,
                background: over === 'bac' ? values.soft : undefined,
              }
            : undefined
        }
      >
        <div className="flex items-baseline justify-between">
          <span className="font-heading text-[13px] font-semibold">
            Hors séquence
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {arr.bac.length}
          </span>
        </div>
        {groups.map((g) => (
          <div key={g.title} className="flex flex-col gap-1.5">
            {/* Au survol du titre, une poignée glisse à sa gauche : c'est
                elle qui emmène le groupe. */}
            <div className="group/head flex items-center">
              <span
                draggable
                onDragStart={start(g.ids)}
                onDragEnd={end}
                title="Glisser tout le groupe"
                className={cn(
                  'flex w-0 shrink-0 cursor-grab justify-start overflow-hidden text-muted-foreground opacity-0 transition-[width,opacity] duration-150 group-hover/head:w-3.5 group-hover/head:opacity-100 hover:text-foreground',
                  drag === g.ids && 'w-3.5 opacity-100',
                )}
              >
                <GripVertical className="size-3 shrink-0" />
              </span>
              <span className="text-[10px] font-semibold tracking-[.05em] text-muted-foreground uppercase">
                {g.title}
              </span>
            </div>
            <div className="flex flex-wrap gap-[5px]">
              {g.ids.map((id) => {
                const s = learning.get(id)
                const level = s?.level ?? 0
                return (
                  <span
                    key={id}
                    draggable
                    onDragStart={start([id])}
                    onDragEnd={end}
                    className={cn(
                      'flex h-[26px] max-w-full cursor-grab items-center gap-1.5 overflow-hidden rounded-full border bg-card px-[9px] text-xs whitespace-nowrap hover:border-ring',
                      drag?.includes(id) && 'opacity-35',
                    )}
                  >
                    <GripVertical className="-ml-[3px] size-3 shrink-0 text-muted-foreground opacity-50" />
                    {level > 0 && level < 4 && (
                      <Ring level={level} ink={values.ink} />
                    )}
                    <span className="shrink-0 leading-none">{emoji}</span>
                    <span className="min-w-0 truncate">{s?.name}</span>
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col px-5 pt-1.5 pb-[18px]">
        {arr.segments.map((seg) => {
          const step = steps.find((s) => s.id === seg.key)
          const flat = seg.key === FLAT
          const ouvert = isOpen(seg.key)
          const issue = step ? stepIssue(step, project, today) : null
          const running = step && current?.id === step.id
          const acquired = seg.ids.filter(
            (id) => (learning.get(id)?.level ?? 0) >= 4,
          ).length
          // Le rang court sur toute la séquence : une étape repliée compte
          // ses savoirs même si elle ne les montre pas.
          const base = rank
          rank += seg.ids.length
          return (
            <div
              key={seg.key}
              className={cn('flex flex-col', flat && 'flex-1')}
            >
              {!flat && step && (
                <div
                  onClick={() => setOpen((o) => ({ ...o, [seg.key]: !ouvert }))}
                  onDragEnter={() => {
                    if (!drag || ouvert) return
                    clearTimeout(spring.current)
                    // Pendant un glisser, survoler une étape repliée la déplie.
                    spring.current = setTimeout(
                      () => setOpen((o) => ({ ...o, [seg.key]: true })),
                      500,
                    )
                  }}
                  onDragLeave={() => clearTimeout(spring.current)}
                  onDragOver={overKey(`${seg.key}:head`)}
                  onDrop={(e) => {
                    e.preventDefault()
                    // Déposé sur l'en-tête : au dernier rang de l'étape.
                    if (drag)
                      move(drag, { key: seg.key, index: seg.ids.length })
                  }}
                  className="mt-2 mb-0.5 flex cursor-pointer items-center gap-3 rounded-lg py-1"
                  style={
                    drag && over === `${seg.key}:head`
                      ? {
                          background: values.soft,
                          boxShadow: `inset 0 0 0 1px ${values.bord}`,
                        }
                      : undefined
                  }
                >
                  <span
                    className={cn(
                      'grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums',
                      issue
                        ? cn(
                            'border-[1.5px] border-current bg-card',
                            color.text,
                          )
                        : running
                          ? cn('text-white', color.ink)
                          : 'border bg-muted/40 text-muted-foreground',
                    )}
                  >
                    {issue === 'achieved' ? (
                      <Check className="size-3.5" strokeWidth={3} />
                    ) : issue === 'failed' ? (
                      <X className="size-[13px]" strokeWidth={3} />
                    ) : (
                      step.order
                    )}
                  </span>
                  <ChevronRight
                    strokeWidth={2.5}
                    className={cn(
                      '-ml-1 size-3 shrink-0 text-muted-foreground transition-transform',
                      ouvert && 'rotate-90',
                    )}
                  />
                  <span className="font-heading text-[13px] font-semibold">
                    {step.title}
                  </span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {step.start_at || step.due_at ? periodOf(step) : ''}
                  </span>
                  <span className="ml-auto pr-2 text-xs text-muted-foreground tabular-nums">
                    {acquired} / {seg.ids.length}
                  </span>
                </div>
              )}
              {ouvert && (
                <>
                  {seg.ids.map((id, i) => {
                    const s = learning.get(id)
                    const level = s?.level ?? 0
                    const target =
                      drag && !drag.includes(id) && over === `${seg.key}:${i}`
                    return (
                      <div
                        key={id}
                        draggable
                        onDragStart={start([id])}
                        onDragEnd={end}
                        onDragOver={overKey(`${seg.key}:${i}`)}
                        onDrop={(e) => {
                          e.preventDefault()
                          if (drag) move(drag, { key: seg.key, index: i })
                        }}
                        className={cn(
                          'relative flex min-w-0 gap-1',
                          drag?.includes(id) && 'opacity-35',
                        )}
                      >
                        {target && (
                          <span
                            className="absolute top-[-1px] right-0 left-8 z-[2] h-0.5 rounded-full"
                            style={{ background: values.ink }}
                          />
                        )}
                        <div className="relative flex w-7 shrink-0 justify-center">
                          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
                          <span
                            className="relative mt-[11px] size-[9px] rounded-full"
                            style={
                              level >= 4
                                ? {
                                    background: values.ink,
                                    border: `1.5px solid ${values.ink}`,
                                  }
                                : level > 0
                                  ? {
                                      background: 'var(--color-card)',
                                      border: `2px solid ${values.ink}`,
                                    }
                                  : {
                                      background: 'var(--color-card)',
                                      border: '1px solid var(--color-border)',
                                    }
                            }
                          />
                        </div>
                        <div className="group/row relative flex h-8 min-w-0 flex-1 cursor-grab items-center gap-2 rounded-md pr-2 pl-5 hover:bg-muted">
                          {/* La poignée garde sa place : visible au survol seulement. */}
                          <GripVertical className="absolute top-2.5 left-[5px] size-3 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-50" />
                          <span className="w-[18px] text-right text-[11px] text-muted-foreground tabular-nums">
                            {base + i + 1}
                          </span>
                          <span className="leading-none">{emoji}</span>
                          <span className="min-w-0 flex-1 truncate text-[13px]">
                            {s?.name}
                          </span>
                          <span
                            className={cn(
                              'w-[92px] shrink-0 text-right text-[11px]',
                              level > 0 && level < 4
                                ? cn('font-medium', color.text)
                                : 'text-muted-foreground',
                            )}
                          >
                            {level > 0 && level < 4 ? PHASES[level - 1] : ''}
                          </span>
                          <Crans level={level} color={color} className="w-16" />
                        </div>
                      </div>
                    )
                  })}
                  {/* Sous la liste : sans étapes, tout l'espace restant de
                      la colonne reçoit un savoir au dernier rang, et ne se
                      montre en zone qu'au glisser (design #36). */}
                  <div
                    onDragOver={overKey(`${seg.key}:end`)}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (drag)
                        move(drag, { key: seg.key, index: seg.ids.length })
                    }}
                    className={cn(
                      'relative flex gap-3',
                      flat ? 'flex-1' : 'min-h-3.5',
                    )}
                    style={
                      flat
                        ? {
                            minHeight: drag ? (seg.ids.length ? 72 : 160) : 14,
                          }
                        : undefined
                    }
                  >
                    <div className="relative w-7 shrink-0">
                      {seg.ids.length === 0 && (
                        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border" />
                      )}
                    </div>
                    {!flat &&
                      drag &&
                      over === `${seg.key}:end` &&
                      seg.ids.length > 0 && (
                        <span
                          className="absolute top-1.5 right-0 left-10 h-0.5 rounded-full"
                          style={{ background: values.ink }}
                        />
                      )}
                    {flat && drag && (
                      <span
                        className={cn(
                          'mt-1 flex flex-1 flex-col items-center justify-center gap-2.5 rounded-[10px] border-[1.5px] border-dashed text-[13px] transition-colors duration-100',
                          over !== `${seg.key}:end` &&
                            'border-border text-muted-foreground',
                        )}
                        style={
                          over === `${seg.key}:end`
                            ? {
                                borderColor: values.ink,
                                color: values.ink,
                                background: `color-mix(in oklab, ${values.ink} 6%, transparent)`,
                              }
                            : undefined
                        }
                      >
                        <List className="size-[22px]" strokeWidth={1.8} />
                        Glisser un savoir ici
                      </span>
                    )}
                    {!flat && seg.ids.length === 0 && (
                      <span className="mt-1 flex h-9 flex-1 items-center rounded-md border border-dashed px-3 text-xs text-muted-foreground">
                        Glisser un savoir ici
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** L'anneau d'un savoir ouvert, dans le bac : il se remplit avec sa phase. */
function Ring({ level, ink }: { level: number; ink: string }) {
  const p = (level / 4) * 100
  return (
    <span
      className="size-[15px] shrink-0 rounded-full"
      style={{
        border: `1.5px solid ${ink}`,
        background: `conic-gradient(${ink} ${p}%, var(--color-card) 0)`,
        boxShadow: 'inset 0 0 0 1.5px var(--color-card)',
      }}
    />
  )
}
