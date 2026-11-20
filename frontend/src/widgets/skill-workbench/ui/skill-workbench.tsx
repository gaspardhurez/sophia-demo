import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  type Activity,
  copyOf,
  isPendingRecall,
  LevelChip,
  useActivities,
  useCreateActivity,
  useSetActFeedback,
} from '@/entities/activity'
import { useActivityTypes } from '@/entities/activity-type'
import {
  type Domain,
  domainColor,
  domainColorValues,
  useDomains,
} from '@/entities/domain'
import { NotesThumbnail, useNotes } from '@/entities/note'
import type { Project } from '@/entities/project'
import { inDomain } from '@/entities/project'
import {
  type AcquisitionPlan,
  cycleName,
  cycleStage,
  piecesOf,
  PhaseTiles,
  rampOf,
  usePlanTransition,
  useRemovePlanItem,
  useReorderPlanItems,
  useRestartRecall,
  useUpdatePlanItem,
  useValidateStudy,
} from '@/entities/plan'
import type { PracticeItem } from '@/entities/practice'
import {
  useRecallHistory,
  useRecallSession,
  useStartRecall,
} from '@/entities/recall'
import {
  type ExerciseReference,
  type Resource,
  ResourcesSection,
  useResources,
} from '@/entities/resource'
import type { Skill } from '@/entities/skill'
import {
  DeleteActivityDialog,
  useActivityDeletion,
} from '@/features/activity/delete'
import { ActivityPanel, FeedbackEditor } from '@/features/activity/edit'
import { type FixedPiece, PlanActivityDialog } from '@/features/activity/plan'
import { CloseCycleDialog } from '@/features/plan/close-cycle'
import {
  type PickNature,
  SearchOrCreate,
  useComposeRamp,
} from '@/features/plan/compose-ramp'
import { usePlanDraft } from '@/features/plan/edit-plan'
import { useLaunchTest } from '@/features/plan/launch-test'
import {
  PieceSheet,
  pieceSheet,
  type PieceSheetEditor,
} from '@/features/plan/piece-sheet'
import {
  DeleteCycleDialog,
  ReopenCycleDialog,
  UnstartCycleDialog,
} from '@/features/plan/revert-cycle'
import { CycleConflictDialog } from '@/features/plan/start-cycle'
import { PracticeItemEditor } from '@/features/practice/edit-item'
import { NewResourceDialog } from '@/features/resource/create'
import { EditResourceDialog } from '@/features/resource/edit'
import { ApiError } from '@/shared/api'
import { panelPosBeside } from '@/shared/lib/panel-position'
import { cn } from '@/shared/lib/utils'
import { toast } from '@/shared/ui'

import { lastLevels } from '../model/last-levels'
import { CycleForm } from './cycle-form'
import { CycleStageActions, CycleTabs } from './cycle-tabs'
import { SessionsBlock } from './sessions-block'
import { StartCard } from './start-card'

const OPEN_PROJECT = new Set(['todo', 'in_progress'])

/** Les sortes qu'une colonne propose de piocher ou de créer. */
type Nature = 'isolated' | 'situation'

/** Les sortes qu'une rampe propose de piocher ou de créer. */
const NATURES: Record<Nature, PickNature[]> = {
  isolated: ['exo', 'int'],
  situation: ['app'],
}

/** La clé de la pièce interro (`pieceKey`), quand sa courbe est finie. */
const RECALL_KEY = 'recall::'

/**
 * Un cycle d'un savoir (design #136 à #138, #142, #160, `prod/Savoir`) : les
 * onglets des cycles et la ligne de celui-ci, puis deux colonnes — à gauche
 * les phases en tuiles (`PhaseTiles`) puis les séances (`SessionsBlock`), à
 * droite, en 360 px derrière un trait, la colonne Notes (vignette,
 * ressources). Sous 900 px, une seule colonne : tuiles, séances, notes,
 * ressources. Démarrer et Terminer vivent dans la barre des onglets. L'interro se lit et se lance
 * dans la tuile Étude (#157) : Étudier, Lancer l'interro (`useLaunchTest`),
 * Passer l'interro, Valider l'étude sans interro.
 *
 * Un clic sur une pièce ouvre sa **fiche** (`PieceSheet`) — l'interro
 * comprise ; « Modifier » passe la fiche elle-même en édition
 * (`PracticeItemEditor`, #149). Une séance ouvre
 * son panneau à côté d'elle.
 *
 * **Modifier** est le même écran : sous les onglets, le réglage du cycle (nom,
 * niveau, projets) ; les tuiles prennent leur interrupteur, les lignes leur
 * poignée, « garder en rétention » et × ; les séances se masquent, la
 * colonne Notes reste. Le réglage du
 * cycle attend « Enregistrer » ; la rampe (piocher, créer, retirer,
 * réordonner, garder) s'écrit tout de suite — mêmes gestes pour préparer un
 * cycle prévu.
 */
