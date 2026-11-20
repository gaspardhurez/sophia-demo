import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { domainColor, domainColorValues, useDomains } from '@/entities/domain'
import { useAllProjects } from '@/entities/project'
import { usePlans } from '@/entities/plan'
import {
  inQueue,
  isWaiting,
  nextUp,
  openAnswerText,
  passageOf,
  type RecallAnswer,
  type RecallSession,
  releaseKey,
  REVISE_FROM_PASSAGE,
  useAnswerRecall,
  useClearRevision,
  useRecallSession,
  useSetRevision,
} from '@/entities/recall'
import { useSkill } from '@/entities/skill'
import { ApiError, isNotFound } from '@/shared/api'
import { toDateISO } from '@/shared/lib/date'
import { useDocumentTitle } from '@/shared/lib/document-title'
import { formatDateShort } from '@/shared/lib/format'
import { Button, Skeleton, SkeletonRegion, toast } from '@/shared/ui'

import { type Leaving, useDeck } from '../model/use-deck'
import { CARD, CardStack } from './card-stack'
import { RecallRail } from './recall-rail'
import { RecallSummary } from './recall-summary'
import { RectoCard } from './recto-card'
import { ResumeCard } from './resume-card'
import { ReviseRow } from './revise-row'
import { VersoCard } from './verso-card'
import { WaitCard } from './wait-card'

type Verdict = { known?: boolean; knownPoints?: string[] }

/**
 * La passation de l'interro d'un cycle (#80, refondue en #103,
 * `prod/Interro`), `/interro/:sessionId` — plein écran, hors de la coque.
 *
 * À gauche le **rail** (une pastille par question, dans l'ordre de la
 * file) ; au centre un **paquet de cartes**. Recto : on répond, puis on
 * retourne (le texte s'enregistre). Verso : on se juge — tout d'un coup pour
 * une réponse libre, élément par élément pour une liste. Un tampon se pose,
 * la carte sort (à droite si sue, sous le paquet sinon) et la suivante
 * monte. Une question ratée attend dix minutes ; un délai échu la pose
 * d'office ; quand il ne reste que des questions en attente, le dos de
 * carte rayé (`WaitCard`). Une passation laissée un autre jour s'ouvre sur
 * « On reprend ». La dernière question sue montre le bilan. × quitte sans
 * confirmation, réponses gardées.
 */
