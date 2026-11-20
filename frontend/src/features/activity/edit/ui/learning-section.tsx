import { PanelSection, Rule, SectionIconButton } from '@/shared/ui'
import { Sprout } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import {
  type ActivityActSet,
  LevelChip,
  hasFeedback,
  takesFeedback,
} from '@/entities/activity'
import type { DomainColorValues } from '@/entities/domain'
import { currentStep, type Project } from '@/entities/project'
import {
  cycleName,
  pieceKey,
  pieceOfAct,
  piecesCycle,
  piecesOf,
  SkillPieces,
  usePlans,
} from '@/entities/plan'
import { usePracticeItems } from '@/entities/practice'
import { type Skill, useSkills } from '@/entities/skill'
import { toDateISO } from '@/shared/lib/date'

import type { ActDraft } from '../model/acts'
import type { LinkDraft } from '../model/panel'
import { CheckSection } from './check-project-block'
import { FeedbackButton, FeedbackEditor, FeedbackNote } from './pass-feedback'
import { SkillSelector } from './skill-selector'

/**
 * **Apprentissage** (#108, #109, `kit/Panneau activite`, `kit/Pieces savoir`) : les
 * savoirs qui portent une pièce de la séance — et seulement eux : un savoir en
 * cours de la séquence que la séance ne travaille pas n'y a pas de sens, il
 * est suggéré dans le sélecteur —, chacun en pièces — en lecture ce qui est posé, au survol toutes ses
 * pièces par phase ; un clic ajoute ou retire l'acte, le savoir reste déplié
 * (« étude + deux exos » = trois clics).
 *
 * Le « + » au survol du titre (#109) ouvre le sélecteur de savoirs, réduit à
 * ceux qui ont un cycle (pas d'acte sans cycle, #107), le prochain de la
 * séquence en tête. Un savoir ajouté ainsi ne l'est que pour la visite : sans
 * pièce posée, il n'y est plus au retour.
 *
 * Sur une séance faite, chaque passe de Pratique ou de Mise en situation
 * prend son retour (#139, `pass-feedback`).
 *
 * La section n'existe que si une pièce est posée ; sur une occurrence d'un
 * **créneau porté**, elle paraît d'office, sélecteur ouvert tant que rien
 * n'est posé ; sinon « + » de l'en-tête › Apprentissage l'ouvre, sur le
 * sélecteur.
 *
 * À la coche (#182, `variant="check"`) : sous un projet, ses savoirs —
 * ceux qui portent une pièce de la séance (`scope` : ceux du projet) et
 * ses savoirs **en cours** (niveau 1 à 3, avec un cycle), à poser d'un clic ;
 * le titre en petites capitales, sans « + ». Rien à montrer : rien.
 */
