import { Hono } from "hono";
import {
  type ApiEnv,
  apiRoutes,
  type NotesStorage,
} from "../src/lib/api-routes";
import { StorageDurableObject } from "./storage-do";

export { StorageDurableObject };

export interface Env {
  ASSETS: Fetcher;
  STORAGE: DurableObjectNamespace<StorageDurableObject>;
}

// A single, shared Durable Object instance backs the demo. Real apps would key
// the instance by tenant, user, or resource id.
const STORAGE_SINGLETON = "default";

// The DO stub already implements `NotesStorage` (same method names + signatures
// as `worker/storage-do.ts`), so this is the concrete side of the storage seam.
const getStorage = (env: Env): NotesStorage =>
  env.STORAGE.get(env.STORAGE.idFromName(STORAGE_SINGLETON));

const api = new Hono<{ Bindings: Env } & ApiEnv>()
  // Inject the DO stub so the Worker-free routes in `api-routes.ts` can reach
  // storage via `c.var.storage` without importing any Cloudflare types.
  .use("*", async (c, next) => {
    c.set("storage", getStorage(c.env));
    await next();
  })
  .route("/", apiRoutes);

// All Worker traffic is `/api/*` (see `run_worker_first` in wrangler.jsonc).
// Static assets and SPA fallback are served by the `ASSETS` binding directly.
const app = new Hono<{ Bindings: Env }>().route("/api", api);

export default app;
