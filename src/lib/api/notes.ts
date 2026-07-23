import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "./seams";

export const createNoteSchema = z.object({ text: z.string().trim().min(1) });

/**
 * Notes CRUD — the example feature built on the storage seam. Mounted at
 * `/api/notes` by `./index`.
 *
 * `zValidator("json", …)` replaces a hand-rolled `safeParse`: on a bad body it
 * short-circuits with a 400 before the handler runs, and `c.req.valid("json")`
 * returns the parsed value fully typed — no `as`, no cast. `zValidator("param",
 * …)` with `z.coerce.number()` does the same for the `:id` path segment (which
 * always arrives as a string), so the manual `Number()` / `Number.isInteger`
 * check is gone.
 */
export const notesRoutes = new Hono<ApiEnv>()
  .get("/", async (c) => {
    const notes = await c.var.storage.listNotes();
    return c.json({ notes }, 200);
  })
  .post("/", zValidator("json", createNoteSchema), async (c) => {
    const { text } = c.req.valid("json");
    const note = await c.var.storage.addNote(text);
    return c.json({ note }, 201);
  })
  .delete(
    "/:id",
    zValidator("param", z.object({ id: z.coerce.number().int() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const deleted = await c.var.storage.deleteNote(id);
      return deleted ? c.body(null, 204) : c.json({ error: "not found" }, 404);
    },
  );
