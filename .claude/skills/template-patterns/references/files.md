# Files — the `FileStore` seam (R2)

## Shape and why

Routes never touch `env.BUCKET` directly. They depend on the `FileStore`
interface (`src/lib/api-routes.ts`); the Worker injects the adapter from
`worker/file-store.ts` as `c.var.files`. The interface exposes only plain types
(`StoredFile`, `ArrayBuffer`, `ReadableStream`) — no R2 types — so the routes
stay importable by the SPA.

Key facts:

- **Each App has its own R2 bucket** (created at deploy, named after the repo),
  so keys live in a flat space — just use plain keys, no prefixing. The bucket
  itself is the isolation boundary.
- **R2 is simulated locally** — file routes work end-to-end in `npm run dev`
  with no Cloudflare account.
- Keys are single path segments (the `/api/files/:key` routes match one
  segment); switch `:key` to a wildcard param if you need nested keys like
  `avatars/u1.png`.
- **A key must not contain `/`, `?`, `#`, `%` or `\`, and cannot be `.` or
  `..`.** The typed client does not URL-encode path params, so a key containing
  one of those uploads fine, appears in `list()`, and is then permanently
  unreachable *and* undeletable — an orphan in the bucket. `uploadFileSchema`
  rejects them at the door. (`%` is in the list because `%XX` is *decoded* on
  the way back: a key `a%2Fb.txt` looks up `a/b.txt` and misses.) Spaces,
  accents and emoji round-trip fine — don't tighten this into a whitelist. If
  you switch `:key` to a wildcard, `/` becomes legal; the others do not.

## Worked example

Upload stays inside the typed client by using multipart form data (no raw
`fetch`):

```ts
// src/lib/api-routes.ts
// These break the `/api/files/:key` round trip — verified against the running
// Worker. `%` is included because `%XX` decodes on the way back.
const UNSAFE_KEY_CHARS = /[/?#%\\]/;

const isUsableAsKey = (name: string) =>
  name.length > 0 &&
  name !== "." &&
  name !== ".." &&
  !UNSAFE_KEY_CHARS.test(name);

const uploadFileSchema = z.object({
  file: z.instanceof(File).refine((file) => isUsableAsKey(file.name)),
});

.post(
  "/files",
  // Validated at the door, so the client requires `{ form: { file: File } }`
  // — see `api-routes.md`. The file's name becomes its key.
  zValidator("form", uploadFileSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: "file is required" }, 400);
    }
  }),
  async (c) => {
    const { file } = c.req.valid("form");
    const stored = await c.var.files.put(
      file.name,
      await file.arrayBuffer(),
      file.type || undefined,
    );
    return c.json({ file: stored }, 201);
  },
)
```

Note the trade-off this example makes: the client-supplied `file.name` is the
key, and `put` on an existing key silently overwrites it. That's fine for a
simple "my files" screen; if your feature must not overwrite (or accepts
untrusted uploaders), generate the key server-side in the route (e.g.
`crypto.randomUUID()` plus the extension) and return it to the client.

Called from the SPA:

```ts
const uploadFile = async (file: File): Promise<StoredFile> => {
  const res = await apiClient.files.$post({ form: { file } });
  if (!res.ok) {
    throw new Error(`Failed to upload file (${res.status})`);
  }

  const { file: stored } = await res.json();
  return stored;
};
```

The adapter earns its keep — for example, R2's `delete` is idempotent and never
says whether the key existed, so the adapter does a `head` first to let the
route answer an honest 404 vs 204:

```ts
// worker/file-store.ts
async delete(key: string): Promise<boolean> {
  const existing = await bucket.head(key);
  if (!existing) {
    return false;
  }

  await bucket.delete(key);
  return true;
}
```

## Live wiring

The full route set (`GET`/`POST /api/files`, `GET`/`DELETE /api/files/:key`)
is live in `src/lib/api-routes.ts`; the adapter is `worker/file-store.ts`;
injection happens in `worker/index.ts`.
