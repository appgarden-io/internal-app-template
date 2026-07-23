import { Hono } from "hono";
import { aiRoutes } from "./ai";
import { configRoutes } from "./config";
import { fileRoutes } from "./files";
import { notesRoutes } from "./notes";
import type { ApiEnv } from "./seams";
import { systemRoutes } from "./system";

/**
 * Composition root for the API. Each feature ships its own sub-app (one module
 * per feature under `src/lib/api/`); mounting them with `.route(prefix, subApp)`
 * reproduces the exact same route paths and typed `hc` accessor tree a single
 * flat file would, while keeping each feature small and testable.
 *
 *   root            → /api/example, /api/health   (system)
 *   /config         → /api/config
 *   /notes          → /api/notes, /api/notes/:id
 *   /ai             → /api/ai/generate
 *   /files          → /api/files, /api/files/:key
 *
 * `worker/index.ts` mounts this at `/api` and injects the seam implementations.
 * The SPA talks to it only through the typed client in `src/lib/api.ts`.
 */
export const apiRoutes = new Hono<ApiEnv>()
  .route("/", systemRoutes)
  .route("/config", configRoutes)
  .route("/notes", notesRoutes)
  .route("/ai", aiRoutes)
  .route("/files", fileRoutes);

export type ApiRoutes = typeof apiRoutes;

// Public barrel: the seam contracts (implemented by the Worker adapters) and
// the demo response type live here so importers use one entry point.
export * from "./seams";
export type { ApiExampleResponse } from "./system";
