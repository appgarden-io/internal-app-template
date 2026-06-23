import { Hono } from "hono";
import {
  type ApiEnv,
  apiRoutes,
  type NotesStorage,
} from "../src/lib/api-routes";
import { createAiRunner } from "./ai-runner";
import { createFileStore } from "./file-store";
import { StorageDurableObject } from "./storage-do";

export { StorageDurableObject };

export interface Env {
  ASSETS: Fetcher;
  STORAGE: DurableObjectNamespace<StorageDurableObject>;
  // Workers AI — routed through AI Gateway in `worker/ai-runner.ts`.
  AI: Ai;
  // R2 object storage, shared across the account's Apps; `worker/file-store.ts`
  // namespaces keys by `APP_SLUG`.
  BUCKET: R2Bucket;
  // This App's slug (its repo name), set by the Deploy workflow via
  // `--var APP_SLUG:<repo>`; the R2 key prefix that isolates this App's objects.
  APP_SLUG: string;
}

// A single, shared Durable Object instance backs the demo. Real apps would key
// the instance by tenant, user, or resource id.
const STORAGE_SINGLETON = "default";

// The DO stub already implements `NotesStorage` (same method names + signatures
// as `worker/storage-do.ts`), so this is the concrete side of the storage seam.
const getStorage = (env: Env): NotesStorage =>
  env.STORAGE.get(env.STORAGE.idFromName(STORAGE_SINGLETON));

const api = new Hono<{ Bindings: Env } & ApiEnv>()
  // Inject the concrete seam implementations so the Worker-free routes in
  // `api-routes.ts` can reach storage, AI, and files via `c.var.*` without
  // importing any Cloudflare types.
  .use("*", async (c, next) => {
    c.set("storage", getStorage(c.env));
    c.set("ai", createAiRunner(c.env.AI));
    c.set("files", createFileStore(c.env.BUCKET, c.env.APP_SLUG));
    await next();
  })
  .route("/", apiRoutes);

// All Worker traffic is `/api/*` (see `run_worker_first` in wrangler.jsonc).
// Static assets and SPA fallback are served by the `ASSETS` binding directly.
const app = new Hono<{ Bindings: Env }>().route("/api", api);

export default app;
