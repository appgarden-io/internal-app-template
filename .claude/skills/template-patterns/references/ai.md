# AI — the `AiRunner` seam (Workers AI via AI Gateway)

## Shape and why

Routes never call `env.AI` directly. They depend on the `AiRunner` interface
(`src/lib/api-routes.ts`); the Worker injects the adapter from
`worker/ai-runner.ts` as `c.var.ai`. The adapter concentrates the AI policy in
one place: which model runs, the AI Gateway routing, and output normalization —
so routes just ask for text.

Every call goes through **AI Gateway** (the `default` gateway auto-creates on
first request), which gives caching, rate-limiting, and analytics with zero
per-App setup.

## Worked example

The adapter:

```ts
// worker/ai-runner.ts
const MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";
const GATEWAY_ID = "default";

export const createAiRunner = (ai: Ai): AiRunner => ({
  async generateText(prompt: string): Promise<string> {
    const result = await ai.run(
      MODEL,
      { prompt },
      { gateway: { id: GATEWAY_ID } },
    );

    // The text model's output is `{ response?: string }` — typed end-to-end,
    // so the text is read directly with no cast.
    return result.response ?? "";
  },
});
```

Swapping `MODEL` for another Workers AI text model id stays type-safe — an
unrecognized id widens the result type and fails typecheck.

The route consuming the seam:

```ts
// src/lib/api-routes.ts
const generateTextSchema = z.object({ prompt: z.string().trim().min(1) });

.post("/ai/generate", async (c) => {
  const parsed = generateTextSchema.safeParse(
    await c.req.json().catch(() => null),
  );

  if (!parsed.success) {
    return c.json({ error: "prompt is required" }, 400);
  }

  const text = await c.var.ai.generateText(parsed.data.prompt);
  return c.json({ text });
})
```

## Local dev caveat — AI calls throw offline

Workers AI has **no local simulator**. `npm run dev` runs with
`remoteBindings: false` (fully offline), so **AI calls throw in local dev** —
they work once deployed. To test AI locally, flip `remoteBindings` to `true` in
`vite.config.ts` and `wrangler login`; it then bills your real Cloudflare
account even in dev. Flip it back before committing.

## Live wiring

`POST /api/ai/generate` is live in `src/lib/api-routes.ts`; the adapter is
`worker/ai-runner.ts`; injection happens in `worker/index.ts`.
