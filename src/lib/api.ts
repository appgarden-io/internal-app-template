import { hc } from "hono/client";
import type { ApiRoutes, StoredFile } from "./api-routes";

export type { StoredFile };

// Typed against the full route surface (`ApiRoutes`), so every request,
// response, and path param is checked end-to-end — no `fetch`, no casts.
//
// Call this client directly in your `queryFn` / `mutationFn` / route loader —
// don't wrap it in per-endpoint helper functions (see
// `.claude/skills/template-patterns/references/client-ui.md`).
export const apiClient = hc<ApiRoutes>("/api");
