import { createContext, useContext } from 'react'

import type { WeekSteps } from '@/entities/preparation'

import type { ArmController } from './arm'
import type { PreparationGestures } from './gestures'
import type { PreparationWeek, PreparationWeeks } from './weeks'

/**
 * Ce que la page de préparation partage avec son panneau : la semaine, le mode
 * liaison, la séance mise en avant au calendrier, les gestes.
 */
export interface PreparationContextValue {
  /** Le lundi de la semaine préparée (N+1), au format ISO. */
  weekKey: string
  weeks: PreparationWeeks
  arm: ArmController
  /** Met une séance en avant au calendrier (survol d'une ligne du panneau). */
  hover: (activityId: string | null) => void
  gestures: PreparationGestures
  /** L'étape choisie par projet, semaine par semaine (#183) ; absente :
   *  celle qui couvre le lundi. */
  steps: Record<string, WeekSteps>
  chooseStep: (projectId: string, week: PreparationWeek, stepId: string) => void
}

export const PreparationContext = createContext<PreparationContextValue | null>(
  null,
)

export function usePreparation(): PreparationContextValue {
  const ctx = useContext(PreparationContext)
  if (!ctx) throw new Error('usePreparation hors de la préparation')
  return ctx
}
