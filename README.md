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
| Files      | R2 object storage (`BUCKET`), shared per account    |
| AI         | Workers AI via AI Gateway (`AI` binding)            |
| Data access| Drizzle ORM (`durable-sqlite`) + committed migrations |
| Lint/Format| Biome                                               |

### How one Worker serves both

```
Request
  /api/example ──► Worker (Hono) ──► TanStack Query via Hono hc
  /api/notes   ──► Worker (Hono) ──► STORAGE Durable Object (SQLite)
  /api/ai/*    ──► Worker (Hono) ──► AI binding ──► AI Gateway (default)
  /api/files/* ──► Worker (Hono) ──► BUCKET (R2, shared; keyed by <slug>/)
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

| Field         | Default         | Where                                |
| ------------- | --------------- | ------------------------------------ |
| Worker name   | `appgarden-app` | `wrangler.jsonc` (`name`)            |
| Display title | `AppGarden App` | `index.html`, `src/routes/index.tsx` |

The **deployed** script name is the app slug — this repo's name — supplied by the
Deploy workflow as `wrangler deploy --name <repo-name>`, so the slug is never
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

## How this template is used

**Created from a template repository.** A new app repo is generated from this repo
(`gh repo create <org>/<slug> --template appgarden-io/internal-app-template --private`). The new
repo's **name is the app slug** — the Worker script name and the subdomain label both. No files are
edited at creation time; the slug lives only in the repo name.

**Deployed by pushing to `main`.** Every push to `main` runs `.github/workflows/deploy.yml`, which
lints, typechecks, builds, then runs:

```bash
wrangler deploy --name <repo-name> --dispatch-namespace <namespace>
```

**No app slug or dispatch namespace is hardcoded here.** `wrangler.jsonc` is a normal Worker
config; the workflow supplies the script name (the repo name) and the namespace, so the same
template deploys into any client's Workers-for-Platforms namespace.

> **Operator setup (once per GitHub org).** The deploy reads its Cloudflare config from the org's
> Actions secrets/vars — never committed, never on a Builder's machine. Set these before the first
> push or the deploy fails:
> - secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
> - vars: `APPGARDEN_NAMESPACE` (dispatch namespace), `APPGARDEN_APPS_DOMAIN` (for the live-URL summary)

## API examples

`src/lib/api-routes.ts` defines the typed Hono routes (`/api/example`, `/api/health`,
and the `/api/notes` CRUD). `src/lib/api.ts` creates the matching Hono `hc` client and is
the only place the SPA talks to the API; `src/routes/index.tsx` calls it with TanStack Query.
Request, response, and path-param types flow from the route definitions to the client with no
casts — that is the intended typed client/server API pattern.

## AI and R2 storage

Two more Cloudflare bindings ship wired-in, behind the same seam pattern as storage
(`src/lib/api-routes.ts` stays Cloudflare-free; the Worker injects the real adapter):

- **AI** (`env.AI`) — Workers AI, routed through **AI Gateway**. The adapter
  (`worker/ai-runner.ts`) calls `ai.run(model, inputs, { gateway: { id: "default" } })`; the
  `default` gateway auto-creates on first use, giving caching, rate-limiting, and analytics with
  no setup. Example route: `POST /api/ai/generate`.
- **Files** (`env.BUCKET`) — R2 object storage. Example routes: `GET`/`POST /api/files` and
  `GET`/`DELETE /api/files/:key`. Client helpers live in `src/lib/api.ts` (`generateText`,
  `listFiles`, `uploadFile`, `downloadFile`, `deleteFile`).

### One shared bucket, isolated by app

Every App in a Client's Cloudflare account shares **one** R2 bucket, `apps-storage`, created once
when the account is provisioned — it is **not** created by the App deploy. The Worker prefixes
every object key with this App's slug (`<APP_SLUG>/…`, set from the repo name at deploy time), so
Apps never collide and each sees only its own files. `worker/file-store.ts` adds and strips the
prefix; routes and the SPA work in a flat key space. If an App ever needs a dedicated bucket,
change `bucket_name` in `wrangler.jsonc` and have that bucket provisioned.

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
through **Drizzle ORM**. The Hono routes (`GET/POST /api/notes`, `DELETE /api/notes/:id`)
reach it through the `NotesStorage` seam: they depend on that interface, and `worker/index.ts`
injects the DO stub. This keeps the routes Worker-free so the SPA can import their types. The
`notes` table is a **placeholder** — replace it with your app's real data model.

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

Row types live only in the schema: `worker/schema.ts` exports
`type Note = typeof notes.$inferSelect`, and `src/lib/api.ts` re-exports it via
`import type`, so the server and SPA can never drift. **Never hand-edit
`drizzle/`** — it is regenerated from the schema.

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
