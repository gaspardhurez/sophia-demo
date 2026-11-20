import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, toApiError } from '@/shared/api'

import type {
  ActivityType,
  ActivityTypeCreate,
  ActivityTypeLinkSet,
  ActivityTypeUpdate,
} from '../model/types'

export const activityTypeKeys = {
  root: ['activity-types'] as const,
}

export function useActivityTypes(domainId?: string) {
  return useQuery({
    queryKey: [...activityTypeKeys.root, domainId ?? null],
    queryFn: async (): Promise<ActivityType[]> => {
      const { data, error, response } = await api.GET('/activity-types', {
        params: { query: { domain_id: domainId } },
      })
      if (error) throw toApiError(error, response)
      return data
    },
  })
}

/**
 * Invalide activités types + activités (la planification pose des occurrences)
 * + projets (un lien, un Total qui disparaît) + le niveau de préparation.
 */
function useMutationSuccess() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: activityTypeKeys.root })
    queryClient.invalidateQueries({ queryKey: ['activities'] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
    queryClient.invalidateQueries({ queryKey: ['planning'] })
  }
}

export function useCreateActivityType() {
  const onSuccess = useMutationSuccess()
  return useMutation({
    mutationFn: async (body: ActivityTypeCreate): Promise<ActivityType> => {
      const { data, error, response } = await api.POST('/activity-types', {
        body,
      })
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

export function useUpdateActivityType() {
  const onSuccess = useMutationSuccess()
  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string
      body: ActivityTypeUpdate
    }): Promise<ActivityType> => {
      const { data, error, response } = await api.PATCH(
        '/activity-types/{activity_type_id}',
        { params: { path: { activity_type_id: id } }, body },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

/** Supprime l'activité type : ses occurrences restent, sans type ; les Totaux
 *  qui ne comptaient qu'elle sont supprimés. */
export function useDeleteActivityType() {
  const onSuccess = useMutationSuccess()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error, response } = await api.DELETE(
        '/activity-types/{activity_type_id}',
        { params: { path: { activity_type_id: id } } },
      )
      if (error) throw toApiError(error, response)
    },
    onSuccess,
  })
}

/**
 * Planifie une activité type pour un projet, ou change sa planification.
 * `reset` = « Repartir de zéro » ; sinon « Conserver l'existant ».
 */
export function useSetProjectActivityType() {
  const onSuccess = useMutationSuccess()
  return useMutation({
    mutationFn: async ({
      projectId,
      activityTypeId,
      body,
      reset,
    }: {
      projectId: string
      activityTypeId: string
      body: ActivityTypeLinkSet
      reset?: boolean
    }): Promise<void> => {
      const { error, response } = await api.PUT(
        '/projects/{project_id}/activity-types/{activity_type_id}',
        {
          params: {
            path: {
              project_id: projectId,
              activity_type_id: activityTypeId,
            },
            query: reset ? { reset } : undefined,
          },
          body,
        },
      )
      if (error) throw toApiError(error, response)
    },
    onSuccess,
  })
}

/** Retire l'activité type du projet ; `thenDomain` = « continuer dans le
 *  domaine » (le repli prend la planification du lien). */
export function useRemoveProjectActivityType() {
  const onSuccess = useMutationSuccess()
  return useMutation({
    mutationFn: async ({
      projectId,
      activityTypeId,
      thenDomain,
    }: {
      projectId: string
      activityTypeId: string
      thenDomain?: boolean
    }): Promise<void> => {
      const { error, response } = await api.DELETE(
        '/projects/{project_id}/activity-types/{activity_type_id}',
        {
          params: {
            path: {
              project_id: projectId,
              activity_type_id: activityTypeId,
            },
            query: thenDomain ? { then_domain: thenDomain } : undefined,
          },
        },
      )
      if (error) throw toApiError(error, response)
    },
    onSuccess,
  })
}
