import { Hono } from "hono";
import type { ApiEnv } from "./seams";

/**
 * File CRUD on the R2 seam. Mounted at `/api/files` by `./index`.
 *
 * The upload route stays a manual `parseBody` + `instanceof File` check on
 * purpose: multipart form-data is not JSON, so it cannot be expressed as a
 * `zValidator("json"/"param", …)` schema like the notes and AI routes.
 */
export const fileRoutes = new Hono<ApiEnv>()
  .get("/", async (c) => {
    const files = await c.var.files.list();
    return c.json({ files }, 200);
  })
  .post("/", async (c) => {
    // Multipart upload keeps this within the typed client (no raw `fetch`). The
    // file's name becomes its key; the Worker adapter stores it in this App's
    // own bucket.
    const body = await c.req.parseBody();
    const file = body.file;

    if (!(file instanceof File) || file.name.length === 0) {
      return c.json({ error: "file is required" }, 400);
    }

    const stored = await c.var.files.put(
      file.name,
      await file.arrayBuffer(),
      file.type || undefined,
    );
    return c.json({ file: stored }, 201);
  })
  .get("/:key", async (c) => {
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
  .delete("/:key", async (c) => {
    const deleted = await c.var.files.delete(c.req.param("key"));
    return deleted ? c.body(null, 204) : c.json({ error: "not found" }, 404);
  });
