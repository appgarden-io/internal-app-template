import { Hono } from "hono";
import type { ApiEnv } from "./seams";

/**
 * App config for the SPA. Currently just the human-readable name (used for the
 * browser tab title); extend with other boot-time, server-known values. Mounted
 * at `/api/config` by `./index`.
 */
export const configRoutes = new Hono<ApiEnv>().get("/", (c) =>
  c.json({ appName: c.var.appName }, 200),
);
