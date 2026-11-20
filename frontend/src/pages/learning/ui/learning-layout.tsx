import { Outlet, useNavigate, useParams } from 'react-router-dom'

import { LearningSidebar } from '@/widgets/learning-hub'

/**
 * Le hub de l'apprentissage (#152) — l'étage cross-domaine, et la maison des
 * savoirs. Une colonne à gauche (recherche, « Le hub », savoirs en
 * cours) ; à droite la vue choisie : la vue d'ensemble (`/learning`) ou la
 * **page savoir entière** (`/learning/:skillId`), posée par le routeur. Une
 * seule page savoir : `/skills/:skillId` redirige ici.
 *
 * Sous 768 px, la colonne passe au-dessus de la vue.
 */
export function LearningLayout() {
  const { skillId } = useParams<{ skillId: string }>()
  const navigate = useNavigate()

  return (
    <div className="grid min-h-[calc(100svh-var(--header-h))] grid-cols-[320px_minmax(0,1fr)] max-md:grid-cols-1">
      <aside className="border-r max-md:border-r-0 max-md:border-b">
        <LearningSidebar
          selected={skillId ?? null}
          onSelect={(id) => navigate(id ? `/learning/${id}` : '/learning')}
        />
      </aside>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  )
}
