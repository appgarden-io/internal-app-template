# Secrets — the `SecretVault` seam (this Client's API keys and tokens)

## What a secret is here

A **tenant secret** is a credential belonging to the Client this App was built
for — a HubSpot private-app token, a Google service-account key, a Slack bot
token, an OpenAI key. Someone on their team creates it in that provider's own
site, then uploads it on the **Tools page of their AppGarden home**, giving it a
name like `hubspot`. This App then reads it by that name at runtime.

Nobody types a credential into this repo, and no agent ever sees its value. That
is the whole point of the seam: the value lives in the platform's vault, travels
to the App only when a request asks for it, and is never committed, logged, or
sent to the browser.

**Names** are lowercase letters, digits and hyphens, starting with a letter or
digit, up to 64 characters — `hubspot`, `google-sheets`, `stripe-live`.

## Shape and why

Routes never call `fetch` against the vault themselves. They depend on the
`SecretVault` interface (`src/lib/api-routes.ts`); the Worker injects the adapter
from `worker/secrets.ts` as `c.var.secrets`. Same shape as `AiRunner` and
`FileStore` — the routes stay Worker-free, so the SPA can keep importing their
types.

The one difference: this adapter wraps no Cloudflare binding. An App runs in the
Client's own Cloudflare account and the vault lives in the platform's, so it is
an HTTPS call to `home.appgarden.io`, authenticated with `APPGARDEN_SECRETS_KEY`
— a Worker secret the deploy gateway stamps in at every deploy.

## Worked example

```ts
// src/lib/api-routes.ts
.get("/crm/contacts", async (c) => {
  // Read it, use it, drop it — never cache it on the DO or hand it to the SPA.
  const token = await c.var.secrets.getSecret("hubspot");

  const response = await fetch(
    "https://api.hubapi.com/crm/v3/objects/contacts",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    return c.json({ error: "HubSpot rejected the request" }, 502);
  }

  const { results } = await response.json<{ results: unknown[] }>();
  return c.json({ contacts: results }, 200);
})
```

If the credential is structured — a Google service-account key is itself JSON —
parse it at the call site. The vault returns the raw value it was given and
never wraps it:

```ts
const credentials = JSON.parse(await c.var.secrets.getSecret("google"));
```

## Rules

- **Never log a secret and never return one to the SPA.** A route may return what
  the third party answered; it must never return the key it asked with. Don't
  write one into the Durable Object or R2 either — the vault is where it lives.
- **Read it per request, inside the handler.** Don't hoist it to a module-level
  variable to "save a call": a Worker keeps module state between requests, so a
  rotated secret would go stale until the App next restarted.
- **Let the error surface.** `getSecret` throws with a message that says what to
  do; wrapping it in a vague 500 hides the fix from the person who can apply it.

## When it fails

| What happened | What it means |
| --- | --- |
| `no APPGARDEN_SECRETS_KEY` | This App hasn't deployed since the vault shipped — push to `main`. Locally, put a key in `.dev.vars`. |
| secrets key was refused | Same fix: redeploy. The Client's key was created or replaced after this App's last deploy. |
| `No secret named "x"` | Nothing is uploaded under that name — add it on the Tools page, or check the spelling. |
| could not reach the vault | Network or timeout (5s). Nothing retries; the request just fails. |

## Local development

`APPGARDEN_SECRETS_KEY` is a secret, so it is **not** in `wrangler.jsonc` — that
file is committed. For `npm run dev`, put it in `.dev.vars` (gitignored):

```text
APPGARDEN_SECRETS_KEY=v1.<the key AppGarden gave you>
```

That reads the Client's **real** secrets from the live vault, so treat local dev
as production access. Without a `.dev.vars` entry, `getSecret` throws a message
telling you exactly that — the rest of the App runs fine.

## Keep `worker/secrets.ts` thin

Every App carries its own copy of that file, so a bug in it can't be fixed
fleet-wide — which is only acceptable while it holds no logic worth fixing. It
reads a binding, makes one request, and names the failures. **Do not add retries,
caching, or token refresh to it.** If an App needs those, that is a platform
change: ask AppGarden (`ask-appgarden-a-question`) rather than growing the file.

## Live wiring

The interface is `SecretVault` in `src/lib/api-routes.ts`; the adapter is
`worker/secrets.ts`; injection happens in `worker/index.ts`. No route uses it out
of the box — it is there for the integration you build.
