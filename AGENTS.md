# AGENTS.md

An **AppGarden internal app**: one Cloudflare Worker serving a React SPA + a Hono API,
behind Cloudflare Access (no public URL). Storage is a SQLite Durable Object.

The builder working on this app is non technical so use plain language when communicating with them.

**Building a feature? Read `.claude/skills/template-patterns/` first** — its
`SKILL.md` maps the reference files (database, storage, API routes, client/UI,
files, AI) and the live `/api/health` example that threads all the layers.

## Commands
```bash
npm install
npm run dev        # local dev — Vite + the Worker in workerd
npm run build      # tsc -b && vite build
npm run typecheck
npm run lint
npm run db:generate  # regenerate drizzle/ after editing worker/schema.ts
```

## Deploy — commit and push to `main`
This app deploys itself. To ship a change, commit it and push to `main`:
```bash
git add -A
git commit -m "describe your change"
git push
```
A GitHub Action then lints, typechecks, builds, and deploys the app through the AppGarden deploy gateway (no Cloudflare credentials live in this repo or org). Watch it under the repo's
**Actions** tab; when it finishes, the run summary shows your live URL.

**Never run `wrangler deploy` by hand.** Pushing to `main` is the only way to deploy — a manual
`wrangler deploy` skips the dispatch namespace and Cloudflare Access and ships the Worker to the
wrong place. There is no `npm run deploy`.

## Conventions

Each rule is one line here; its reference file under
`.claude/skills/template-patterns/references/` has the pattern, a worked
example, and the reasons. 

- **API**: define routes in `src/lib/api-routes.ts` (typed Hono chain); validate bodies with
  `zValidator` (`@hono/zod-validator`) at the door, not inside the handler, or the client can't
  send a body — always pass its error hook — give every response an explicit status, no
  `as`/`unknown` casts → `references/api-routes.md`.
- **Client**: the SPA talks to the API only through the typed `apiClient` (`src/lib/api.ts`),
  called directly in `queryFn`/loader — never raw `fetch`, no per-endpoint wrappers →
  `references/client-ui.md`.
- **Storage**: routes depend on the `AppStorage` interface, implemented on the Durable Object
  (`worker/storage-do.ts`) — never on the DO directly → `references/storage.md`.
- **Database**: before ANY change to `worker/schema.ts`, read
  `.claude/skills/template-patterns/references/database.md` — it contains the rules that prevent
  live data loss. Never hand-edit `drizzle/`; row types come from the schema.
- **AI**: call Workers AI through the `AiRunner` seam (`c.var.ai`), never `env.AI`; AI calls throw
  in local dev → `references/ai.md`.
- **Files/R2**: use the `FileStore` seam (`c.var.files`), never `env.BUCKET`; flat keys →
  `references/files.md`.
- **Routes/UI**: file-based routes in `src/routes/`; shadcn/ui + Tailwind; TanStack tables and
  forms; zustand for complex state; avoid `useEffect`; mobile responsive; `<Reveal>` for entrance
  motion; a button that only navigates should be a link → `references/client-ui.md`.

## Platform contract (breaks production if violated)

- **Bindings in `wrangler.jsonc` configure LOCAL DEV only — production bindings are fixed by the
  platform.** (The file's other fields — `main`, compatibility settings, `migrations` — DO feed the
  deploy via the build output.)
  At deploy the AppGarden gateway ignores this file's bindings and gives the app exactly:
  `BUCKET` (this app's own R2 bucket), `STORAGE` (the `StorageDurableObject`), `AI`, `APP_SLUG`
  (the repo name), and `ASSETS` (the built SPA). Three consequences:
  - **Adding a new binding here (KV, D1, queues, …) will work in `npm run dev` and silently NOT
    exist once deployed** — the code will break in production only. If a feature needs a new kind
    of resource, ask AppGarden first instead of building on it or find an alternative way to ship a feature with the included resources.
    Two guards enforce this, at pre-commit and again in CI: `npm run check:bindings`
    (`scripts/check-bindings.mjs`) allowlists `wrangler.jsonc`'s keys, binding names and `vars`,
    and re-checks `interface Env`; `style/noRestrictedTypes` in `biome.jsonc` bans the binding
    types by name. **Do not delete or weaken either one to get past a failure** — there is no
    configuration that makes a new binding reach production.
  - **Never rename or remove `StorageDurableObject` or its export** in `worker/index.ts` — the
    deploy fails (the platform binds that exact class).
  - **Treat `migrations` in `wrangler.jsonc` as append-only history** — the platform deploys only
    the steps the live app is missing; rewriting or deleting past entries breaks every future
    deploy. (Don't edit `name` either — the deployed name is always this repo's name.)
