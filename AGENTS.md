# AGENTS.md

An **AppGarden internal app**: one Cloudflare Worker serving a React SPA + a Hono API,
behind Cloudflare Access (no public URL). Storage is a SQLite Durable Object.

The builder working on this app is non technical so use plain language when communicating with them.

## Commands
```bash
npm install
npm run dev        # local dev — Vite + the Worker in workerd
npm run build      # tsc -b && vite build
npm run typecheck
npm run lint
npm run db:generate  # regenerate drizzle/ after editing worker/schema.ts
npm run check:sizes  # fail if any source file exceeds 400 lines
npm run check:migrations  # guard drizzle/*.sql edits and destructive migrations
```

**Lockfile drift after adding a dependency.** The deploy pipeline installs with `npm ci`, which
fails if `package.json` and `package-lock.json` are out of sync. If you add a dependency and CI
then errors on `npm ci`, regenerate the lockfile and commit it:

```bash
rm -rf node_modules package-lock.json && npm install
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
- **API**: define routes as **one module per feature** under `src/lib/api/` — each feature file
  (`notes.ts`, `ai.ts`, `files.ts`, `config.ts`, `system.ts`) is a single chained
  `new Hono<ApiEnv>()…` expression, and `src/lib/api/index.ts` composes them with
  `.route(prefix, subApp)` and exports `type ApiRoutes`. `worker/index.ts` mounts the composed
  app at `/api` and injects storage. To add a feature, add a new module and one `.route(...)` line
  in `index.ts` — don't grow one giant file. Call routes from the SPA only through the typed
  `apiClient` in `src/lib/api.ts` — never raw `fetch`. Request, response, and path-param types flow
  end-to-end from the route definitions, so the client cannot drift out of sync.
- **Request validation**: validate inputs with `@hono/zod-validator` — `zValidator("json", schema)`
  for bodies and `zValidator("param", z.object({ id: z.coerce.number().int() }))` for numeric path
  params — then read the typed value from `c.req.valid("json" | "param")`. Don't hand-roll
  `safeParse` or `Number(c.req.param("id"))` checks in a handler. Multipart uploads (`files.ts`
  POST) are the one exception — they aren't JSON, so they parse the body manually.
- **Client wrappers**: each helper in `src/lib/api.ts` calls the endpoint, then `expectOk(res, "…")`
  (the shared assertion in that file), then returns the parsed body — about three lines, no `if
  (!res.ok) throw` boilerplate. For an endpoint that maps a status to a typed result, branch on
  `res.status` **before** `expectOk` (e.g. `if (res.status === 404) return null`); the doc comment
  on `expectOk` shows this variant.
- **Types**: never use `as` or `unknown` to force types to line up — derive them from their source.
  Responses come typed from `apiClient`; validate request bodies with `zod`, which returns a typed
  value. Reaching for a cast is a signal the type isn't being derived correctly.
- **Storage seam**: routes depend on the `NotesStorage` interface (`src/lib/api/seams.ts` — the
  contracts-only module both the SPA and the Worker implement), never on the Durable Object
  directly; that's what keeps the routes Worker-free so the SPA can import their types. The DO is
  thin: it delegates to **per-feature repository modules** under `worker/storage/` — plain
  functions that take the drizzle `Db` (`worker/storage/notes.ts`, typed via `worker/storage/db.ts`)
  and hold the query bodies. To add storage-backed routes, extend `NotesStorage` in `seams.ts`, add
  repository functions under `worker/storage/`, and have the DO (`worker/storage-do.ts`) delegate to
  them; `worker/index.ts` injects the real stub.
- **AI**: call Workers AI through the `AiRunner` seam (`c.var.ai`), never `env.AI` directly in a
  route — the adapter (`worker/ai-runner.ts`) routes every call through AI Gateway. Workers AI has
  no local simulator, so `npm run dev` runs with `remoteBindings: false` (offline) and **AI calls
  throw in local dev** — they work once deployed. To test AI locally, flip `remoteBindings` to
  `true` in `vite.config.ts` and `wrangler login`; it then bills your real account even in dev.
- **Files/R2**: use the `FileStore` seam (`c.var.files`), never `env.BUCKET` directly. Each App has
  its own R2 bucket (named after the repo, created at deploy), so keys are flat — just use plain
  keys, no prefixing. R2 is simulated locally, so file routes work offline.
- **Database**: edit tables in `worker/schema.ts` (Drizzle ORM), then run `npm run db:generate`
  and commit the new files under `drizzle/`. **Never hand-edit `drizzle/`** — it is generated.
  Row types live in `worker/schema.ts` (e.g. `Note`); import them, don't redefine them.
  Before changing an **existing** table, read *Changing the database schema* below.
- **Routes/UI**: file-based routes in `src/routes/`; shadcn/ui components are preinstalled.
  For entrance motion, wrap a section in `<Reveal>` (`@/components/ui/motion`) — a subtle
  fade + rise on mount. It is pure CSS and auto-disables under reduced-motion. Use `asChild`
  to animate the element directly (no extra `<div>`), `direction` to set the slide axis, and
  `delay` (ms) to stagger siblings. See the home page (`src/routes/index.tsx`) for the pattern.
- **Bindings in `wrangler.jsonc` configure LOCAL DEV only — production bindings are fixed by the
  platform.** (The file's other fields — `main`, compatibility settings, `migrations` — DO feed the
  deploy via the build output.)
  At deploy the AppGarden gateway ignores this file's bindings and gives the app exactly:
  `BUCKET` (this app's own R2 bucket), `STORAGE` (the `StorageDurableObject`), `AI`, `APP_SLUG`
  (the repo name), and `ASSETS` (the built SPA). Three consequences:
  - **Adding a new binding here (KV, D1, queues, …) will work in `npm run dev` and silently NOT
    exist once deployed** — the code will break in production only. If a feature needs a new kind
    of resource, ask AppGarden first instead of building on it.
  - **Never rename or remove `StorageDurableObject` or its export** in `worker/index.ts` — the
    deploy fails (the platform binds that exact class).
  - **Treat `migrations` in `wrangler.jsonc` as append-only history** — the platform deploys only
    the steps the live app is missing; rewriting or deleting past entries breaks every future
    deploy. (Don't edit `name` either — the deployed name is always this repo's name.)
- Use the shadcn UI components and tailwind in all cases - unless there is a very good reason not to.
- **Tables** use tanstack tables when creating tables. See `src/routes/-notes/notes-table.tsx`
  for the `ColumnDef` + `<DataTable>` pattern.
- **Forms** use tanstack forms (`@tanstack/react-form`) when creating forms. The demo note form
  (`src/routes/-notes/note-form.tsx`) is the reference: `useForm({ defaultValues, onSubmit })`, a
  `form.Field` with `validators.onChange`, and `form.Subscribe` gating the submit button.
- **State** use zustand for complex statge management
- **React** write modern React code that a senior developer would write. Avoid using useEffect. Break very large components into smaller ones.
- **Loading / error / empty states** every data view renders the full ladder, not just the happy
  path. The demo home page (`src/routes/index.tsx`) reads data with react-query `useQuery` and, via
  early returns (no nested ternaries), renders: `ui/skeleton` rows while pending → `ui/empty` with a
  Retry while errored → `ui/empty` when there are no rows → the table with data. Route-level
  fallbacks live in `src/components/route-status.tsx` (`RoutePending` uses `ui/spinner`, `RouteError`
  uses `ui/empty`) and are wired as `defaultPendingComponent` / `defaultErrorComponent` on the
  router in `src/main.tsx`. Copy these components rather than reinventing states.
- **Route-local components** components used by a single route live in a **dash-prefixed feature
  folder** (e.g. `src/routes/-notes/`) beside the route file — the `-` prefix keeps TanStack Router
  from turning them into routes. Keep `index.tsx` thin; move tables, forms, and sidebars there.
  Reserve `src/components/` for genuinely cross-route shared components.
- **Data modelling — one table, not many.** When several entity or person types share the same
  shape (e.g. admins and members, or vendors and customers), model them as **one table with a
  `role`/`type` column**, not a cloned table per type. Do not clone tables, routes, or pages that
  differ only by a label — add a column and filter. Fewer moving parts, fewer migrations.
- **Mobile Responsive** Make the app mobile responsive
- **Links not buttons for navigation** Always use a link button when a button purely navigates to a page

## Repo guards and lint rules

A husky pre-commit hook runs `npm run lint && npm run typecheck && npm run check:sizes`; a
commit-msg hook runs `npm run check:migrations`. These hooks are a **local speed bump** — they are
bypassable (`git commit --no-verify`, or a clone where husky never installed the hooks), so don't
rely on them as the only gate. The deploy workflow re-runs `lint`, `typecheck`, `build`, and
`check:sizes`, so the file-size ceiling is enforced at the ship gate regardless of the hooks; the
migration guard is commit-message-based and remains local-only. They exist to catch the mistakes
this file warns about *before* they reach `main`:

- **File size** — `npm run check:sizes` (`scripts/check-file-sizes.mjs`) fails if any non-generated
  source file exceeds **400 lines** (generated/registry files — `src/routeTree.gen.ts`, `drizzle/`,
  `src/components/ui/**`, the lockfile — are exempt). If it trips, split the file, don't raise the
  limit. This is why the API and storage layers are per-feature modules.
- **Migration safety** — `npm run check:migrations` (`scripts/check-migrations.mjs`, run by the
  commit-msg hook) blocks a commit that **modifies or deletes** an already-committed `drizzle/*.sql`
  file (comment-only additions are allowed), and blocks a **new** migration containing `DROP TABLE`,
  `DROP COLUMN`, or a `__new_` table-rebuild unless the commit message carries a `MIGRATION-ACK`
  token. drizzle-kit rebuilds a table via a `__new_` shadow table for many ordinary column
  alterations, so this guard will fire on legitimate changes too — that's deliberate friction. When
  you have read the generated SQL and it's correct, add `MIGRATION-ACK` to your commit message to
  acknowledge it.
- **Biome** — the linter enforces `noNestedTernary` and `noExcessiveCognitiveComplexity`
  (max 15) on the app's own code (shadcn registry code under `src/components/ui/**` is exempt). Use
  early returns and small functions instead of deep ternaries or sprawling handlers.

## Changing the database schema — avoid data loss

Migrations run **inside the deployed app, against live data**: each Durable Object applies any
pending files from `drizzle/` the next time it wakes up, before serving requests. There is no
undo — a bad migration destroys real rows, or crashes the app on startup until a fix is deployed.

- **Prefer additive changes — but still read the SQL.** New tables and new *optional* or
  `.default(...)` columns are the safest kind of change, not a guaranteed-safe one. A `.notNull()`
  column added to an existing table **must** carry a `.default(...)`, or the migration fails on any
  object that already has rows; and a unique constraint, a unique index over existing data, or a
  non-constant default can still fail or make drizzle-kit rebuild the whole table. "Additive"
  lowers the risk — it doesn't remove the next rule.
- **Read the generated SQL before committing.** After `npm run db:generate`, open the new file
  under `drizzle/` and check it does only what you intended. `DROP TABLE`, or a table being
  recreated and its data copied, deserves a second look — if it isn't obviously right, stop.
- **Renames are the trap.** When a table or column is renamed in `worker/schema.ts`,
  drizzle-kit asks whether it's a rename or a drop+create. The wrong answer generates
  `DROP` + `CREATE` and silently discards every row. Answer "rename", and verify the SQL says
  `RENAME`.
- **Remove things in two deploys, never one — and backfill in a migration, not in app code.**
  To reshape or retire a column/table: (1) add the new column/table *and copy the old data across
  in the same deploy* — scaffold a data migration with `drizzle-kit generate --custom` and write
  the `UPDATE` / `INSERT … SELECT` there — then deploy; (2) switch reads to the new shape and
  deploy; (3) only then drop the old column/table, as its own later migration. The copy **must**
  live in migration SQL: each Durable Object runs its own migrations when it next wakes, so a
  backfill written in request-handling code only touches objects that get traffic — and the drop
  migration still runs on every dormant object and deletes the rows that were never copied. If a
  backfill genuinely can't be expressed as SQL, prove every object has been copied before you ship
  the drop.
- **Never edit a migration that has reached `main`.** Deployed objects have already recorded it
  as applied and will never re-run it — editing it only makes old and new objects diverge.
  A fix is always a *new* migration. (This mirrors the append-only `migrations` rule for
  `wrangler.jsonc` above — same reason, different file.)
- **Test the migration on existing data before pushing.** `npm run dev` persists a local SQLite
  copy: add a few rows first, then make the schema change, regenerate, and restart dev. If the
  app errors on startup locally, it would crash the same way in production.
- **Migrations are for schema, not data entry.** A migration file describes table *shape* —
  create/alter/drop. Never embed real or customer data (seed rows, imported records, someone's
  actual notes) in a migration: it runs verbatim on every Durable Object, it can't be edited once
  it reaches `main`, and it puts data in source control. Seed via an admin route or the running app
  instead. (The one exception is a *backfill* that copies data already in the database from an old
  column to a new one, per the two-deploy rule above.)
- **Unsure? Ask AppGarden first** (send an expert question) instead of pushing to find out —
  a failed migration takes the app down for its users until someone ships a fix.

