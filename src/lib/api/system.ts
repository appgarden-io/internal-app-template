import { Hono } from "hono";
import type { ApiEnv } from "./seams";

export interface ApiExampleResponse {
  message: string;
  servedAt: string;
}

/**
 * System routes: a demonstration endpoint and a health check. Mounted at the
 * package root (`/api/example`, `/api/health`) by `./index`.
 */
export const systemRoutes = new Hono<ApiEnv>()
  .get("/example", (c) => {
    const response: ApiExampleResponse = {
      message: "Hello from the Hono hc route",
      servedAt: new Date().toISOString(),
    };

    return c.json(response, 200);
  })
  .get("/health", (c) => c.json({ status: "ok" }, 200));
