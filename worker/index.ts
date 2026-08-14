import { Hono } from "hono";
import { type ApiEnv, type AppStorage, apiRoutes } from "../src/lib/api-routes";
import { slugToAppName } from "../src/lib/app-name";
import { createAiRunner } from "./ai-runner";
import type { Env } from "./env";
import { createFileStore } from "./file-store";
import { createSecretVault } from "./secrets";
import { StorageDurableObject } from "./storage-do";

// The Cloudflare bindings type lives in `./env` so `storage-do.ts` can type
// `DurableObject<Env>` without importing this entrypoint. Re-exported here so
// existing `import { Env } from "./index"` call sites keep working.
export type { Env };
export { StorageDurableObject };

// A single, shared Durable Object instance backs the app. Key the instance by
// tenant, user, or resource id instead if the app needs more than one.
const STORAGE_SINGLETON = "default";

// The DO stub already implements `AppStorage` (same method names + signatures
// as `worker/storage-do.ts`), so this is the concrete side of the storage seam.
const getStorage = (env: Env): AppStorage =>
  env.STORAGE.get(env.STORAGE.idFromName(STORAGE_SINGLETON));

const api = new Hono<{ Bindings: Env } & ApiEnv>()
  // Inject the concrete seam implementations so the Worker-free routes in
  // `api-routes.ts` can reach storage, AI, and files via `c.var.*` without
  // importing any Cloudflare types.
  .use("*", async (c, next) => {
    c.set("storage", getStorage(c.env));
    c.set("ai", createAiRunner(c.env.AI));
    c.set("files", createFileStore(c.env.BUCKET));
    c.set("secrets", createSecretVault(c.env.APPGARDEN_SECRETS_KEY));
    c.set("appName", slugToAppName(c.env.APP_SLUG));
    await next();
  })
  .route("/", apiRoutes);

// All Worker traffic is `/api/*` (see `run_worker_first` in wrangler.jsonc).
// Static assets and SPA fallback are served by the `ASSETS` binding directly.
const app = new Hono<{ Bindings: Env }>().route("/api", api);

export default app;
