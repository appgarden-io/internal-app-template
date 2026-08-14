---
name: template-patterns
description: How to build features in this AppGarden app — the storage/AI/file/secrets seams, typed API routes, the typed client, database migrations. Read the relevant reference before adding a feature, a table, a route, UI, or an integration with a third-party service, or before touching worker/schema.ts, api-routes.ts, storage-do.ts, ai-runner.ts, file-store.ts, or secrets.ts.
---

# Template patterns

This app is one Cloudflare Worker serving a React SPA and a Hono API, with a
SQLite Durable Object for storage. Every feature threads the same four layers:

```text
typed Hono route ──► seam interface ──► Worker adapter ──► Cloudflare binding
(api-routes.ts)      (AppStorage,        (storage-do.ts,     (STORAGE, AI,
        ▲             AiRunner,           ai-runner.ts,       BUCKET)
        │             FileStore)          file-store.ts)
   apiClient ◄── SPA (src/routes/*)
   (api.ts)
```

A fourth seam, `SecretVault` (`worker/secrets.ts`), takes the same
route → interface → adapter path but ends at the AppGarden secrets vault over
HTTPS instead of a Cloudflare binding — that is how an App reaches a third-party
API key without one ever living in this repo.

A minimal worked example — the `/api/health` check — threads all four layers.
Trace it before building anything: route in `src/lib/api-routes.ts`, interface
method on `AppStorage`, implementation in `worker/storage-do.ts`, called from
`src/routes/index.tsx` through `apiClient`.

## References — read before touching the matching layer

| Building… | Read |
| --- | --- |
| A database table, or ANY change to `worker/schema.ts` | [references/database.md](references/database.md) — contains the rules that prevent live data loss |
| Storage methods (Durable Object) | [references/storage.md](references/storage.md) |
| API endpoints | [references/api-routes.md](references/api-routes.md) |
| SPA pages, data fetching, forms, tables | [references/client-ui.md](references/client-ui.md) |
| File upload/download (R2) | [references/files.md](references/files.md) |
| AI features (Workers AI) | [references/ai.md](references/ai.md) |
| Calling a third-party service that needs an API key or token | [references/secrets.md](references/secrets.md) |

Rot guard: when you change a seam or infrastructure file, update its reference
file in the same commit.
