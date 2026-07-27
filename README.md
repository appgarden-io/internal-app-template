# AppGarden App

An AppGarden internal app: a React SPA and a Hono API served by a **single**
Cloudflare Worker, with storage in a SQLite-backed Durable Object. It installs
and builds standalone — it is intentionally **not** part of the AppGarden
monorepo and pins its own dependency versions.

## Stack

| Layer      | Choice                                              |
| ---------- | --------------------------------------------------- |
| Build      | Vite 8 + `@cloudflare/vite-plugin`                  |
| UI         | React 19 + TypeScript                               |
| Routing    | TanStack Router (file-based, `src/routes/`)         |
| Data       | TanStack Query + typed Hono `hc` client             |
| Styling    | Tailwind CSS v4 (`@tailwindcss/vite`) + shadcn/ui   |
| API        | Hono, running inside the Worker, mounted at `/api`  |
| Storage    | SQLite Durable Object (`StorageDurableObject`)      |
| Files      | R2 object storage (`BUCKET`), one bucket per App    |
| AI         | Workers AI via AI Gateway (`AI` binding)            |
| Data access| Drizzle ORM (`durable-sqlite`) + committed migrations |
| Lint/Format| Biome                                               |

### How one Worker serves both

```
Request
  /api/health  ──► Worker (Hono) ──► STORAGE Durable Object (SQLite)
  /api/config  ──► Worker (Hono) ──► app name from APP_SLUG
  /api/ai/*    ──► Worker (Hono) ──► AI binding ──► AI Gateway (default)
  /api/files/* ──► Worker (Hono) ──► BUCKET (R2, one bucket per App)
  /*      ──► ASSETS binding ──► dist/client (index.html SPA fallback)
```

`wrangler.jsonc` sets `assets.run_worker_first: ["/api/*"]`, so only API
traffic reaches the Worker; everything else is served as a static asset, with
`not_found_handling: "single-page-application"` falling back to `index.html`
for client-side routes. The `@cloudflare/vite-plugin` builds the client into
`dist/client`, bundles the Worker into a package-derived output directory, and
emits a deploy-ready `wrangler.json` that Wrangler picks up automatically.

## Template identity (no placeholders)

This template has **no scaffold placeholders** — it is a real, runnable app,
generated verbatim when a new app repo is created from it. It ships with default
identity you can keep or change:

| Field         | Default         | Where                     |
| ------------- | --------------- | ------------------------- |
| Worker name   | `appgarden-app` | `wrangler.jsonc` (`name`) |
| Display title | `AppGarden App` | `index.html`              |

The **deployed** script name is the app slug — this repo's name — stamped by the
AppGarden deploy gateway from the App's registration, so the slug is never
written into any file and the raw template stays buildable. The display title is
ordinary app text: edit it like any other code.

## Local development

```bash
npm install
npm run dev          # Vite dev server; Worker runs in workerd via the plugin
```

Other scripts:

```bash
npm run build        # tsc -b && vite build  (client + Worker bundle)
npm run typecheck    # tsc -b --noEmit
npm run lint         # biome check .
npm run cf-typegen   # regenerate worker/worker-configuration.d.ts (optional)
npm run db:generate  # regenerate drizzle/ migrations after editing worker/schema.ts
```

There is no `deploy` script — **deploying is just `git push` to `main`** (see below). Never run
`wrangler deploy` by hand.

### Windows note — line endings

The repo pins **LF** line endings via `.gitattributes` (`* text=auto eol=lf`), because Biome formats
LF and Windows git defaults to `core.autocrlf=true` (CRLF checkouts). A fresh clone therefore just
works on Windows. If `npm run lint` ever reports format errors on files you didn't touch, naming
line-ending differences (CRLF vs LF), your working tree predates the pin — don't reformat anything;
re-checkout instead:

```bash
git pull                  # make sure .gitattributes is present
git rm --cached -r .
git reset --hard          # re-checkout everything as LF
```

(Or simply delete the folder and clone fresh.)

## How this template is used

**Created from a template repository.** A new app repo is generated from this repo
(`gh repo create <org>/<slug> --template appgarden-io/internal-app-template --private`). The new
repo's **name is the app slug** — the Worker script name and the subdomain label both. No files are
edited at creation time; the slug lives only in the repo name.

**Deployed by pushing to `main`.** Every push to `main` runs `.github/workflows/deploy.yml`, which
lints, typechecks, builds, then mints a short-lived GitHub OIDC token and POSTs the built bundle to
the AppGarden deploy gateway (`scripts/deploy-bundle.mjs`). The gateway verifies the token, checks
this repo is a registered App, and uploads the Worker into this Client's dispatch namespace.

**No app slug, dispatch namespace, or Cloudflare credential exists here.** `wrangler.jsonc` is a
normal Worker config used for local dev only; the gateway resolves the script name (the repo
name), the namespace, and every binding server-side — the same template deploys into any Client's
Workers-for-Platforms namespace, and there is no secret in the org to leak or rotate.

> **Operator setup: none.** The workflow reads no org-level Actions configuration — no
> variables, no secrets. Deploy authentication is the workflow-minted OIDC token, so the
> GitHub org needs nothing beyond the repo itself.

## The API pattern