export function SkillWorkbench({
  skill,
  domain,
  plan,
  plans,
  library,
  projects,
  editing,
  onEditingChange,
  onSelect,
  onNew,
  openItemId,
}: {
  skill: Skill
  domain: Domain | undefined
  plan: AcquisitionPlan
  plans: AcquisitionPlan[]
  library: PracticeItem[]
  projects: Project[]
  editing: boolean
  onEditingChange: (editing: boolean) => void
  /** Montrer un autre cycle, ou la vue savoir (`null`). */
  onSelect: (planId: string | null) => void
  /** Ouvrir l'onglet « Nouveau cycle ». */
  onNew: () => void
  /** L'objet dont la fiche s'ouvre à l'arrivée (« Ouvrir l'exercice »
   *  d'un acte, #82). */
  openItemId?: string | null
}) {
  const accent = domainColor(domain?.color)
  const values = domainColorValues(domain?.color)
  const emoji = domain?.emoji ?? ''
  const draft = usePlanDraft(plan)
  const stage = cycleStage(plan)
  const closed = stage === 'acquired' || stage === 'abandoned'
  const notesTo = `/skills/${skill.id}/notes`

  const ramp = useMemo(() => rampOf(plan, library), [plan, library])

  const { data: notes } = useNotes(skill.id)
  const { data: resources } = useResources(skill.id)
  const { data: activities } = useActivities({ skillId: skill.id })
  const { data: history } = useRecallHistory(plan.id)
  const { data: openSession } = useRecallSession(
    plan.recall_session_id ?? undefined,
  )
  const { data: domains } = useDomains()
  const { data: activityTypes } = useActivityTypes()
  const levels = useMemo(
    () => lastLevels(activities ?? [], plan),
    [activities, plan],
  )

  const [newResource, setNewResource] = useState(false)
  const [editedResource, setEditedResource] = useState<Resource | null>(null)
  const updateItem = useUpdatePlanItem()
  const removeItem = useRemovePlanItem()
  const reorder = useReorderPlanItems()
  const validateStudy = useValidateStudy()
  const restartRecall = useRestartRecall()
  const setFeedback = useSetActFeedback()
  const open = usePlanTransition('open')
  const reopen = usePlanTransition('reopen')
  const compose = useComposeRamp(skill.id, plan.id)

  const [closing, setClosing] = useState(false)
  const [conflict, setConflict] = useState<'open' | 'reopen' | null>(null)
  const [reverting, setReverting] = useState<
    'unstart' | 'reopen' | 'delete' | null
  >(null)
  // La fiche ouverte : la clé de sa pièce (`pieceKey`).
  const [sheetKey, setSheetKey] = useState<string | null>(
    openItemId ? `practice:${openItemId}:` : null,
  )
  function openSheet(key: string | null) {
    setSheetEditing(false)
    setSheetKey(key)
  }
  // La fiche ouverte est en Modifier.
  const [sheetEditing, setSheetEditing] = useState(false)
  const [planFor, setPlanFor] = useState<PracticeItem | null>(null)
  // Planifier une pièce sans objet depuis sa fiche : l'interro, ou la pièce
  // générique d'une phase — la séance porte cette pièce, pas l'étude.
  const [planFree, setPlanFree] = useState<FixedPiece | null>(null)
  const startRecall = useStartRecall()
  const navigate = useNavigate()
  // La séance ouverte, et où ancrer son panneau.
  const [session, setSession] = useState<Activity | null>(null)
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 })
  // Le dernier bouton cliqué dans les tuiles (« Lancer l'interro ») : le
  // panneau de la séance créée s'ouvre à côté.
  const anchor = useRef<DOMRect | null>(null)

  const active = plans.find((p) => p.state === 'active' && p.id !== plan.id)
  const titleOf = (id: string) =>
    projects.find((o) => o.id === id)?.title ?? 'Projet'

  const fail = (err: unknown, fallback: string) =>
    toast.error(err instanceof ApiError ? err.message : fallback)

  async function start(mode: 'open' | 'reopen') {
    if (active) return setConflict(mode)
    try {
      await (mode === 'open' ? open : reopen).mutateAsync(plan.id)
    } catch (err) {
      fail(err, 'Le démarrage a échoué')
    }
  }

  /** Passer l'interro : la passation (nouvelle, ou celle qu'on avait
   *  quittée) s'ouvre en plein écran. */
  function takeRecall() {
    startRecall
      .mutateAsync(plan.id)
      .then((s) => navigate(`/interro/${s.id}`))
      .catch((err) => fail(err, "L'interro n'a pas pu s'ouvrir"))
  }

  function patchItem(
    itemId: string,
    body: { in_retention?: boolean; done?: boolean },
  ) {
    updateItem
      .mutateAsync({ planId: plan.id, itemId, body })
      .catch((err) => fail(err, 'La mise à jour a échoué'))
  }

  function remove(itemId: string) {
    removeItem
      .mutateAsync({ planId: plan.id, itemId })
      .catch((err) => fail(err, 'Le retrait a échoué'))
  }

  async function save() {
    if (await draft.save()) onEditingChange(false)
  }

  function cancel() {
    draft.reset()
    onEditingChange(false)
  }

  /** Ouvrir le panneau d'une séance, à gauche de `rect` (l'élément
   *  cliqué) ; sans élément, il garde sa dernière place. */
  function openActivity(a: Activity, rect: DOMRect | null) {
    if (rect) setPanelPos(panelPosBeside(rect, 'left'))
    setSession(a)
  }

  // Le panneau de séance se ferme au clic en dehors — comme au calendrier :
  // hors du panneau et de ce qu'il ouvre (menus, popovers, modales). Viser une
  // autre séance (étiquette, case) n'est pas « à côté » : son clic ouvre la
  // sienne à la place.
  useEffect(() => {
    if (!session) return
    function onDown(e: PointerEvent) {
      const t = e.target as HTMLElement
      if (
        t.closest('[data-activity-ui]') ||
        t.closest('[data-session-open]') ||
        t.closest('[data-radix-popper-content-wrapper]') ||
        t.closest('[role="menu"], [role="dialog"], [role="listbox"]')
      )
        return
      setSession(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [session])

  // Le menu secondaire du panneau (⋯), celui de la semaine de l'accueil :
  // Dupliquer, Supprimer — Copier et Coller supposent une grille où déposer.
  const [menu, setMenu] = useState<{
    a: Activity
    x: number
    y: number
  } | null>(null)
  useEffect(() => {
    if (!session) setMenu(null)
  }, [session])
  const createActivity = useCreateActivity()
  async function duplicateActivity(a: Activity) {
    setMenu(null)
    try {
      await createActivity.mutateAsync(
        copyOf(a, {
          all_day: a.all_day,
          start_at: a.start_at,
          end_at: a.end_at,
        }),
      )
    } catch {
      toast.error('La duplication a échoué')
    }
  }
  const deletion = useActivityDeletion({
    onError: () => toast.error('La suppression a échoué'),
  })
  async function removeActivity(a: Activity) {
    setMenu(null)
    setSession(null)
    await deletion.request(a)
  }

  // --- La fiche ouverte (#137, #138) : la pièce du cycle, ou l'interro dont
  // la courbe est finie (que `piecesOf` ne donne plus).
  const sheetPiece = sheetKey
    ? (piecesOf(plan, library, emoji).find((p) => p.key === sheetKey) ??
      (sheetKey === RECALL_KEY
        ? {
            key: RECALL_KEY,
            phase: 'study' as const,
            emoji: '🧠',
            title: 'Interro',
            generic: false,
            head: false,
            done: plan.recall_finished,
            due: null,
            act: {
              skill_id: plan.skill_id,
              plan_id: plan.id,
              kind: 'recall' as const,
            },
          }
        : null))
    : null
  const sheet = sheetPiece
    ? pieceSheet(sheetPiece, {
        plan,
        activities: activities ?? [],
        ramp,
        history: history ?? [],
        openSession: openSession ?? null,
        domainEmoji: emoji,
      })
    : null
  const sheetItem = sheetPiece?.act.practice_item_id
    ? (ramp.find((i) => i.id === sheetPiece.act.practice_item_id) ?? null)
    : null

  // « Lancer l'interro » (#157) : une nouvelle séance demain ouvre son panneau
  // (la renommer, l'heure), à côté du bouton cliqué.
  const launchTest = useLaunchTest({
    plan,
    domainId: domain?.id,
    domainEmoji: emoji,
    tintClassName: accent.soft,
    onCreated: (a) => openActivity(a, anchor.current),
  })

  // La séance qui porte la prochaine interro, si elle porte autre chose :
  // la ligne Interro la nomme (« jeu. 15 · Tennis »).
  const recallActivity = (activities ?? []).find(
    (a) =>
      isPendingRecall(a) &&
      a.acts.some((x) => x.kind === 'recall' && x.plan_id === plan.id),
  )
  const recallSession =
    recallActivity && recallActivity.acts.some((x) => x.kind !== 'recall')
      ? recallActivity.title
      : null

  function validate() {
    validateStudy
      .mutateAsync(plan.id)
      .catch((err) => fail(err, "L'étude n'a pas pu se valider"))
  }

  // --- Ajouter à une rampe : piocher dans la bibliothèque, ou créer — l'objet
  // arrive en fin de sa rampe (#142 : la création reste « Chercher ou créer »).
  const inRamp = new Set(ramp.map((i) => i.id))
  const candidatesOf = (nature: Nature) =>
    library.filter((i) => i.nature === nature && !inRamp.has(i.id))
  function searchOrCreate(nature: Nature, close: () => void) {
    return (
      <SearchOrCreate
        candidates={candidatesOf(nature)}
        library={library}
        natures={NATURES[nature]}
        accent={accent}
        onPick={(id) => {
          close()
          void compose.pick(id)
        }}
        onCreate={(title, n) => {
          close()
          void compose.create(title, n)
        }}
      />
    )
  }

  // --- Les ressources (#81) : celles des notes du savoir, toutes (plus de
  // choix par cycle, 26/10), puis les références des exercices de la rampe.
  const exerciseRefs: ExerciseReference[] = ramp
    .filter((i) => i.reference)
    .map((i) => ({
      id: i.id,
      emoji: i.emoji || emoji || '•',
      title: i.title,
      reference: i.reference as string,
    }))
  const resourcesSection = (
    <ResourcesSection
      resources={resources ?? []}
      exercises={exerciseRefs}
      onAdd={() => setNewResource(true)}
      onEdit={setEditedResource}
      collapseAfter={5}
    />
  )

  /**
   * La colonne Notes (#136, #157, #160, `prod/Savoir`) : la vignette des
   * notes et les ressources, repliées après cinq ; un cycle prévu y met sa
   * carte de départ à la place des notes (`StartCard`). « Repérer un exercice » est
   * retiré (26/10) : la maquette ne le plaçait plus, « + Exercice » de la
   * tuile Pratique le fait. 360 px trait compris ; sous 900 px elle passe
   * sous les séances, le trait devient horizontal.
   */
  const notesColumn = (
    <div className="flex min-w-0 flex-col gap-3.5 border-l border-border/60 pl-6 max-[900px]:border-t max-[900px]:border-l-0 max-[900px]:pt-6 max-[900px]:pl-0">
      {stage === 'planned' ? (
        // Un cycle prévu : la carte de départ prend la place des notes.
        <StartCard
          emoji={emoji}
          title={
            plan.project_ids.length > 0
              ? `🎯 ${titleOf(plan.project_ids[0])}`
              : plan.name || 'Démarrer quand tu veux'
          }
          ink={values.fonce}
          onStart={() => void start('open')}
        />
      ) : (
        <>
          <span className="font-heading text-sm font-semibold">Notes</span>
          <NotesThumbnail name={skill.name} to={notesTo} notes={notes} />
        </>
      )}
      {resourcesSection}
    </div>
  )

  const tiles = (
    <PhaseTiles
      plan={plan}
      library={library}
      domainEmoji={emoji}
      colors={values}
      levels={levels}
      renderLevel={(level) => <LevelChip level={level} dense />}
      focus={!closed}
      onPiece={(piece) => openSheet(piece.key)}
      onNotes={() => navigate(notesTo)}
      onEditCycle={() => onEditingChange(true)}
      recallSession={recallSession}
      studyActions={
        plan.state === 'active'
          ? {
              onLaunch: launchTest.open,
              onTake: takeRecall,
              takePending: startRecall.isPending,
              onValidate: validate,
              validatePending: validateStudy.isPending,
            }
          : undefined
      }
      edit={
        editing
          ? {
              phases: {
                study: Boolean(draft.value('study')),
                isolated: Boolean(draft.value('isolated')),
                situation: Boolean(draft.value('situation')),
                retention: Boolean(draft.value('retention')),
              },
              onTogglePhase: (key) => draft.patch({ [key]: !draft.value(key) }),
              onReorder: (nature, itemIds) =>
                reorder
                  .mutateAsync({ planId: plan.id, nature, itemIds })
                  .catch((err) => {
                    fail(err, "L'ordre n'a pas été gardé")
                    throw err
                  }),
              onKeep: (itemId, keep) =>
                patchItem(itemId, { in_retention: keep }),
              onRemove: remove,
              candidates: {
                isolated: candidatesOf('isolated'),
                situation: candidatesOf('situation'),
              },
              onAdd: (_nature, itemId) => void compose.pick(itemId),
              renderAdd: searchOrCreate,
              spacing: {
                mode: draft.value('retention_spacing') ?? 'curve',
                intervalDays: draft.value('retention_interval_days') ?? 45,
                onChange: (patch) => draft.patch(patch),
              },
              recallTarget: {
                value: draft.value('recall_target') ?? 3,
                onChange: (recall_target) => draft.patch({ recall_target }),
              },
              switchClassName: accent.ink,
            }
          : undefined
      }
    />
  )

  function renderSheet(editor?: PieceSheetEditor) {
    if (!sheet) return null
    return (
      <PieceSheet
        data={sheet}
        color={domain?.color}
        onClose={() => openSheet(null)}
        onEdit={sheetItem ? () => setSheetEditing(true) : undefined}
        editor={editor}
        onPlan={() => {
          openSheet(null)
          if (sheetItem) setPlanFor(sheetItem)
          else if (sheet.kind === 'recall') setPlanFree('recall')
          else if (
            sheet.kind === 'generic' &&
            (sheet.phase === 'isolated' || sheet.phase === 'situation')
          )
            setPlanFree(sheet.phase)
        }}
        onVerdict={
          sheetItem ? (done) => patchItem(sheetItem.id, { done }) : undefined
        }
        verdictPending={updateItem.isPending}
        onRecall={takeRecall}
        recallPending={startRecall.isPending}
        onRestart={() => restartRecall.mutateAsync(plan.id)}
        feedbackEditor={(pass, close) => (
          <FeedbackEditor
            level={pass.feedback.level}
            feedback={pass.feedback.feedback}
            pending={setFeedback.isPending}
            onCancel={close}
            onSave={(level, feedback) =>
              void setFeedback
                .mutateAsync({
                  id: pass.feedback.activityId,
                  actId: pass.feedback.actId,
                  level,
                  feedback: feedback.trim() || null,
                })
                .then(close)
                .catch((err) => fail(err, "Le retour n'a pas été gardé"))
            }
          />
        )}
      />
    )
  }

  const candidates = projects.filter(
    (o) => inDomain(o, skill.domain_id) && OPEN_PROJECT.has(o.status),
  )

  // En Modifier, l'onglet suit la saisie : nom et projets du brouillon.
  const edited: AcquisitionPlan = {
    ...plan,
    name: draft.value('name') ?? null,
    project_ids: draft.value('project_ids') ?? [],
  }
  const tabs = editing
    ? plans.map((p) => (p.id === plan.id ? edited : p))
    : plans

  return (
    <>
      <CycleTabs
        plans={tabs}
        selected={plan.id}
        projects={projects}
        color={values.base}
        onSelect={onSelect}
        onNew={onNew}
        actions={
          !editing && (
            <CycleStageActions
              plan={plan}
              ink={values.fonce}
              actions={{
                onStart: () => void start('open'),
                onClose: () => setClosing(true),
                onEdit: () => onEditingChange(true),
                onUnstart: () => setReverting('unstart'),
                onReopen: () => setReverting('reopen'),
                onDelete: () => setReverting('delete'),
              }}
            />
          )
        }
      />
      {editing && (
        <CycleForm
          draft={draft}
          closed={closed}
          candidates={candidates}
          projects={projects}
          onCancel={cancel}
          onSave={() => void save()}
        />
      )}

      <div
        className={cn(
          'grid grid-cols-[minmax(0,1fr)_360px] items-start gap-8 p-6 max-[900px]:grid-cols-1',
          editing && 'pb-72',
        )}
      >
        <div className="flex min-w-0 flex-col gap-8">
          <div
            className="min-w-0"
            onClickCapture={(e) => {
              const target = (e.target as Element).closest('button')
              if (target) anchor.current = target.getBoundingClientRect()
            }}
          >
            {tiles}
          </div>
          {!editing && (
            <SessionsBlock
              activities={activities ?? []}
              plan={plan}
              colors={values}
              domainEmoji={emoji}
              onOpenActivity={openActivity}
              onOpenRecall={() => openSheet(RECALL_KEY)}
            />
          )}
        </div>
        {notesColumn}
      </div>

      {launchTest.dialog}

      {closing && (
        <CloseCycleDialog
          plan={plan}
          open
          onOpenChange={setClosing}
          domainEmoji={emoji}
        />
      )}

      {reverting === 'unstart' && (
        <UnstartCycleDialog
          plan={plan}
          onDone={() => setReverting(null)}
          onCancel={() => setReverting(null)}
        />
      )}

      {reverting === 'reopen' && (
        <ReopenCycleDialog
          plan={plan}
          projectTitle={titleOf}
          pending={reopen.isPending}
          onCancel={() => setReverting(null)}
          onConfirm={() => {
            setReverting(null)
            void start('reopen')
          }}
        />
      )}

      {reverting === 'delete' && (
        <DeleteCycleDialog
          plan={plan}
          onDone={() => {
            setReverting(null)
            onSelect(null)
          }}
          onCancel={() => setReverting(null)}
        />
      )}

      {conflict && active && (
        <CycleConflictDialog
          plan={plan}
          active={active}
          activeName={cycleName(active, plans, titleOf)}
          mode={conflict}
          projectTitle={titleOf}
          onDone={(id) => {
            setConflict(null)
            onSelect(id)
          }}
          onCancel={() => setConflict(null)}
        />
      )}

      {sheet &&
        (sheetItem && sheetEditing ? (
          <PracticeItemEditor
            item={sheetItem}
            planId={closed ? undefined : plan.id}
            onDone={() => setSheetEditing(false)}
            onDeleted={() => openSheet(null)}
          >
            {(parts) => renderSheet(parts)}
          </PracticeItemEditor>
        ) : (
          renderSheet()
        ))}

      {session && (
        <ActivityPanel
          key={session.id}
          activity={
            (activities ?? []).find((a) => a.id === session.id) ?? session
          }
          draft={null}
          pos={panelPos}
          domains={domains ?? []}
          projects={projects}
          activityTypes={activityTypes ?? []}
          onClose={() => setSession(null)}
          onMenu={(e) => setMenu({ a: session, x: e.clientX, y: e.clientY })}
        />
      )}

      {menu && (
        <div
          data-activity-ui
          style={{ top: menu.y, left: menu.x }}
          className="fixed z-50 min-w-40 overflow-hidden rounded-lg border border-border bg-popover py-1 text-sm shadow-md"
        >
          <button
            type="button"
            onClick={() => duplicateActivity(menu.a)}
            className="block w-full px-3 py-1.5 text-left hover:bg-muted/60"
          >
            Dupliquer
          </button>
          <button
            type="button"
            onClick={() => removeActivity(menu.a)}
            className="block w-full px-3 py-1.5 text-left text-destructive hover:bg-muted/60"
          >
            Supprimer
          </button>
        </div>
      )}

      <DeleteActivityDialog
        pending={deletion.pending}
        isPending={deletion.isPending}
        onConfirm={deletion.confirm}
        onCancel={deletion.cancel}
      />

      {newResource && (
        <NewResourceDialog
          skillId={skill.id}
          planId={plan.id}
          onClose={() => setNewResource(false)}
        />
      )}
      {editedResource && (
        <EditResourceDialog
          resource={editedResource}
          onClose={() => setEditedResource(null)}
        />
      )}

      {(planFor || planFree) && domain && (
        <PlanActivityDialog
          skillId={skill.id}
          skillName={skill.name}
          domainId={domain.id}
          accent={accent}
          domainEmoji={emoji}
          target={planFor}
          piece={planFree ?? undefined}
          projectIds={plan.project_ids}
          initialDay={
            planFree === 'recall' && plan.recall_next_due_at
              ? new Date(
                  Math.max(
                    Date.now(),
                    new Date(`${plan.recall_next_due_at}T00:00:00`).getTime(),
                  ),
                )
              : undefined
          }
          planId={closed ? undefined : plan.id}
          onOpenChange={(o) => {
            if (o) return
            setPlanFor(null)
            setPlanFree(null)
          }}
        />
      )}
    </>
  )
}
