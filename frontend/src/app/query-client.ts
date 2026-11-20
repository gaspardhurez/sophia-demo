import { MutationCache, QueryClient } from '@tanstack/react-query'

import { learningKeys } from '@/entities/learning'

export const queryClient = new QueryClient({
  // La vue d'ensemble de l'apprentissage (#152) lit tout — séances, cycles,
  // pièces, projets : toute écriture réussie la périme, sauf celles qui s'en
  // déclarent sans effet (`meta: { overview: false }`, le pense-bête qui
  // s'enregistre à la frappe).
  mutationCache: new MutationCache({
    onSuccess: (_data, _variables, _context, mutation) => {
      if (mutation.meta?.overview === false) return
      void queryClient.invalidateQueries({ queryKey: learningKeys.root })
    },
  }),
  defaultOptions: {
    queries: {
      // Par défaut Query réessaie 3 fois, espacées de 1 s + 2 s + 4 s. Contre
      // un backend local, un échec est un vrai échec (404, erreur de code),
      // pas un aléa réseau : réessayer ne fait qu'ajouter 7 s d'attente.
      // À reconsidérer le jour où l'app sort de localhost.
      retry: false,
    },
  },
})
