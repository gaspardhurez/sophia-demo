import { createBrowserRouter } from 'react-router-dom'

import { CalendarPage } from '@/pages/calendar'
import { DomainPage } from '@/pages/domain'
import { HomePage } from '@/pages/home'
import { LearningLayout, LearningOverviewPage } from '@/pages/learning'
import { ProjectPage } from '@/pages/project'
import { ProjectCreatePage } from '@/pages/project-create'
import { RecallPage, RecallStartPage } from '@/pages/recall'
import { SkillPage } from '@/pages/skill'
import { SkillNotesPage } from '@/pages/skill-notes'
import { WeekPreparationPage } from '@/pages/week-preparation'

import { AppLayout } from './layout'
import { SkillRedirect } from './skill-redirect'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'calendar', element: <CalendarPage /> },
      // Le mode « Préparation de la semaine » (#92) : `:week` est le lundi de
      // la semaine préparée.
      {
        path: 'calendar/preparation/:week',
        element: <WeekPreparationPage />,
      },
      // Le hub (#152) : la colonne des savoirs, et à droite la vue d'ensemble
      // ou la page savoir entière.
      {
        path: 'learning',
        element: <LearningLayout />,
        children: [
          { index: true, element: <LearningOverviewPage /> },
          { path: ':skillId', element: <SkillPage /> },
        ],
      },
      { path: 'domains/:domainId', element: <DomainPage /> },
      // Avant `:projectId` : « new » n'est pas un id.
      { path: 'projects/new', element: <ProjectCreatePage /> },
      { path: 'projects/:projectId', element: <ProjectPage /> },
      { path: 'skills/:skillId', element: <SkillRedirect /> },
      { path: 'skills/:skillId/notes', element: <SkillNotesPage /> },
    ],
  },
  // La passation de l'interro (#80) : plein écran, hors de la coque.
  { path: '/interro/:sessionId', element: <RecallPage /> },
  // Depuis un lien (panneau d'activité, #82) : commence ou reprend, puis y mène.
  { path: '/plans/:planId/interro', element: <RecallStartPage /> },
])