export function RecallPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const { data: session, error } = useRecallSession(sessionId)
  const { data: skill } = useSkill(session?.skill_id)
  const { data: plans } = usePlans(session?.skill_id)
  const { data: domains } = useDomains()
  const { data: projects } = useAllProjects()
  useDocumentTitle(skill ? `Interro — ${skill.name}` : 'Interro')

  const answerRecall = useAnswerRecall()
  const setRevision = useSetRevision()
  const clearRevision = useClearRevision()
  const deck = useDeck()
  // Le texte tapé et les cartes retournées, par passage (`passKey`) : à
  // l'écran seulement, jusqu'à « Retourner » qui enregistre le texte.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [turned, setTurned] = useState<Set<string>>(new Set())
  // Les questions dont on a passé outre le délai, à leur échéance du moment.
  const [released, setReleased] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState(false)
  const [resumed, setResumed] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const plan = plans?.find((p) => p.id === session?.plan_id)
  const domain = domains?.find((d) => d.id === skill?.domain_id)
  const accent = domainColor(domain?.color)
  const values = domainColorValues(domain?.color)

  // L'heure avance chaque seconde tant qu'une question attend : chronos du
  // rail, attente, délai qui échoit et pose la question d'office.
  const ticking =
    session != null &&
    session.finished_at == null &&
    session.answers.some((a) => isWaiting(a, now, released))
  useEffect(() => {
    if (!ticking) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [ticking])
  // Revenue des notes (autre onglet), la passation se relit : l'heure aussi.
  useEffect(() => {
    const onFocus = () => setNow(Date.now())
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const back = session
    ? `/skills/${session.skill_id}?cycle=${session.plan_id}`
    : '/learning'
  const known = session ? session.answers.filter((a) => a.known).length : 0

  const quit = useCallback(
    async (current: RecallAnswer | null) => {
      if (!session) return navigate(back)
      // Le texte tapé et pas encore retourné se garde aussi.
      if (current && drafts[passKey(current)] !== undefined)
        await answerRecall
          .mutateAsync({
            sessionId: session.id,
            answerId: current.id,
            answer: drafts[passKey(current)].trim() || null,
          })
          .catch(() => {})
      if (session.finished_at == null)
        toast(`Interro gardée · ${known} sur ${session.total} sues`)
      navigate(back)
    },
    [answerRecall, back, drafts, known, navigate, session],
  )

  if (error)
    return (
      <Shell values={values}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3.5">
          <span className="text-sm text-muted-foreground">
            {isNotFound(error)
              ? "Cette interro n'existe pas ou a été supprimée."
              : "Impossible de charger l'interro."}
          </span>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Retour au savoir
          </Button>
        </div>
      </Shell>
    )

  if (!session)
    return (
      <Shell values={values}>
        <SkeletonRegion className="flex flex-1 flex-col">
          <Skeleton className="h-2.5 w-[200px]" />
          <div
            className={`${CARD} mt-5 flex-1 items-center justify-center gap-2.5`}
          >
            <Skeleton className="h-[18px] w-[70%]" />
            <Skeleton className="h-[18px] w-[45%]" />
          </div>
        </SkeletonRegion>
      </Shell>
    )

  const finished = session.finished_at != null
  const up = finished ? null : nextUp(session, now, released)
  const current = up && !up.waiting ? up.answer : null
  const context = [
    skill?.name ?? '',
    ...(plan?.project_ids ?? []).map(
      (id) => `🎯 ${projects?.find((o) => o.id === id)?.title ?? 'Projet'}`,
    ),
  ]
    .filter(Boolean)
    .join(' · ')

  const fail = (err: unknown, fallback: string) =>
    toast.error(err instanceof ApiError ? err.message : fallback)
  const draftOf = (a: RecallAnswer) => drafts[passKey(a)] ?? openAnswerText(a)

  function save(s: RecallSession, a: RecallAnswer, verdict: Verdict = {}) {
    return answerRecall.mutateAsync({
      sessionId: s.id,
      answerId: a.id,
      answer: draftOf(a).trim() || null,
      ...verdict,
    })
  }

  async function turn() {
    if (!current) return
    try {
      await save(session!, current)
      setTurned((t) => new Set(t).add(passKey(current)))
    } catch (err) {
      fail(err, "La réponse n'a pas pu s'enregistrer")
    }
  }

  function judge(verdict: Verdict, leaving: Omit<Leaving, 'node'>) {
    if (!current || deck.busy) return
    // La carte qui sort, figée telle qu'on l'a jugée.
    const given = new Set(verdict.knownPoints ?? [])
    deck.play({
      ...leaving,
      node: verso(
        current,
        true,
        verdict.knownPoints && current.points.map((p) => given.has(p.id)),
      ),
    })
    setPreview(false)
    save(session!, current, verdict).catch((err) =>
      fail(err, "Le verdict n'a pas pu s'enregistrer"),
    )
  }

  function judgeList(given: string[]) {
    if (!current) return
    const total = current.points.length
    judge(
      { knownPoints: given },
      given.length === total
        ? { kind: 'known', label: '✓' }
        : given.length === 0
          ? { kind: 'missed', label: '✕' }
          : { kind: 'partial', label: `${given.length}/${total}` },
    )
  }

  function verso(a: RecallAnswer, frozen = false, decided?: boolean[]) {
    return (
      <VersoCard
        answer={a}
        failures={a.failures}
        draft={draftOf(a)}
        skillId={session!.skill_id}
        ink={values.ink}
        inkSoft={values.soft}
        pending={frozen || answerRecall.isPending || deck.busy}
        onJudge={(k) =>
          judge(
            { known: k },
            k ? { kind: 'known', label: '✓' } : { kind: 'missed', label: '✕' },
          )
        }
        onJudgeList={judgeList}
        onPreview={setPreview}
        decided={decided}
      />
    )
  }

  // Une passation laissée un autre jour s'ouvre sur « On reprend ».
  const startedDay = toDateISO(new Date(session.started_at))
  const resuming =
    !finished && !resumed && startedDay < toDateISO(new Date()) && known > 0

  let card: ReactNode = null
  if (resuming)
    card = (
      <ResumeCard
        known={known}
        total={session.total}
        since={sinceLabel(startedDay)}
        ink={values.ink}
        onResume={() => {
          deck.play({ kind: 'known', label: '', node: card })
          setResumed(true)
        }}
      />
    )
  else if (up?.waiting)
    card = (
      <WaitCard
        wait={up.wait}
        count={up.count}
        ink={values.ink}
        soft={values.soft}
        bord={values.bord}
        onSkip={() => setReleased((r) => new Set(r).add(releaseKey(up.answer)))}
        onQuit={() => void quit(null)}
      />
    )
  else if (current)
    card = turned.has(passKey(current)) ? (
      verso(current)
    ) : (
      <RectoCard
        key={passKey(current)}
        prompt={current.prompt}
        failures={current.failures}
        list={current.form === 'list'}
        draft={draftOf(current)}
        onDraft={(text) =>
          setDrafts((d) => ({ ...d, [passKey(current)]: text }))
        }
        onTurn={() => void turn()}
        pending={answerRecall.isPending || deck.busy}
        revise={
          passageOf(current) >= REVISE_FROM_PASSAGE ? (
            <ReviseRow
              revisionOn={current.revision_on}
              onPick={(day) =>
                setRevision
                  .mutateAsync({
                    sessionId: session.id,
                    answerId: current.id,
                    day,
                  })
                  .catch((err) => fail(err, "La révision n'a pas pu se poser"))
              }
              onClear={() =>
                clearRevision
                  .mutateAsync({ sessionId: session.id, answerId: current.id })
                  .catch((err) =>
                    fail(err, "La révision n'a pas pu se retirer"),
                  )
              }
            />
          ) : undefined
        }
      />
    )

  return (
    <Shell
      values={values}
      rail={
        <RecallRail
          answers={finished ? [] : inQueue(session)}
          currentId={current?.id ?? null}
          now={now}
          released={released}
          preview={preview}
          values={values}
          onQuit={() => void quit(current)}
        />
      }
    >
      {finished && !deck.busy ? (
        <div className="flex h-[min(560px,calc(100svh-48px))] flex-col">
          <RecallSummary
            session={session}
            ink={values.ink}
            inkClassName={accent.ink}
            ringClassName={accent.solid}
            onDone={() => navigate(back)}
          />
        </div>
      ) : (
        <>
          <span className="text-[12.5px] text-muted-foreground">{context}</span>
          <div className="mt-[18px] flex h-[min(520px,calc(100svh-110px))] flex-col">
            <CardStack
              leaving={deck.leaving}
              exiting={deck.exiting}
              inkColor={values.ink}
            >
              {card ?? <div className={`${CARD} flex-1`} />}
            </CardStack>
          </div>
        </>
      )}
    </Shell>
  )
}

/** La page : le rail à gauche, la colonne du paquet au centre. */
function Shell({
  values,
  rail,
  children,
}: {
  values: { soft: string }
  rail?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-h-svh bg-muted/40">
      {rail ?? (
        <div className="flex w-14 shrink-0 flex-col items-center border-r bg-card py-3">
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-[7px] text-sm"
            style={{ background: values.soft }}
          >
            🧠
          </span>
        </div>
      )}
      <main className="mx-auto flex min-h-svh w-full max-w-[640px] min-w-0 flex-col justify-center px-10 py-6 max-[700px]:px-4">
        {children}
      </main>
    </div>
  )
}

/** Un passage d'une question : la question, et combien de fois elle a déjà
 *  été ratée — le passage suivant repart d'un champ vide, recto. */
function passKey(a: RecallAnswer): string {
  return `${a.id}#${a.failures}`
}

/** « hier », sinon « le 3 oct. ». */
function sinceLabel(day: string): string {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return day === toDateISO(yesterday) ? 'hier' : `le ${formatDateShort(day)}`
}
