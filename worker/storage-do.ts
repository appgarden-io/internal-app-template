import { DurableObject } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import {
  type DrizzleSqliteDODatabase,
  drizzle,
} from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import migrations from "../drizzle/migrations";
import * as schema from "./schema";
import { type Note, notes } from "./schema";

/**
 * The generic SQLite-backed storage Durable Object for apps built from this
 * template: durable, strongly-consistent, per-object SQLite that ships inside
 * the same Worker script. Registered in `wrangler.jsonc` with a
 * `new_sqlite_classes` migration.
 *
 * Data access goes through Drizzle ORM (`worker/schema.ts` defines the tables;
 * `drizzle/` holds the generated migration journal). The note methods below are
 * an example feature built on top of this storage primitive — replace them with
 * your own. The class name stays generic so you never have to rename the
 * Durable Object (which would force a Cloudflare migration) when the app stops
 * being about notes.
 */
export class StorageDurableObject extends DurableObject {
  private readonly db: DrizzleSqliteDODatabase<typeof schema>;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    // Passing `schema` enables the relational query API (`db.query.*`).
    this.db = drizzle(ctx.storage, { schema, logger: false });

    // `blockConcurrencyWhile` guarantees migrations finish before any request
    // is served by this object instance.
    ctx.blockConcurrencyWhile(async () => {
      await migrate(this.db, migrations);
    });
  }

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
}