`src/lib/api-routes.ts` defines the typed Hono routes; `src/lib/api.ts` creates the matching
Hono `hc` client (`apiClient`), the only way the SPA talks to the API. Request-body, response,
and path-param types flow from the route definitions to the client with no casts — request
bodies are typed because each route declares its body with a `validator`, so sending the wrong
shape is a compile error rather than a runtime 400.

The minimal worked example is the health check: `GET /api/health` threads
route → `AppStorage` interface → `StorageDurableObject`, and the home page
(`src/routes/index.tsx`) calls it through `apiClient` with TanStack Query — the
"connected" badge is live proof the whole stack is wired. Build real features
the same way; the patterns are documented in
`.claude/skills/template-patterns/`.

## AI and R2 storage

Two more Cloudflare bindings ship wired-in, behind the same seam pattern as storage
(`src/lib/api-routes.ts` stays Cloudflare-free; the Worker injects the real adapter):

- **AI** (`env.AI`) — Workers AI, routed through **AI Gateway**. The adapter
  (`worker/ai-runner.ts`) calls `ai.run(model, inputs, { gateway: { id: "default" } })`; the
  `default` gateway auto-creates on first use, giving caching, rate-limiting, and analytics with
  no setup. Example route: `POST /api/ai/generate`.
- **Files** (`env.BUCKET`) — R2 object storage. Example routes: `GET`/`POST /api/files` and
  `GET`/`DELETE /api/files/:key`. Call them from the SPA through `apiClient`
  (e.g. `apiClient.files.$post({ form: { file } })`).

### A bucket per app

Each App gets its **own** R2 bucket, named from the Slug, created by the deploy gateway on the
first push — so the bucket itself is the isolation boundary and keys live in a
flat space (no prefixing). `worker/file-store.ts` talks to `env.BUCKET` directly. `npm run dev`
simulates R2 locally, so no real bucket is needed for local development.

### Local development

`npm run dev` runs **fully offline** — no Cloudflare login. R2 and the Durable Object are
simulated locally, so the file routes work end-to-end with no account. **Workers AI has no local
simulator**, so `vite.config.ts` sets `remoteBindings: false`: otherwise the dev server would open
an authenticated session to your Cloudflare account just to boot, and AppGarden Builders have no
local credentials. The AI binding is still present, but calling it in local dev throws —
`POST /api/ai/generate` works once deployed. To exercise AI locally, flip `remoteBindings` to
`true` in `vite.config.ts` and `wrangler login` (Workers AI then runs against — and bills — your
real account, even in dev).

## Storage: Drizzle ORM + SQLite Durable Object

`worker/storage-do.ts` is a SQLite Durable Object that accesses its database
through **Drizzle ORM**. Routes reach it through the `AppStorage` seam: they depend on that
interface, and `worker/index.ts` injects the DO stub. This keeps the routes Worker-free so the
SPA can import their types.

The template ships with an **empty schema** and an empty migration journal —
`drizzle/migrations.js` is a hand-written empty bundle (the one sanctioned exception to "never
hand-edit `drizzle/`", noted in the file) because drizzle-kit emits nothing for a table-free
schema. Add your first table to `worker/schema.ts`, run `npm run db:generate`, and the real
migration `0000` replaces it.

```
worker/schema.ts   the tables (single source of the row types) ── edit this
      │  npm run db:generate
      ▼
drizzle/           generated SQL + migration journal (committed) ── never edit
      │  StorageDurableObject applies pending migrations on startup
      ▼
SQLite Durable Object
```

To change the schema:

1. Edit `worker/schema.ts` (add/alter tables and columns).
2. Run `npm run db:generate` — drizzle-kit writes a new migration into `drizzle/`.
3. Commit the change. `drizzle/` is generated **but committed and bundled**, so a
   copied-out app deploys without a generate step. The Durable Object applies any
   pending migrations the next time it starts (`blockConcurrencyWhile`).

Once an app is deployed, schema changes can destroy live data — before ANY
change to `worker/schema.ts`, read
`.claude/skills/template-patterns/references/database.md`.

Row types live only in the schema: `worker/schema.ts` exports them via
`$inferSelect` (e.g. `export type Note = typeof notes.$inferSelect`), and the
SPA imports them with `import type`, so the server and SPA can never drift.
**Never hand-edit `drizzle/`** — it is regenerated from the schema.

### Why no bundler config for `.sql`

drizzle-kit's `drizzle/migrations.js` imports the `.sql` files as strings.
`@cloudflare/vite-plugin` and Wrangler import `.sql` as JavaScript strings
natively, so the build attaches each migration as a Text module with no Vite
plugin or wrangler `rules`. The only glue is `drizzle/migrations.d.ts`, a small
hand-written declaration so `tsc` types the `migrations.js` import (see
`docs/adr/0003` in the AppGarden repo).

### shadcn/ui components

All available shadcn/ui registry components are already installed.
`components.json` is configured (new-york style, neutral base, `@/` alias).
Refresh or add components with:

```bash
npx shadcn@latest add <component>
```

The root `tsconfig.json` repeats the `@/* -> ./src/*` alias even though the app
compiler options live in `tsconfig.app.json`. The shadcn CLI reads the root
config in this referenced-project setup; without that alias it writes files into
a literal `@/` directory.
