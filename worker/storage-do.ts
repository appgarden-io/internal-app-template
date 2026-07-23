import { DurableObject } from "cloudflare:workers";
// <example:notes>
import { eq } from "drizzle-orm";
// </example:notes>
import {
  type DrizzleSqliteDODatabase,
  drizzle,
} from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import migrations from "../drizzle/migrations";
import * as schema from "./schema";
// <example:notes>
import { type Note, notes } from "./schema";
// </example:notes>

/**
 * The generic SQLite-backed storage Durable Object for apps built from this
 * template: durable, strongly-consistent, per-object SQLite that ships inside
 * the same Worker script. Registered in `wrangler.jsonc` with a
 * `new_sqlite_classes` migration.
 *
 * Data access goes through Drizzle ORM (`worker/schema.ts` defines the tables;
 * `drizzle/` holds the generated migration journal). Implement your app's
 * `AppStorage` methods here. The class name stays generic so the Durable
 * Object never needs renaming (which would force a Cloudflare migration).
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

  // <example:notes>
  // The note methods are the example feature built on this storage primitive —
  // `npm run reset-example` removes them. Implement your real methods the same
  // way.
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
  // </example:notes>
}
