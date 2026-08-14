// Type-only self-reference: `STORAGE` is a namespace of this Worker's own
// Durable Object class. The Env <-> storage-do import cycle is erased at build
// (both sides use `import type`), which is the standard `DurableObject<Env>`
// pattern.
import type { StorageDurableObject } from "./storage-do";

/**
 * The Cloudflare bindings this Worker runs against. In production the AppGarden
 * deploy gateway provides exactly these — see AGENTS.md ("Bindings in
 * wrangler.jsonc configure LOCAL DEV only"). `wrangler.jsonc` mirrors them for
 * `npm run dev`.
 */
export interface Env {
  ASSETS: Fetcher;
  STORAGE: DurableObjectNamespace<StorageDurableObject>;
  // Workers AI — routed through AI Gateway in `worker/ai-runner.ts`.
  AI: Ai;
  // R2 object storage — this App's own bucket (one per App), created at deploy.
  // Keys are flat; the bucket is the isolation boundary (see worker/file-store.ts).
  BUCKET: R2Bucket;
  // This App's slug (its repo name), set by the Deploy workflow via
  // `--var APP_SLUG:<repo>`; drives the App's display name (see slugToAppName).
  APP_SLUG: string;
  // This Client's key for reading their uploaded secrets (see worker/secrets.ts).
  // A Worker SECRET, stamped by the deploy gateway — deliberately NOT in
  // `wrangler.jsonc`'s `vars`, which is committed. For `npm run dev`, put it in
  // `.dev.vars` (gitignored); without one it is `undefined` at runtime, which is
  // why `createSecretVault` tolerates a missing key instead of trusting this type.
  APPGARDEN_SECRETS_KEY: string;
}
