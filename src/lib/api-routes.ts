import { Hono } from "hono";
import { z } from "zod";

/**
 * Storage seam. The routes below depend only on this interface — never on the
 * Cloudflare Durable Object directly. The Worker injects the real DO stub as a
 * request variable (`worker/index.ts`). Keeping the routes Worker-free is what
 * lets the SPA import their *types* (`ApiRoutes`, below) for an end-to-end
 * typed client without pulling Cloudflare runtime types into the browser
 * bundle.
 *
 * Add your app's real storage methods here (and implement them on the Durable
 * Object in `worker/storage-do.ts`) — see
 * `.claude/skills/template-patterns/references/storage.md`.
 */
export interface AppStorage {
  /**
   * Minimal worked example of the seam: implemented on the Durable Object,
   * served at `GET /api/health`, called from the home page via `apiClient`.
   */
  checkHealth(): Promise<{ status: "ok" }>;
}

/**
 * AI seam (Workers AI via AI Gateway). Same idea as `AppStorage`: the routes
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
 * R2 storage seam. The Worker injects the real adapter (`worker/file-store.ts`).
 * Each App has its own bucket, so keys are flat — no prefixing. Keys are single
 * path segments (the `/api/files/:key` routes match one segment); switch `:key`
 * to a wildcard param if an App needs nested keys like `avatars/u1.png`.
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
  Variables: {
    storage: AppStorage;
    ai: AiRunner;
    files: FileStore;
    // This App's human-readable name (derived from its slug). Injected as a
    // plain string so the routes stay Worker-free — see `worker/index.ts`.
    appName: string;
  };
};

const generateTextSchema = z.object({ prompt: z.string().trim().min(1) });

export const apiRoutes = new Hono<ApiEnv>()
  // Health check — the minimal worked example of the storage seam. It threads
  // route → `AppStorage` → Durable Object, so a green response proves the DO
  // is reachable and its migrations applied.
  .get("/health", async (c) => c.json(await c.var.storage.checkHealth()))
  // App config for the SPA. Currently just the human-readable name (used for
  // the browser tab title); extend with other boot-time, server-known values.
  .get("/config", (c) => c.json({ appName: c.var.appName }))
  // --- AI: text generation through AI Gateway ---
  .post("/ai/generate", async (c) => {
    // `safeParse` yields a typed value with no `as`/`unknown` — the validated
    // shape, not a cast. `c.req.json()` can reject on a malformed body, so the
    // `.catch` feeds `null` (which fails validation) into the same 400 path.
    const parsed = generateTextSchema.safeParse(
      await c.req.json().catch(() => null),
    );

    if (!parsed.success) {
      return c.json({ error: "prompt is required" }, 400);
    }

    const text = await c.var.ai.generateText(parsed.data.prompt);
    return c.json({ text });
  })
  // --- Files: R2 object storage ---
  .get("/files", async (c) => {
    const files = await c.var.files.list();
    return c.json({ files });
  })
  .post("/files", async (c) => {
    // Multipart upload keeps this within the typed client (no raw `fetch`). The
    // file's name becomes its key.
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
