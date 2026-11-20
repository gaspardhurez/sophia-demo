import { useMemo, useState } from 'react'

import type { Activity, ActivityAct } from '@/entities/activity'
import type { Domain, DomainColorValues } from '@/entities/domain'
import type { Project } from '@/entities/project'
import {
  type Piece,
  pieceKey,
  pieceOfAct,
  piecesCycle,
  piecesOf,
  SkillPieces,
  usePlans,
} from '@/entities/plan'
import { usePracticeItems } from '@/entities/practice'
import type { PreparationProject } from '@/entities/preparation'
import { useDomainsSkills } from '@/entities/skill'
import { SkillSelector } from '@/features/activity/edit'
import { fmtTime } from '@/shared/lib/date'
import { cn } from '@/shared/lib/utils'

import { actKey } from '../model/arm'
import { usePreparation } from '../model/context'
import { dayLabel } from '../model/format'
import { DashedButton, FocusSection, LevelGauge } from './bits'

/** Un savoir de la section : son nom, son niveau, le cycle du projet. */
interface SkillLine {
  skillId: string
  name: string
  level: number
  planId: string | null
}

/**
 * L'**apprentissage de la semaine prochaine** (#108, `prod/Preparation de la
 * semaine`, `kit/Pieces savoir`) : les savoirs en cours du projet, et ceux
 * qui ont une pièce posée sur une séance de la semaine, chacun en pièces — en
 * lecture ce qui est posé (et son jour), au survol toutes ses pièces par
 * phase.
 *
 * Un clic sur une pièce arme l'aimant (#92 : Maj-clic pour plusieurs
 * séances) ; le savoir se replie et la pièce armée reste visible, cerclée.
 * Survoler une pièce posée met sa séance en avant au calendrier.
 *
 * En pied, « + *prochain savoir de la séquence* » puis « + Autre savoir »
 * (la séquence du projet, réduite aux savoirs qui ont un cycle). Un savoir
 * ajouté ainsi ne l'est que pour la visite : sans pièce posée, il n'y est plus
 * au retour.
 */
export function NextLearning({
  prep,
  project,
  projects,
  domain,
  colors,
  domainEmoji,
}: {
  prep: PreparationProject
  project: Project
  projects: Project[]
  domain: Domain | undefined
  colors: DomainColorValues
  domainEmoji: string
}) {
  const { weekKey } = usePreparation()
  const { data: skills } = useDomainsSkills(project.domain_ids)
  const [visit, setVisit] = useState<string[]>([])
  const [picking, setPicking] = useState(false)

  const learning = prep.past.learning
  // Les savoirs de l'étape de la semaine prochaine (nul : ceux du projet).
  const scope = prep.next.skill_ids
  const lines = useMemo(() => {
    const out: SkillLine[] = []
    const add = (skillId: string, planId: string | null) => {
      if (out.some((g) => g.skillId === skillId)) return
      const entry = learning.find((s) => s.skill_id === skillId)
      out.push({
        skillId,
        name:
          entry?.name ??
          skills?.find((s) => s.id === skillId)?.name ??
          'Savoir',
        level:
          entry?.level ?? skills?.find((s) => s.id === skillId)?.level ?? 0,
        planId: entry?.plan_id ?? planId,
      })
    }
    for (const s of learning)
      if (
        inScope(scope, s.skill_id) &&
        s.level >= 1 &&
        s.level <= 3 &&
        s.plan_id
      )
        add(s.skill_id, s.plan_id)
    for (const { act } of prep.next.acts) add(act.skill_id, act.plan_id)
    for (const id of visit) add(id, null)
    return out
  }, [learning, prep.next.acts, visit, skills, scope])

  const listed = lines.map((l) => l.skillId)
  const withCycle = (id: string) =>
    skills?.find((s) => s.id === id)?.has_cycle ?? false
  // Le prochain savoir de la séquence pas encore listé, ni acquis, qui a un
  // cycle — celui de l'étape en cours d'abord.
  const next = useMemo(() => {
    const open = learning.filter(
      (s) =>
        s.level < 4 && !listed.includes(s.skill_id) && withCycle(s.skill_id),
    )
    const byRank = (xs: typeof open) =>
      [...xs].sort(
        (a, b) =>
          (a.position ?? Number.POSITIVE_INFINITY) -
          (b.position ?? Number.POSITIVE_INFINITY),
      )[0]
    return (
      byRank(open.filter((s) => inScope(scope, s.skill_id))) ??
      byRank(open) ??
      null
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learning, listed.join(), skills, scope])

  // « n posées » : les pièces distinctes posées sur les séances.
  const posedCount = new Set(
    prep.next.acts.map(({ act }) => `${act.skill_id}:${pieceKey(act)}`),
  ).size

  // Le savoir qu'on vient de choisir : ses pièces se déplient.
  const [chosen, setChosen] = useState({ id: '', tick: 0 })
  const visitSkill = (id: string) => {
    setVisit((v) => (v.includes(id) ? v : [...v, id]))
    setChosen((c) => ({ id, tick: c.tick + 1 }))
    setPicking(false)
  }

  // Aucun savoir lié au projet : rien à préparer, la section disparaît.
  if (learning.length === 0 && lines.length === 0) return null
  return (
    <FocusSection
      title="Apprentissage"
      aside={
        posedCount > 0
          ? `${posedCount} posée${posedCount > 1 ? 's' : ''}`
          : undefined
      }
    >
      <div className="flex flex-col gap-3.5">
        {lines.map((line) => (
          <SkillLineView
            key={line.skillId}
            line={line}
            prep={prep}
            project={project}
            colors={colors}
            domainEmoji={domainEmoji}
            unfold={chosen.id === line.skillId ? chosen.tick : 0}
          />
        ))}
        {lines.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun savoir en cours</p>
        )}
        <div data-arm-source className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {next && (
              <DashedButton onClick={() => visitSkill(next.skill_id)}>
                + {next.name}
              </DashedButton>
            )}
            <DashedButton
              className={cn(picking && 'border-solid bg-muted')}
              onClick={() => setPicking((v) => !v)}
            >
              + Autre savoir
            </DashedButton>
          </div>
          {picking && (
            <SkillSelector
              skills={skills ?? []}
              links={[]}
              only={{ project_id: project.id, step_id: prep.next.step_id }}
              projects={projects}
              domainLabel={{
                emoji: domain?.emoji ?? '',
                name: domain?.name ?? '',
              }}
              day={weekKey}
              value={null}
              colors={colors}
              allowed={withCycle}
              onChoose={visitSkill}
            />
          )}
        </div>
      </div>
    </FocusSection>
  )
}

