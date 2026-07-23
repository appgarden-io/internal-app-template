// The row type comes from the Drizzle schema (`worker/schema.ts`) — the single
// source of truth shared with the Worker. `import type` is erased at build, so
// no Worker code is pulled into the client bundle.
import type { Note } from "../../../worker/schema";

/**
 * Seam contracts for the API package. Every route module (`notes.ts`, `ai.ts`,
 * `files.ts`, …) depends only on the interfaces below — never on a Cloudflare
 * binding directly. The Worker injects the concrete implementations per request
 * (`worker/index.ts`). Keeping the routes Worker-free is what lets the SPA
 * import their *types* (`ApiRoutes` from `./index`) for an end-to-end typed
 * client without pulling Cloudflare runtime types into the browser bundle.
 *
 * This module imports nothing from the feature route modules, so the package
 * has no import cycle: routes and Worker adapters both depend inward on these
 * contracts.
 */

/**
 * Storage seam. The routes depend on this interface; the Worker injects the
 * real Durable Object stub (`worker/index.ts`), a test can inject a fake. The
 * DO delegates to the repository functions in `worker/storage/notes.ts`.
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
 * R2 storage seam. The Worker injects the real adapter (`worker/file-store.ts`).
 * Each App has its own R2 bucket, so keys are this App's own flat keys. Keys are
 * single path segments (the `/api/files/:key` routes match one segment); switch
 * `:key` to a wildcard param if an App needs nested keys like `avatars/u1.png`.
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
    storage: NotesStorage;
    ai: AiRunner;
    files: FileStore;
    // This App's human-readable name (derived from its slug). Injected as a
    // plain string so the routes stay Worker-free — see `worker/index.ts`.
    appName: string;
  };
};
