# API routes — typed Hono definitions

## Shape and why

All routes live in one chained `new Hono<ApiEnv>()` expression in
`src/lib/api-routes.ts`, and the file exports `type ApiRoutes = typeof
apiRoutes`. That type is what makes the client typed end-to-end: request
bodies, responses, status-code unions, and path params all flow from the route
definitions into `apiClient` (see [client-ui.md](client-ui.md)) with no casts.

Two rules keep that guarantee intact:

- **Keep the chain.** Routes must stay in the single chained expression —
  breaking it into separate `app.get(...)` statements loses the accumulated
  type.
- **No `as`, no `unknown`.** Validate request bodies with zod's `safeParse`,
  which *returns* a typed value instead of asserting one. Reaching for a cast
  means the type isn't being derived from its source.

Routes reach the outside world only through the injected seams — `c.var.storage`,
`c.var.ai`, `c.var.files` — never through Cloudflare bindings. That keeps this
file importable by the SPA (types only, erased at build).

## Worked example

The original notes CRUD, showing the full pattern — zod validation, the
malformed-JSON guard, typed status codes, and honest 400/404/204 responses:

```ts
// src/lib/api-routes.ts
const createNoteSchema = z.object({ text: z.string().trim().min(1) });

export const apiRoutes = new Hono<ApiEnv>()
  .get("/notes", async (c) => {
    const notes = await c.var.storage.listNotes();
    return c.json({ notes });
  })
  .post("/notes", async (c) => {
    // `safeParse` yields a typed value with no `as`/`unknown` — the validated
    // shape, not a cast. `c.req.json()` can reject on a malformed body, so the
    // `.catch` feeds `null` (which fails validation) into the same 400 path.
    const parsed = createNoteSchema.safeParse(
      await c.req.json().catch(() => null),
    );

    if (!parsed.success) {
      return c.json({ error: "text is required" }, 400);
    }

    const note = await c.var.storage.addNote(parsed.data.text);
    return c.json({ note }, 201);
  })
  .delete("/notes/:id", async (c) => {
    const id = Number(c.req.param("id"));

    if (!Number.isInteger(id)) {
      return c.json({ error: "invalid id" }, 400);
    }

    const deleted = await c.var.storage.deleteNote(id);
    return deleted ? c.body(null, 204) : c.json({ error: "not found" }, 404);
  });
```

Response payloads are wrapped in an object (`{ notes }`, `{ note }`) so a route
can grow fields without breaking its callers.

## Live wiring

`GET /api/health` in `src/lib/api-routes.ts` is the minimal live route — it
calls `c.var.storage.checkHealth()` through the seam. `GET /api/config`,
`POST /api/ai/generate`, and the `/api/files` routes show the same pattern
against the other seams.
