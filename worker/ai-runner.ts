import type { AiRunner } from "../src/lib/api-routes";

/**
 * Concrete side of the `AiRunner` seam (`src/lib/api-routes.ts`): adapts the
 * Cloudflare Workers AI binding (`env.AI`) to the Worker-free interface the
 * routes depend on.
 *
 * Every call is routed through **AI Gateway** via the `default` gateway (which
 * auto-creates on the first request), so an App's AI traffic gets caching,
 * rate-limiting, and analytics with zero per-App setup. Point `GATEWAY_ID` at a
 * named gateway to share org-level config. Swap `MODEL` for any other recognized
 * Workers AI text model id — an unknown id widens the result type and fails
 * typecheck, so the swap stays type-safe.
 */
const MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";
const GATEWAY_ID = "default";

export const createAiRunner = (ai: Ai): AiRunner => ({
  async generateText(prompt: string): Promise<string> {
    const result = await ai.run(
      MODEL,
      { prompt },
      { gateway: { id: GATEWAY_ID } },
    );

    // The text model's output is `{ response?: string }` — typed end-to-end, so
    // the text is read directly with no cast.
    return result.response ?? "";
  },
});
