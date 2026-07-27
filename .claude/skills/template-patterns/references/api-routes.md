# API routes — typed Hono definitions

## Shape and why

All routes live in one chained `new Hono<ApiEnv>()` expression in
`src/lib/api-routes.ts`, and the file exports `type ApiRoutes = typeof
apiRoutes`. That type is what makes the client typed end-to-end: request
bodies, responses, status-code unions, and path params all flow from the route
definitions into `apiClient` (see [client-ui.md](client-ui.md)) with no casts.

Four rules keep that guarantee intact:

- **Keep the chain.** Routes must stay in the single chained expression —
  breaking it into separate `app.get(...)` statements silently contributes zero
  routes to the client type. (Composing sub-apps with `.route()` *does* preserve
  it; loose statements do not.)
- **Validate at the door, not inside the handler.** Declare the body with
  `zValidator` from `@hono/zod-validator`. This is what puts the request body
  into the route's type. A handler that instead calls `safeParse` on
  `await c.req.json()` validates correctly at runtime but declares *no* input,
  so the client can neither check a body nor send one — and a route with both a
  path param and a body becomes impossible to call.
  **Always pass the third argument** (the error hook). Without it, the client's
  400 branch is zod's raw `ZodSafeParseError` instead of the `{ error }` shape
  every other response in this file uses.
- **Give every response an explicit status.** `c.json(x)` without one widens to
  the whole success union, so callers can't narrow a 200 apart from a 400.
- **No `as`, no `unknown`.** `zValidator` runs zod's `safeParse` under the hood,
  which *returns* a typed value instead of asserting one. Reaching for a cast
  means the type isn't being derived from its source.

A body Hono can't parse at all is rejected before any validator runs, and its
built-in reply is plain text. The `.onError` at the top of the chain converts
that back to the `{ error }` shape, so the error branch is always JSON.

Routes reach the outside world only through the injected seams — `c.var.storage`,
`c.var.ai`, `c.var.files` — never through Cloudflare bindings. That keeps this
file importable by the SPA (types only, erased at build).

## Worked example

The original notes CRUD, showing the full pattern — validated bodies, typed
status codes, and honest 400/404/204 responses:

```ts
// src/lib/api-routes.ts
const createNoteSchema = z.object({ text: z.string().trim().min(1) });
const updateNoteSchema = z.object({ text: z.string().trim().min(1) });

export const apiRoutes = new Hono<ApiEnv>()
  .get("/notes", async (c) => {
    const notes = await c.var.storage.listNotes();
    return c.json({ notes }, 200);
  })
  .post(
    "/notes",
    zValidator("json", createNoteSchema, (result, c) => {
      if (!result.success) {
        return c.json({ error: "text is required" }, 400);
      }
    }),
    async (c) => {
      const note = await c.var.storage.addNote(c.req.valid("json").text);
      return c.json({ note }, 201);
    },
  )
  // A path param AND a body — the shape of every edit screen. This works only
  // because the body is declared by a `zValidator`. Without one, the client's
  // input type is just `{ param: { id: string } }` and there is nowhere to put
  // the body: `$patch({ param, json })` fails with "'json' does not exist".
  .patch(
    "/notes/:id",
    zValidator("json", updateNoteSchema, (result, c) => {
      if (!result.success) {
        return c.json({ error: "text is required" }, 400);
      }
    }),
    async (c) => {
      const id = Number(c.req.param("id"));

      if (!Number.isInteger(id)) {
        return c.json({ error: "invalid id" }, 400);
      }

      const note = await c.var.storage.updateNote(id, c.req.valid("json").text);
      return note ? c.json({ note }, 200) : c.json({ error: "not found" }, 404);
    },
  )
  .delete("/notes/:id", async (c) => {
    const id = Number(c.req.param("id"));

    if (!Number.isInteger(id)) {
      return c.json({ error: "invalid id" }, 400);
    }

    const deleted = await c.var.storage.deleteNote(id);
    return deleted ? c.body(null, 204) : c.json({ error: "not found" }, 404);
  });
```

Called from the SPA, the body is checked at compile time:

```ts
apiClient.notes[":id"].$patch({ param: { id: "1" }, json: { text: "new" } });
// $patch({ param: { id: "1" }, json: { text: 1 } })  ← type error
// $patch({ param: { id: "1" }, json: {} })           ← type error
```

Response payloads are wrapped in an object (`{ notes }`, `{ note }`) so a route
can grow fields without breaking its callers.

## Live wiring

`GET /api/health` in `src/lib/api-routes.ts` is the minimal live route — it
calls `c.var.storage.checkHealth()` through the seam. `GET /api/config`,
`POST /api/ai/generate`, and the `/api/files` routes show the same pattern
against the other seams.