export function LearningSection({
  domainId,
  domainLabel,
  colors,
  links,
  projects,
  day,
  acts,
  done,
  onAdd,
  onRemove,
  onFeedback,
  onNavigate,
  adding,
  onDone,
  chipLabel = false,
  variant = 'panel',
  scope,
}: {
  /** Le « + » de l'en-tête a choisi « Apprentissage » : le sélecteur
   *  s'ouvre. */
  adding: boolean
  onDone: () => void
  domainId: string
  domainLabel: { emoji: string; name: string }
  colors: DomainColorValues
  links: LinkDraft[]
  projects: Project[]
  day: string
  acts: ActDraft[]
  /** L'activité est faite : plus d'interro à passer depuis elle (ni avant
   *  son jour). */
  done: boolean
  onAdd: (act: ActivityActSet) => void
  onRemove: (act: ActDraft) => void
  /** Le retour d'une passe (#139) ; résolu une fois enregistré. */
  onFeedback: (
    act: ActDraft,
    level: number | null,
    feedback: string | null,
  ) => Promise<boolean>
  onNavigate: () => void
  /** La chip du retour dit aussi son libellé (« 4/5 · Avec effort ») : la
   *  coche d'une séance (#140). */
  chipLabel?: boolean
  /** La coche (#182) : sous un projet, sans « + ». */
  variant?: 'panel' | 'check'
  /** Les savoirs dont cette section montre les pièces posées (la coche : ceux
   *  de son projet). */
  scope?: (skillId: string) => boolean
}) {
  const check = variant === 'check'
  const { data: skills } = useSkills(domainId || undefined)
  // Les savoirs ajoutés pour la visite, et le sélecteur ouvert.
  const [visit, setVisit] = useState<string[]>([])
  const [picking, setPicking] = useState(false)
  // Le savoir qu'on vient de choisir : ses pièces se déplient.
  const [chosen, setChosen] = useState({ id: '', tick: 0 })

  const projectIds = links.map((l) => l.project_id)
  const projectTitle = (id: string) =>
    projects.find((o) => o.id === id)?.title ?? 'projet'

  // La séquence des projets de la séance, sur l'étape du lien (sinon celle
  // en cours ce jour-là).
  const sequence = useMemo(
    () =>
      links.flatMap((l) => {
        const o = projects.find((x) => x.id === l.project_id)
        if (!o) return []
        const step = o.steps.length
          ? ((l.step_id ? o.steps.find((s) => s.id === l.step_id) : null) ??
            currentStep(o, day))
          : null
        return o.learning.filter(
          (s) =>
            !step ||
            step.skill_ids.length === 0 ||
            step.skill_ids.includes(s.skill_id),
        )
      }),
    [links, projects, day],
  )

  const withCycle = (id: string) =>
    skills?.find((s) => s.id === id)?.has_cycle ?? false

  const listed = (() => {
    const ids: string[] = []
    const add = (id: string) => {
      if (!ids.includes(id) && (!scope || scope(id))) ids.push(id)
    }
    // Dans l'ordre de la séquence ; hors séquence, après, dans l'ordre posé.
    // À la coche, les savoirs en cours de la séquence y sont aussi.
    for (const s of sequence)
      if (
        acts.some((a) => a.skill_id === s.skill_id) ||
        (check && s.level >= 1 && s.level <= 3 && withCycle(s.skill_id))
      )
        add(s.skill_id)
    for (const a of acts) add(a.skill_id)
    for (const id of visit) add(id)
    return ids
  })()
  const next = sequence.find(
    (s) => !listed.includes(s.skill_id) && s.level < 4 && withCycle(s.skill_id),
  )

  // « Passer l'interro » : le jour de la séance ou après, jamais en
  // anticipation ; plus sur une séance faite.
  const recallOpen = !done && day !== '' && day <= toDateISO(new Date())

  // « Apprentissage » dans le « + » de l'en-tête ouvre le sélecteur, comme le
  // « + » de la section.
  const choosing = picking || adding
  const shown = check
    ? listed.length > 0
    : acts.length > 0 || choosing || visit.length > 0
  if (!shown || !domainId) return null

  const visitSkill = (id: string) => {
    setVisit((v) => (v.includes(id) ? v : [...v, id]))
    setChosen((c) => ({ id, tick: c.tick + 1 }))
    setPicking(false)
    onDone()
  }
  const closePicker = () => {
    setPicking(false)
    onDone()
  }

  const rows = listed.map((id) => {
    const skill = skills?.find((s) => s.id === id)
    if (!skill) return null
    return (
      <div key={id} className={check ? 'py-[3px]' : 'px-2 py-[5px]'}>
        <SkillRow
          skill={skill}
          acts={acts.filter((a) => a.skill_id === id)}
          projectIds={projectIds}
          projectTitle={projectTitle}
          colors={colors}
          domainEmoji={domainLabel.emoji}
          recallOpen={recallOpen}
          done={done}
          onFeedback={onFeedback}
          chipLabel={chipLabel}
          unfold={chosen.id === id ? chosen.tick : 0}
          day={day}
          onAdd={onAdd}
          onRemove={onRemove}
          onNavigate={onNavigate}
        />
      </div>
    )
  })

  if (check) return <CheckSection title="Apprentissage">{rows}</CheckSection>

  return (
    <>
      <Rule />
      <PanelSection
        icon={Sprout}
        title="Apprentissage"
        open={choosing}
        action={
          <SectionIconButton
            label="Ajouter un savoir"
            active={choosing}
            onClick={() => (choosing ? closePicker() : setPicking(true))}
          />
        }
        onDismiss={choosing ? closePicker : undefined}
      >
        {rows}
        {choosing && (
          <div className="mx-2 mb-1.5">
            <SkillSelector
              skills={skills ?? []}
              links={links}
              projects={projects}
              domainLabel={domainLabel}
              day={day}
              value={null}
              colors={colors}
              allowed={withCycle}
              first={next?.skill_id}
              onChoose={visitSkill}
            />
          </div>
        )}
      </PanelSection>
    </>
  )
}

