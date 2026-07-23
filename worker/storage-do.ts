import { DurableObject } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import migrations from "../drizzle/migrations";
import type { Env } from "./env";
import type { Note } from "./schema";
import * as schema from "./schema";
import type { Db } from "./storage/db";
import * as notesRepo from "./storage/notes";

/**
 * The generic SQLite-backed storage Durable Object for apps built from this
 * template: durable, strongly-consistent, per-object SQLite that ships inside
 * the same Worker script. Registered in `wrangler.jsonc` with a
 * `new_sqlite_classes` migration.
 *
 * Data access goes through Drizzle ORM (`worker/schema.ts` defines the tables;
 * `drizzle/` holds the generated migration journal). This object stays thin: it
 * owns the `Db` handle and runs migrations, then delegates each method to a
 * repository module (`worker/storage/notes.ts`). The note methods are an example
 * feature built on top of this storage primitive — replace them with your own.
 * The class name stays generic so you never have to rename the Durable Object
 * (which would force a Cloudflare migration) when the app stops being about
 * notes.
 *
 * MIGRATIONS ARE APPLIED TO LIVE DATA ON STARTUP. The first deploy runs the
 * shipped `drizzle/0000_*.sql` against every Durable Object; each object then
 * records it as applied and never re-runs it. So an already-committed migration
 * must NEVER be rewritten, reordered, or deleted — doing so makes old and new
 * objects diverge and can crash startup. To retire the example `notes` table,
 * add a NEW migration (see AGENTS.md, "Changing the database schema").
 */
export class StorageDurableObject extends DurableObject<Env> {
  private readonly db: Db;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Passing `schema` enables the relational query API (`db.query.*`).
    this.db = drizzle(ctx.storage, { schema, logger: false });

    // `blockConcurrencyWhile` guarantees migrations finish before any request
    // is served by this object instance.
    ctx.blockConcurrencyWhile(async () => {
      await migrate(this.db, migrations);
    });
  }

  listNotes(): Promise<Note[]> {
    return notesRepo.listNotes(this.db);
  }

  addNote(text: string): Promise<Note> {
    return notesRepo.addNote(this.db, text);
  }

  deleteNote(id: number): Promise<boolean> {
    return notesRepo.deleteNote(this.db, id);
  }
}
