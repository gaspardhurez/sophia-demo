import { useEffect } from 'react'
import { Link, Outlet, ScrollRestoration } from 'react-router-dom'

import { usePreparePlanning } from '@/entities/activity-type'
import { ThemeToggle } from '@/shared/ui'
import { NotepadButton } from '@/widgets/notepad'

/**
 * Coquille commune à toutes les pages : l'en-tête est rendue une fois,
 * la page courante s'insère dans l'<Outlet>.
 */
export function AppLayout() {
  // « La première ouverture de la semaine » (#37, §6) : l'app tourne en local,
  // aucun job ne prépare le lundi à minuit. À chaque ouverture, on demande la
  // semaine en cours — le serveur ne pose que ce qui ne l'est pas encore.
  const prepare = usePreparePlanning()
  useEffect(() => {
    prepare.mutate(undefined)
    // Une fois par ouverture de l'app, pas à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    // La coquille ne pose aucune mise en page à ses pages : chacune règle
    // sa propre hauteur. Une page qui remplit la fenêtre sous l'en-tête (les
    // notes) prend `min-h-[calc(100svh-var(--header-h))]` ; une page qui y
    // tient exactement, sans défiler (le calendrier, la préparation), prend
    // `h-[calc(100svh-var(--header-h))]` — l'en-tête a cette hauteur fixe.
    // Jamais une hauteur d'en-tête recopiée en dur.
    <div className="min-h-svh">
      {/* Scroll en haut à chaque nouvelle navigation, restauré au retour. */}
      <ScrollRestoration />
      <header className="box-border h-(--header-h) border-b">
        <div className="mx-auto flex h-full max-w-5xl items-center gap-6 px-6">
          <Link to="/" className="font-semibold tracking-tight">
            Sophia
          </Link>
          <Link
            to="/calendar"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Calendrier
          </Link>
          {/* L'étage cross-domaine du hub d'apprentissage : les savoirs
              vivent dans un graphe global, il leur faut une porte globale. */}
          <Link
            to="/learning"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {/* Plus de pastille ici (26/10) : son compte n'était pas clair ;
                « Le hub », dans la colonne, garde celle de Rattraper. */}
            Apprentissage
          </Link>
          {/* À droite, hors du groupe de navigation : les liens à gauche
              mènent quelque part, le pense-bête non — il s'ouvre sur place.
              Les mélanger promettrait une navigation qui n'arrive pas. */}
          <div className="ml-auto flex items-center gap-1">
            <NotepadButton />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
