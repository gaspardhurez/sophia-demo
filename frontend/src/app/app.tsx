import { QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { RouterProvider } from 'react-router-dom'

import { Toaster, TooltipProvider } from '@/shared/ui'

import { queryClient } from './query-client'
import { router } from './router'

export function App() {
  return (
    // `attribute="class"` pose `.dark` sur <html> : c'est ce que cible la
    // custom-variant `dark` de index.css. Pas de `disableTransitionOnChange` —
    // nos transitions sont ciblées (border-color, box-shadow), donc la bascule
    // fait un fondu propre au lieu d'un feu d'artifice.
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
          <RouterProvider router={router} />
        </TooltipProvider>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