/** « lun. 12 · 19:00 » (« +1 » au-delà d'une séance). */
function whenLabel(sessions: Activity[]): string {
  const first = sessions[0]
  if (!first?.start_at) return 'à placer'
  const day = dayLabel(new Date(first.start_at))
  const time = first.all_day ? '' : ` · ${fmtTime(first.start_at)}`
  const more = sessions.length > 1 ? ` +${sessions.length - 1}` : ''
  return `${day}${time}${more}`
}

/** Un savoir de la section, en pièces. */
function SkillLineView({
  line,
  prep,
  project,
  colors,
  domainEmoji,
  unfold,
}: {
  line: SkillLine
  prep: PreparationProject
  project: Project
  colors: DomainColorValues
  domainEmoji: string
  unfold: number
}) {
  const { weeks, arm, hover } = usePreparation()
  const { data: plans } = usePlans(line.skillId)
  const { data: library } = usePracticeItems(line.skillId)

  // Ce qui est posé sur les séances de la semaine, par pièce.
  const posedActs = useMemo(() => {
    const out = new Map<string, { act: ActivityAct; sessions: Activity[] }>()
    for (const { activity_id, act } of prep.next.acts) {
      if (act.skill_id !== line.skillId) continue
      const key = pieceKey(act)
      const entry = out.get(key) ?? { act, sessions: [] }
      const session = prep.next.activities.find((a) => a.id === activity_id)
      if (session && !entry.sessions.some((s) => s.id === session.id))
        entry.sessions.push(session)
      out.set(key, entry)
    }
    for (const e of out.values())
      e.sessions.sort((a, b) =>
        (a.start_at ?? '').localeCompare(b.start_at ?? ''),
      )
    return out
  }, [prep, line.skillId])

  const posedPlan = [...posedActs.values()].find((e) => e.act.plan_id)?.act
    .plan_id
  const plan =
    plans?.find((p) => p.id === (line.planId ?? posedPlan)) ??
    (plans ? piecesCycle(plans, [project.id]) : null)

  const pieces = useMemo(() => {
    const all = plan ? piecesOf(plan, library ?? [], domainEmoji) : []
    // L'interro ne se montre que due dans la semaine (ou déjà posée) ; on
    // peut la poser avant son jour.
    const out = all.filter(
      (p) =>
        p.act.kind !== 'recall' ||
        posedActs.has(p.key) ||
        (p.due !== null && p.due < weeks.next.end),
    )
    for (const [key, { act }] of posedActs)
      if (!out.some((p) => p.key === key))
        out.push(pieceOfAct(act, domainEmoji))
    return out
  }, [plan, library, domainEmoji, posedActs, weeks.next.end])

  const posed = new Map<string, string>(
    [...posedActs].map(([k, e]) => [k, whenLabel(e.sessions)]),
  )
  const armed = pieces.find((p) => arm.arm?.key === actKey(p.act))?.key ?? null

  const pick = (p: Piece) =>
    arm.toggle({
      key: actKey(p.act),
      projectId: project.id,
      emoji: p.emoji || '🌱',
      text: p.generic ? `${p.title} · ${line.name}` : p.title,
      subject: { kind: 'act', act: p.act },
    })

  return (
    <div data-arm-source>
      <SkillPieces
        mode="preparation"
        criteria
        name={line.name}
        // Prévu, pas commencé : la chip « Prévu » suffit, pas de jauge (24/10).
        gauge={
          plan?.state === 'draft' ? undefined : (
            <LevelGauge level={line.level} colors={colors} small />
          )
        }
        planned={plan?.state === 'draft'}
        level={line.level}
        pieces={pieces}
        posed={posed}
        armed={armed}
        colors={colors}
        onPick={pick}
        unfold={unfold}
        onHover={(p) =>
          hover((p && posedActs.get(p.key)?.sessions[0]?.id) || null)
        }
      />
    </div>
  )
}

/** Le savoir est-il dans le périmètre de l'étape (nul : tous) ? */
const inScope = (scope: string[] | null, skillId: string) =>
  scope === null || scope.includes(skillId)
