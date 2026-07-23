# Storage — the `AppStorage` seam

## Shape and why

Routes never touch the Durable Object directly. They depend on the plain
`AppStorage` interface (`src/lib/api-routes.ts`); the Worker injects the real
DO stub per request (`worker/index.ts`). What this buys:

- **The routes stay Worker-free**, so the SPA can import their *types*
  (`ApiRoutes`) for an end-to-end typed client without pulling Cloudflare
  runtime types into the browser bundle. This type-erasure boundary is the
  load-bearing part of the design.
- The DO stub already satisfies the interface (same method names and
  signatures), so there is no adapter class to maintain for storage.

To add a storage-backed feature, touch exactly three places:

1. Add the method to `AppStorage` in `src/lib/api-routes.ts`.
2. Implement it on `StorageDurableObject` in `worker/storage-do.ts` — write the
   Drizzle query **directly in the method**. Don't extract a repository layer;
   the query's real context (migrations, concurrency, the DO lifecycle) lives
   here, and indirection just moves the query away from it.
3. Call it from a route via `c.var.storage`.

## Worked example

The interface methods, from the original notes feature:

```ts
// src/lib/api-routes.ts
export interface AppStorage {
  listNotes(): Promise<Note[]>;
  addNote(text: string): Promise<Note>;
  deleteNote(id: number): Promise<boolean>;
}
```

Their implementation on the Durable Object:

```ts
// worker/storage-do.ts
listNotes(): Promise<Note[]> {
  return this.db.query.notes.findMany({
    orderBy: (note, { desc }) => [desc(note.id)],
  });
}

async addNote(text: string): Promise<Note> {
  const [note] = await this.db
    .insert(notes)
    .values({ text, createdAt: Date.now() })
    .returning();

  if (!note) {
    throw new Error("Failed to insert note");
  }

  return note;
}

async deleteNote(id: number): Promise<boolean> {
  const deleted = await this.db
    .delete(notes)
    .where(eq(notes.id, id))
    .returning({ id: notes.id });

  return deleted.length > 0;
}
```

And the injection that closes the seam (already in place — you never need to
change it):

```ts
// worker/index.ts
const getStorage = (env: Env): AppStorage =>
  env.STORAGE.get(env.STORAGE.idFromName(STORAGE_SINGLETON));

// …
.use("*", async (c, next) => {
  c.set("storage", getStorage(c.env));
  // …
});
```

## Live wiring

`AppStorage.checkHealth()` is the wired example: declared in
`src/lib/api-routes.ts`, implemented in `worker/storage-do.ts`, served at
`GET /api/health`. Follow its thread, then add your methods beside it.

A single shared DO instance (`STORAGE_SINGLETON` in `worker/index.ts`) backs
the app. Key by tenant/user/resource id instead only if the app truly needs
more than one database.

Never rename `StorageDurableObject` or remove its export from
`worker/index.ts` — the deploy platform binds that exact class name.
