import { Hono } from "hono";
import { z } from "zod";
// The row type comes from the Drizzle schema (`worker/schema.ts`) — the single
// source of truth shared with the Worker. `import type` is erased at build, so
// no Worker code is pulled into the client bundle.
import type { Note } from "../../worker/schema";

export interface ApiExampleResponse {
  message: string;
  servedAt: string;
}

/**
 * Storage seam. The routes below depend only on this interface — never on the
 * Cloudflare Durable Object directly. The Worker injects the real DO stub as a
 * request variable (`worker/index.ts`); a test can inject a fake. Keeping the
 * routes Worker-free is what lets the SPA import their *types* (`ApiRoutes`,
 * below) for an end-to-end typed client without pulling Cloudflare runtime
 * types into the browser bundle.
 */
export interface NotesStorage {
  listNotes(): Promise<Note[]>;
  addNote(text: string): Promise<Note>;
  deleteNote(id: number): Promise<boolean>;
}

/** Hono environment for the routes: the injected `storage` is the only var. */
export type ApiEnv = { Variables: { storage: NotesStorage } };

const createNoteSchema = z.object({ text: z.string().trim().min(1) });

export const apiRoutes = new Hono<ApiEnv>()
  .get("/example", (c) => {
    const response: ApiExampleResponse = {
      message: "Hello from the Hono hc route",
      servedAt: new Date().toISOString(),
    };

    return c.json(response);
  })
  .get("/health", (c) => c.json({ status: "ok" }))
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

export type ApiRoutes = typeof apiRoutes;
