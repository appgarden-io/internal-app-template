# Database — Drizzle ORM on a SQLite Durable Object

## Shape and why

`worker/schema.ts` is the single source of truth for tables **and** row types:
the Worker (`worker/storage-do.ts`) and the SPA's typed client both import from
it, so server and client can never drift. The SPA imports row types with
`import type`, which is erased at build — no Worker code reaches the browser
bundle.

```text
worker/schema.ts   the tables (single source of the row types) ── edit this
      │  npm run db:generate
      ▼
drizzle/           generated SQL + migration journal (committed) ── never edit
      │  StorageDurableObject applies pending migrations on startup
      ▼
SQLite Durable Object
```

The flow for any schema change:

1. Edit `worker/schema.ts` (add/alter tables and columns).
2. Run `npm run db:generate` — drizzle-kit writes a new migration into `drizzle/`.
3. **Read the generated SQL** (rules below), then commit both files together.

`drizzle/` is generated but **committed and bundled** — the deployed Worker
cannot read files from disk, so the migrator imports `drizzle/migrations.js`
directly. Never hand-edit anything under `drizzle/`.

(One sanctioned exception: the template ships an intentionally empty
`drizzle/migrations.js` because drizzle-kit emits nothing for a table-free
schema. Your first `npm run db:generate` replaces it with the real journal.)

## Worked example

A table definition and its exported row type:

```ts
// worker/schema.ts
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  createdAt: integer("created_at").notNull(),
});

export type Note = typeof notes.$inferSelect;
```

Import `Note` wherever the row shape is needed (`import type { Note } from
"../../worker/schema"`) — never redefine it.

## Changing the database schema — avoid data loss

Migrations run **inside the deployed app, against live data**: each Durable
Object applies any pending files from `drizzle/` the next time it wakes up,
before serving requests. There is no undo — a bad migration destroys real rows,
or crashes the app on startup until a fix is deployed.

- **Prefer additive changes — but still read the SQL.** New tables and new
  *optional* or `.default(...)` columns are the safest kind of change, not a
  guaranteed-safe one. A `.notNull()` column added to an existing table **must**
  carry a `.default(...)`, or the migration fails on any object that already has
  rows; and a unique constraint, a unique index over existing data, or a
  non-constant default can still fail or make drizzle-kit rebuild the whole
  table. "Additive" lowers the risk — it doesn't remove the next rule.
- **Read the generated SQL before committing.** After `npm run db:generate`,
  open the new file under `drizzle/` and check it does only what you intended.
  `DROP TABLE`, or a table being recreated and its data copied, deserves a
  second look — if it isn't obviously right, stop.
- **Renames are the trap.** When a table or column is renamed in
  `worker/schema.ts`, drizzle-kit asks whether it's a rename or a drop+create.
  The wrong answer generates `DROP` + `CREATE` and silently discards every row.
  Answer "rename", and verify the SQL says `RENAME`.
- **Remove things in two deploys, never one — and backfill in a migration, not
  in app code.** To reshape or retire a column/table: (1) add the new
  column/table *and copy the old data across in the same deploy* — scaffold a
  data migration with `drizzle-kit generate --custom` and write the `UPDATE` /
  `INSERT … SELECT` there — then deploy; (2) switch reads to the new shape and
  deploy; (3) only then drop the old column/table, as its own later migration.
  The copy **must** live in migration SQL: each Durable Object runs its own
  migrations when it next wakes, so a backfill written in request-handling code
  only touches objects that get traffic — and the drop migration still runs on
  every dormant object and deletes the rows that were never copied. If a
  backfill genuinely can't be expressed as SQL, prove every object has been
  copied before you ship the drop.
- **Never edit a migration that has reached `main`.** Deployed objects have
  already recorded it as applied and will never re-run it — editing it only
  makes old and new objects diverge. A fix is always a *new* migration. (This
  mirrors the append-only `migrations` rule for `wrangler.jsonc` in AGENTS.md —
  same reason, different file.)
- **Test the migration on existing data before pushing.** `npm run dev`
  persists a local SQLite copy: add a few rows first, then make the schema
  change, regenerate, and restart dev. If the app errors on startup locally, it
  would crash the same way in production.
- **Unsure? Ask AppGarden first** (send an expert question) instead of pushing
  to find out — a failed migration takes the app down for its users until
  someone ships a fix.

## Live wiring

`worker/storage-do.ts` constructs Drizzle over the Durable Object's storage and
runs pending migrations inside `blockConcurrencyWhile`, so no request is served
before the schema is current.
