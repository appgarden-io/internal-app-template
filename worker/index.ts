import { Hono } from "hono";
// The routes barrel is `src/lib/api/index.ts`. It must be spelled with the
// explicit `/index` subpath: the sibling `src/lib/api.ts` (the SPA's typed
// client) shadows the bare `../src/lib/api` specifier, so a bare import would
// resolve to the client, not this route package.
import {
  type ApiEnv,
  apiRoutes,
  type NotesStorage,
} from "../src/lib/api/index";
import { slugToAppName } from "../src/lib/app-name";
import { createAiRunner } from "./ai-runner";
import type { Env } from "./env";
import { createFileStore } from "./file-store";
import { StorageDurableObject } from "./storage-do";

export { StorageDurableObject };

// A single, shared Durable Object instance backs the demo. Real apps would key
// the instance by tenant, user, or resource id.
const STORAGE_SINGLETON = "default";

// The DO stub already implements `NotesStorage` (same method names + signatures
// as `worker/storage-do.ts`), so this is the concrete side of the storage seam.
const getStorage = (env: Env): NotesStorage =>
  env.STORAGE.get(env.STORAGE.idFromName(STORAGE_SINGLETON));

const api = new Hono<{ Bindings: Env } & ApiEnv>()
  // Inject the concrete seam implementations so the Worker-free routes in
  // `src/lib/api/` can reach storage, AI, and files via `c.var.*` without
  // importing any Cloudflare types.
  .use("*", async (c, next) => {
    c.set("storage", getStorage(c.env));
    c.set("ai", createAiRunner(c.env.AI));
    c.set("files", createFileStore(c.env.BUCKET));
    c.set("appName", slugToAppName(c.env.APP_SLUG));
    await next();
  })
  .route("/", apiRoutes);

// All Worker traffic is `/api/*` (see `run_worker_first` in wrangler.jsonc).
// Static assets and SPA fallback are served by the `ASSETS` binding directly.
const app = new Hono<{ Bindings: Env }>().route("/api", api);

export default app;
