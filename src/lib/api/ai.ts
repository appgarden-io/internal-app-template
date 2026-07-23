import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "./seams";

export const generateTextSchema = z.object({
  prompt: z.string().trim().min(1),
});

/**
 * AI text generation through the AI seam (routed through AI Gateway in
 * `worker/ai-runner.ts`). Mounted at `/api/ai` by `./index`, so this is
 * `/api/ai/generate`.
 */
export const aiRoutes = new Hono<ApiEnv>().post(
  "/generate",
  zValidator("json", generateTextSchema),
  async (c) => {
    const { prompt } = c.req.valid("json");
    const text = await c.var.ai.generateText(prompt);
    return c.json({ text }, 200);
  },
);
