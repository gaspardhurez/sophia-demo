# Sophia — frontend

React + TypeScript (Vite, Tailwind, shadcn/ui, TanStack Query), organisé en FSD.
Vue d'ensemble dans le [README à la racine](../README.md).

**pnpm uniquement** (jamais npm).

```bash
pnpm install
pnpm dev                   # serveur de dev (http://localhost:5173, API sur :8000)
pnpm gen:client            # client OpenAPI depuis ../backend/openapi.json
pnpm exec tsc -b           # types
pnpm lint && pnpm lint:fsd # oxlint + règles FSD (steiger)
pnpm format                # prettier
pnpm emoji:sync            # données du sélecteur d'emoji (après mise à jour d'emojibase-data)
```
