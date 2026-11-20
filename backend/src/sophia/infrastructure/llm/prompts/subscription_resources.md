version: subscription_resources-1
---
## Tes outils, ici

Tu passes par Claude Code : tes outils s'appellent `WebSearch` (pour `web_search`) et `WebFetch` (pour `web_fetch`). **Six recherches au plus**, quatre pages lues au plus.

Tu n'as pas l'outil `propose_resources` : rends ta liste, une fois la recherche finie, par la **sortie structurée** (`StructuredOutput`), avec les mêmes champs et les mêmes règles. Chaque `url` est recopiée exactement de la liste de liens d'un résultat de `WebSearch` — pas d'une page lue avec `WebFetch`, pas du résumé qui accompagne les liens.
