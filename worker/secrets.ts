import type { SecretVault } from "../src/lib/api-routes";

/**
 * Concrete side of the `SecretVault` seam (`src/lib/api-routes.ts`): reads one
 * of this Client's uploaded secrets from their AppGarden home at runtime.
 *
 * Unlike the other seams this one adapts no Cloudflare binding — it is one HTTPS
 * call. An App runs in the Client's own Cloudflare account, and the vault lives
 * in the platform's, so the only thing the deploy gateway can hand the App is
 * the credential to ask with: `APPGARDEN_SECRETS_KEY`, stamped in server-side at
 * every deploy. A secret's value therefore never touches this repo, the build,
 * or the agent that wrote the code around it.
 *
 * KEEP THIS FILE THIN — no retries, no caching, no refresh. Every App carries
 * its own copy of it, so a bug here cannot be patched fleet-wide; that is only
 * survivable while there is no logic here worth patching. Behaviour belongs
 * behind the HTTP seam, on the platform's side, where one fix reaches every App.
 * If this file starts wanting real behaviour, that is the signal to ask
 * AppGarden for it (`ask-appgarden-a-question`) rather than to grow the file.
 */

/**
 * The operator-owned host serving every Client's AppGarden home — one public,
 * non-secret address shared by the whole fleet, so it is a constant rather than
 * a binding, exactly as `scripts/deploy-bundle.mjs` hardcodes the deploy
 * gateway. The gateway stamps no binding for it, so a binding would only be
 * `undefined` in production.
 */
const HOME_ORIGIN = "https://home.appgarden.io";

/** This is a cross-account hop inside the App's own request path — bound it. */
const TIMEOUT_MS = 5000;

/**
 * What a refusal means, in words the person reading the logs can act on. There
 * is deliberately no retry behind any of these: a 401 and a 404 both stay true
 * until a human does something, and retrying spends the App's request budget to
 * arrive at the same answer.
 */
const refusalReason = (status: number, name: string): string => {
  switch (status) {
    case 400:
      return `"${name}" is not a usable secret name — use lowercase letters, digits and hyphens (starting with a letter or digit), up to 64 characters.`;
    case 401:
      return "This App's secrets key was refused. Almost always this means the App has not been deployed since the key was created or replaced — push to `main` to redeploy it.";
    case 404:
      return `No secret named "${name}" has been uploaded. Add it on the Tools page of your AppGarden home, then read it again.`;
    case 429:
      return `Too many secret reads at once while reading "${name}". Read a secret once per request rather than in a loop.`;
    default:
      return `The AppGarden secrets vault could not return "${name}" (HTTP ${status}).`;
  }
};

export const createSecretVault = (
  // Typed as possibly missing even though `Env` promises a string: the gateway
  // stamps the key at DEPLOY time, so an App that has not deployed since this
  // shipped genuinely runs without it — as does `npm run dev` unless `.dev.vars`
  // supplies one.
  secretsKey: string | undefined,
): SecretVault => ({
  async getSecret(name: string): Promise<string> {
    if (!secretsKey) {
      throw new Error(
        `Cannot read "${name}": this App has no APPGARDEN_SECRETS_KEY. Push to \`main\` to redeploy it, or add the key to \`.dev.vars\` for local dev.`,
      );
    }

    let response: Response;
    try {
      response = await fetch(
        `${HOME_ORIGIN}/api/secrets/${encodeURIComponent(name)}`,
        {
          // The key rides in the header, never the URL — URLs reach logs and
          // referrers. Nothing here logs the key or the value it fetches.
          headers: { Authorization: `Bearer ${secretsKey}` },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
    } catch (cause) {
      throw new Error(
        `Could not reach the AppGarden secrets vault to read "${name}".`,
        { cause },
      );
    }

    if (!response.ok) {
      throw new Error(refusalReason(response.status, name));
    }

    // The body IS the value, as `text/plain`. A Google service-account key is
    // itself JSON, so the vault never wraps the value in more JSON — parse it
    // here in the caller if the credential happens to be structured.
    return await response.text();
  },
});
