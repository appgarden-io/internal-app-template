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
- **API**: define routes in `src/lib/api-routes.ts` (Hono). `worker/index.ts` mounts them at
  `/api` and injects storage. Call them from the SPA only through the typed `apiClient` in
  `src/lib/api.ts` — never raw `fetch`. Request, response, and path-param types flow end-to-end
  from the route definitions, so the client cannot drift out of sync.
- **Types**: never use `as` or `unknown` to force types to line up — derive them from their source.
  Responses come typed from `apiClient`; validate request bodies with `zod` (`safeParse`), which
  returns a typed value. Reaching for a cast is a signal the type isn't being derived correctly.
- **Storage seam**: routes depend on the `NotesStorage` interface (`src/lib/api-routes.ts`), never
  on the Durable Object directly — that's what keeps the routes Worker-free so the SPA can import
  their types. To add storage-backed routes, extend `NotesStorage` and implement it on the DO
  (`worker/storage-do.ts`); `worker/index.ts` injects the real stub.
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
- **Routes/UI**: file-based routes in `src/routes/`; shadcn/ui components are preinstalled.
  For entrance motion, wrap a section in `<Reveal>` (`@/components/ui/motion`) — a subtle
  fade + rise on mount. It is pure CSS and auto-disables under reduced-motion. Use `asChild`
  to animate the element directly (no extra `<div>`), `direction` to set the slide axis, and
  `delay` (ms) to stagger siblings. See the home page (`src/routes/index.tsx`) for the pattern.
- **`wrangler.jsonc` configures LOCAL DEV only — production bindings are fixed by the platform.**
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
- **Tables** use tanstack tables when creating tables
- **Forms** use tanstack forms when creating forms
- **State** use zustand for complex statge management
- **React** write modern React code that a senior developer would write. Avoid using useEffect. Break very large components into smaller ones.
- **Mobile Responsive** Make the app mobile responsive
- **Links not buttons for navigation** Always use a link button when a button purely navigates to a page

