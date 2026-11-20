import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api, toApiError } from '@/shared/api'

import type { Wish, WishItem, WishKind } from '../model/types'

export const wishKeys = { root: ['wishes'] as const }

export function useWishes() {
  return useQuery({
    queryKey: wishKeys.root,
    queryFn: async (): Promise<Wish[]> => {
      const { data, error, response } = await api.GET('/wishes')
      if (error) throw toApiError(error, response)
      return data
    },
    // La liste s'écrit sur place : l'écran tient son état dès le chargement,
    // une relecture en cours de frappe ne doit rien écraser.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

/** Remplace la liste entière d'un genre ; les puces vides n'y vont pas. Le
 *  cache suit, pour l'écran qu'on rouvrira ; celui qui est ouvert garde son
 *  état. */
export function useReplaceWishes() {
  const queryClient = useQueryClient()
  return useMutation({
    meta: { overview: false },
    mutationFn: async ({
      kind,
      items,
    }: {
      kind: WishKind
      items: WishItem[]
    }): Promise<Wish[]> => {
      const { data, error, response } = await api.PUT('/wishes/{kind}', {
        params: { path: { kind } },
        body: {
          items: items
            .filter((i) => i.text.trim())
            .map(({ id, text, domain_id }) => ({ id, text, domain_id })),
        },
      })
      if (error) throw toApiError(error, response)
      return data
    },
    onSuccess: (saved, { kind }) =>
      queryClient.setQueryData<Wish[]>(wishKeys.root, (cur) => {
        const others = (cur ?? []).filter((w) => w.kind !== kind)
        return kind === 'wish' ? [...saved, ...others] : [...others, ...saved]
      }),
  })
}
