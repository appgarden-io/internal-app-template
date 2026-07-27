import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
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

// A key has to survive a round trip through `/api/files/:key`, and the typed
// client does NOT URL-encode path params. A name that fails this uploads fine
// (201), shows up in `list()`, and is then permanently unreachable AND
// undeletable — an orphan in the bucket. Verified against the running Worker:
//
//   /  ?  #   split the path, query and fragment, so the segment never matches
//   %         `%XX` is decoded on the way back, so `a%2Fb.txt` looks up `a/b.txt`
//   \         browsers strip this from a filename before it reaches us; rejected
//             defensively for non-browser clients
//   . / ..    resolve away as path segments
//
// Spaces, accents and emoji round-trip fine — don't tighten this into a
// whitelist, it would reject ordinary filenames.
const UNSAFE_KEY_CHARS = /[/?#%\\]/;

const isUsableAsKey = (name: string) =>
  name.length > 0 &&
  name !== "." &&
  name !== ".." &&
  !UNSAFE_KEY_CHARS.test(name);

const uploadFileSchema = z.object({
  file: z.instanceof(File).refine((file) => isUsableAsKey(file.name)),
});

export const apiRoutes = new Hono<ApiEnv>()
  // A body Hono cannot parse is rejected *before* any `validator` below runs,
  // and Hono's built-in reply for that is plain text. Converting it back here
  // keeps every 400 in this file the `{ error }` shape the route types promise,
  // so `res.json()` is always safe on the error branch.
  .onError((err, c) => {
    if (err instanceof HTTPException && err.status === 400) {
      return c.json({ error: "invalid request body" }, 400);
    }

    throw err;
  })
  // Health check — the minimal worked example of the storage seam. It threads
  // route → `AppStorage` → Durable Object, so a green response proves the DO
  // is reachable and its migrations applied.
  .get("/health", async (c) => c.json(await c.var.storage.checkHealth(), 200))
  // App config for the SPA. Currently just the human-readable name (used for
  // the browser tab title); extend with other boot-time, server-known values.
  .get("/config", (c) => c.json({ appName: c.var.appName }, 200))
  // --- AI: text generation through AI Gateway ---
  .post(
    "/ai/generate",
    // Validating at the door — rather than inside the handler — is what puts
    // the request body into the route's type. `apiClient.ai.generate.$post`
    // now *requires* `{ json: { prompt: string } }` and rejects anything else
    // at compile time. `zValidator` still runs zod's `safeParse` under the
    // hood, so there is still no `as` and no `unknown`.
    //
    // The third argument is not optional in spirit: without it the client's
    // 400 branch is zod's raw `ZodSafeParseError` instead of this file's
    // `{ error }` shape.
    zValidator("json", generateTextSchema, (result, c) => {
      if (!result.success) {
        return c.json({ error: "prompt is required" }, 400);
      }
    }),
    async (c) => {
      const { prompt } = c.req.valid("json");
      const text = await c.var.ai.generateText(prompt);
      return c.json({ text }, 200);
    },
  )
  // --- Files: R2 object storage ---
  .get("/files", async (c) => {
    const files = await c.var.files.list();
    return c.json({ files }, 200);
  })
  .post(
    "/files",
    // Same idea for multipart: the client requires `{ form: { file: File } }`.
    // The file's name becomes its key.
    zValidator("form", uploadFileSchema, (result, c) => {
      if (!result.success) {
        // `result.data` holds the raw form value, so a rejected-but-present
        // file gets an honest message instead of "file is required".
        return c.json(
          {
            error:
              result.data.file instanceof File
                ? "file name cannot contain / ? # % or \\"
                : "file is required",
          },
          400,
        );
      }
    }),
    async (c) => {
      const { file } = c.req.valid("form");
      const stored = await c.var.files.put(
        file.name,
        await file.arrayBuffer(),
        file.type || undefined,
      );
      return c.json({ file: stored }, 201);
    },
  )
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
