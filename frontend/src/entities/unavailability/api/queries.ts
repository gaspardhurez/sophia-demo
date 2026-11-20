import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, toApiError } from '@/shared/api'

import type {
  Unavailability,
  UnavailabilityCreate,
  UnavailabilitySlotCreate,
  UnavailabilitySlotUpdate,
  UnavailabilityUpdate,
} from '../model/types'

export const unavailabilityKeys = {
  root: ['unavailabilities'] as const,
}

/** Les indisponibilités qui touchent la fenêtre `[start, end[`. */
export function useUnavailabilities(start: string, end: string) {
  return useQuery({
    queryKey: [...unavailabilityKeys.root, start, end],
    queryFn: async (): Promise<Unavailability[]> => {
      const { data, error, response } = await api.GET('/unavailabilities', {
        params: { query: { start, end } },
      })
      if (error) throw toApiError(error, response)
      return data
    },
  })
}

/** Toute écriture relit les fenêtres : une indisponibilité en touche
 *  plusieurs. */
function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: unavailabilityKeys.root })
}

export function useCreateUnavailability() {
  const onSuccess = useInvalidate()
  return useMutation({
    mutationFn: async (body: UnavailabilityCreate): Promise<Unavailability> => {
      const { data, error, response } = await api.POST('/unavailabilities', {
        body,
      })
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

export function useUpdateUnavailability() {
  const onSuccess = useInvalidate()
  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string
      body: UnavailabilityUpdate
    }): Promise<Unavailability> => {
      const { data, error, response } = await api.PATCH(
        '/unavailabilities/{unavailability_id}',
        { params: { path: { unavailability_id: id } }, body },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

export function useDeleteUnavailability() {
  const onSuccess = useInvalidate()
  return useMutation({
    mutationFn: async ({ id }: { id: string }): Promise<void> => {
      const { error, response } = await api.DELETE(
        '/unavailabilities/{unavailability_id}',
        { params: { path: { unavailability_id: id } } },
      )
      if (error) throw toApiError(error, response)
    },
    onSuccess,
  })
}

export function useAddUnavailabilitySlot() {
  const onSuccess = useInvalidate()
  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string
      body: UnavailabilitySlotCreate
    }): Promise<Unavailability> => {
      const { data, error, response } = await api.POST(
        '/unavailabilities/{unavailability_id}/slots',
        { params: { path: { unavailability_id: id } }, body },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

export function useUpdateUnavailabilitySlot() {
  const onSuccess = useInvalidate()
  return useMutation({
    mutationFn: async ({
      id,
      slotId,
      body,
    }: {
      id: string
      slotId: string
      body: UnavailabilitySlotUpdate
    }): Promise<Unavailability> => {
      const { data, error, response } = await api.PATCH(
        '/unavailabilities/{unavailability_id}/slots/{slot_id}',
        { params: { path: { unavailability_id: id, slot_id: slotId } }, body },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}

export function useRemoveUnavailabilitySlot() {
  const onSuccess = useInvalidate()
  return useMutation({
    mutationFn: async ({
      id,
      slotId,
    }: {
      id: string
      slotId: string
    }): Promise<Unavailability> => {
      const { data, error, response } = await api.DELETE(
        '/unavailabilities/{unavailability_id}/slots/{slot_id}',
        { params: { path: { unavailability_id: id, slot_id: slotId } } },
      )
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess,
  })
}
