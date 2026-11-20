import { defineConfig } from 'steiger'
import fsd from '@feature-sliced/steiger-plugin'

export default defineConfig([
  ...fsd.configs.recommended,
  {
    // `insignificant-slice` propose de fusionner toute slice référencée une
    // seule fois. En pratique ça pousse à dissoudre les features dans les pages
    // dès qu'une action n'a qu'un seul point d'appel — l'inverse de la
    // distinction entities (ce que les choses SONT) / features (ce que
    // l'utilisateur FAIT) qu'on tient volontairement. On garde les deux règles
    // structurantes (dépendances descendantes, public API), pas celle-ci.
    rules: {
      'fsd/insignificant-slice': 'off',
    },
  },
])
