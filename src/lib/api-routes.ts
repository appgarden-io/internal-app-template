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

/**
 * AI seam (Workers AI via AI Gateway). Same idea as `NotesStorage`: the routes
 * depend on this plain interface, never on the Cloudflare `Ai` binding, so the
 * SPA can still import the route types. The Worker injects the real adapter
 * (`worker/ai-runner.ts`), which routes the call through the AI Gateway.
 */
export interface AiRunner {
  generateText(prompt: string): Promise<string>;
}

/** A single object in the R2 bucket, as the routes/SPA see it (no R2 types). */
export interface StoredFile {
  key: string;
  size: number;
  uploadedAt: string;
}

/**
 * R2 storage seam. The Worker injects the real adapter (`worker/file-store.ts`),
 * which prefixes every key with this App's slug so Apps sharing the one account
 * bucket never collide. Keys here are this App's own flat keys — the prefix is
 * applied and stripped entirely inside the adapter. Keys are single path
 * segments (the `/api/files/:key` routes match one segment); switch `:key` to a
 * wildcard param if an App needs nested keys like `avatars/u1.png`.
 */
export interface FileStore {
  list(): Promise<StoredFile[]>;
  put(
    key: string,
    body: ArrayBuffer,
    contentType?: string,
  ): Promise<StoredFile>;
  get(
    key: string,
  ): Promise<{ body: ReadableStream; contentType: string | null } | null>;
  delete(key: string): Promise<boolean>;
}

/** Hono environment for the routes: the seams the Worker injects per request. */
export type ApiEnv = {
  Variables: { storage: NotesStorage; ai: AiRunner; files: FileStore };
};

const createNoteSchema = z.object({ text: z.string().trim().min(1) });
const generateTextSchema = z.object({ prompt: z.string().trim().min(1) });

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
  })
  // --- AI: text generation through AI Gateway (example) ---
  .post("/ai/generate", async (c) => {
    const parsed = generateTextSchema.safeParse(
      await c.req.json().catch(() => null),
    );

    if (!parsed.success) {
      return c.json({ error: "prompt is required" }, 400);
    }

    const text = await c.var.ai.generateText(parsed.data.prompt);
    return c.json({ text });
  })
  // --- Files: R2 object storage (example) ---
  .get("/files", async (c) => {
    const files = await c.var.files.list();
    return c.json({ files });
  })
  .post("/files", async (c) => {
    // Multipart upload keeps this within the typed client (no raw `fetch`). The
    // file's name becomes its key; the Worker adapter adds this App's prefix.
    const body = await c.req.parseBody();
    const file = body.file;

    if (!(file instanceof File) || file.name.length === 0) {
      return c.json({ error: "file is required" }, 400);
    }

    const stored = await c.var.files.put(
      file.name,
      await file.arrayBuffer(),
      file.type || undefined,
    );
    return c.json({ file: stored }, 201);
  })
  .get("/files/:key", async (c) => {
    const object = await c.var.files.get(c.req.param("key"));

    if (!object) {
      return c.json({ error: "not found" }, 404);
    }

    return c.body(
      object.body,
      200,
      object.contentType ? { "content-type": object.contentType } : undefined,
    );
  })
  .delete("/files/:key", async (c) => {
    const deleted = await c.var.files.delete(c.req.param("key"));
    return deleted ? c.body(null, 204) : c.json({ error: "not found" }, 404);
  });

export type ApiRoutes = typeof apiRoutes;