/** Un savoir de la séance, en pièces. */
function SkillRow({
  skill,
  acts,
  projectIds,
  projectTitle,
  colors,
  domainEmoji,
  recallOpen,
  done,
  onFeedback,
  chipLabel,
  unfold,
  day,
  onAdd,
  onRemove,
  onNavigate,
}: {
  skill: Skill
  acts: ActDraft[]
  projectIds: string[]
  projectTitle: (id: string) => string
  colors: DomainColorValues
  domainEmoji: string
  /** « Passer l'interro » se propose : le jour de la séance ou après, et
   *  séance pas faite. */
  recallOpen: boolean
  /** La séance est faite : ses passes prennent un retour (#139). */
  done: boolean
  onFeedback: (
    act: ActDraft,
    level: number | null,
    feedback: string | null,
  ) => Promise<boolean>
  chipLabel: boolean
  unfold: number
  /** Le jour de la séance : l'interro n'y est « Dû » qu'échue ce jour-là. */
  day: string
  onAdd: (act: ActivityActSet) => void
  onRemove: (act: ActDraft) => void
  onNavigate: () => void
}) {
  const navigate = useNavigate()
  const { data: plans } = usePlans(skill.id)
  const { data: items } = usePracticeItems(skill.id)
  // Le cycle de ce qui est posé, sinon celui dont le savoir tire ses pièces.
  const posedPlan = acts.find((a) => a.plan_id)?.plan_id
  const plan =
    plans?.find((p) => p.id === posedPlan) ??
    (plans ? piecesCycle(plans, projectIds) : null)

  const pieces = useMemo(() => {
    const out = plan ? piecesOf(plan, items ?? [], domainEmoji) : []
    // Ce qui est posé mais n'est plus une pièce du cycle (un objet sorti de
    // la rampe, un acte d'avant) reste lisible et se retire.
    for (const a of acts) {
      const key = pieceKey(a)
      if (out.some((p) => p.key === key)) continue
      out.push(pieceOfAct(a, domainEmoji))
    }
    return out
  }, [plan, items, acts, domainEmoji])

  // Les ↗ mènent dans l'app, comme ceux d'avant : le panneau se ferme.
  const go = (to: string) => {
    onNavigate()
    navigate(to)
  }

  // La passe dont le retour est en saisie, et son enregistrement.
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const byKey = new Map(acts.map((a) => [pieceKey(a), a]))
  // Un acte de pratique, sur une séance faite, prend un retour.
  const rated = (key: string) => {
    const act = byKey.get(key)
    return done && act && takesFeedback(act) ? act : null
  }
  const save = async (
    act: ActDraft,
    level: number | null,
    feedback: string,
  ) => {
    setSaving(true)
    const ok = await onFeedback(act, level, feedback.trim() || null)
    setSaving(false)
    if (ok) setEditing(null)
  }
  const posed = new Map<string, true>(
    [...byKey.keys()].map((k) => [k, true] as const),
  )

  return (
    <SkillPieces
      mode="panel"
      name={skill.name}
      cycle={
        plan && plans
          ? `${cycleName(plan, plans, projectTitle)} · ${plan.state === 'draft' ? 'prévu' : 'en cours'}`
          : ''
      }
      planned={plan?.state === 'draft'}
      level={skill.level}
      pieces={pieces}
      posed={posed}
      colors={colors}
      dueBy={day ? new Date(`${day}T00:00:00`) : undefined}
      unfold={unfold}
      onOpenSkill={() =>
        go(`/skills/${skill.id}${plan ? `?cycle=${plan.id}` : ''}`)
      }
      pieceLink={(p) => {
        if (p.act.kind === 'study')
          return {
            label: 'Ouvrir les notes',
            open: () => go(`/skills/${skill.id}/notes`),
          }
        if (p.act.practice_item_id)
          return {
            label: "Ouvrir l'exercice",
            open: () =>
              go(
                `/skills/${skill.id}?cycle=${p.act.plan_id ?? 'savoir'}&objet=${p.act.practice_item_id}`,
              ),
          }
        return null
      }}
      onPick={(p) => {
        const act = byKey.get(p.key)
        if (act) onRemove(act)
        else onAdd(p.act)
      }}
      foldOnName
      afterTitle={(p) => {
        const act = rated(p.key)
        return act && !hasFeedback(act) && editing !== p.key ? (
          <FeedbackButton onClick={() => setEditing(p.key)} />
        ) : null
      }}
      lineEnd={(p) => {
        const act = rated(p.key)
        return act?.level && editing !== p.key ? (
          <LevelChip level={act.level} withLabel={chipLabel} />
        ) : null
      }}
      onRead={(p) => {
        const act = rated(p.key)
        return act && hasFeedback(act) && editing !== p.key
          ? () => setEditing(p.key)
          : undefined
      }}
      below={(p) => {
        const act = rated(p.key)
        if (act) {
          if (editing === p.key)
            return (
              <FeedbackEditor
                level={act.level ?? null}
                feedback={act.feedback ?? null}
                pending={saving}
                onCancel={() => setEditing(null)}
                onSave={(level, feedback) => void save(act, level, feedback)}
              />
            )
          return act.feedback ? <FeedbackNote text={act.feedback} /> : null
        }
        if (p.act.kind !== 'recall') return null
        // Passée, l'interro le dit : la séance qui la porte peut rester à
        // faire (20/10/2026), le bouton n'a plus lieu d'être.
        if (byKey.get(p.key)?.passed_on)
          return (
            <span className="mt-1 mb-0.5 block text-center text-xs text-muted-foreground">
              Interro passée
            </span>
          )
        return p.act.plan_id && recallOpen ? (
          <Link
            to={`/plans/${p.act.plan_id}/interro`}
            onClick={onNavigate}
            className="mt-1 mb-0.5 grid h-[30px] place-items-center rounded-[7px] bg-foreground text-xs font-semibold text-background"
          >
            Passer l'interro
          </Link>
        ) : null
      }}
    />
  )
}
