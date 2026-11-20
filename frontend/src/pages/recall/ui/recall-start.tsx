import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { useStartRecall } from '@/entities/recall'
import { ApiError } from '@/shared/api'

/**
 * `/plans/:planId/interro` : passer l'interro d'un cycle depuis un lien (le
 * panneau d'activité, #82). Commence la passation — ou reprend celle qu'on
 * avait quittée — puis mène à sa page (`/interro/:sessionId`).
 */
export function RecallStartPage() {
  const { planId } = useParams<{ planId: string }>()
  const start = useStartRecall()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  // Une seule fois, même en double rendu de développement.
  const asked = useRef(false)

  useEffect(() => {
    if (!planId || asked.current) return
    asked.current = true
    start
      .mutateAsync(planId)
      .then((session) => navigate(`/interro/${session.id}`, { replace: true }))
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : "L'interro n'a pas pu s'ouvrir",
        ),
      )
  }, [planId, start, navigate])

  return (
    <main className="mx-auto max-w-[480px] px-6 py-24 text-sm text-muted-foreground">
      {error ? (
        <>
          <p>{error}</p>
          <Link to="/" className="mt-3 inline-block underline">
            Revenir à l'accueil
          </Link>
        </>
      ) : (
        <p>Ouverture de l'interro…</p>
      )}
    </main>
  )
}
