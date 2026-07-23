import { DurableObject } from "cloudflare:workers";
import { sql } from "drizzle-orm";
import {
  type DrizzleSqliteDODatabase,
  drizzle,
} from "drizzle-orm/durable-sqlite";
import { migrate } from "drizzle-orm/durable-sqlite/migrator";
import migrations from "../drizzle/migrations";
import type { Env } from "./env";
import * as schema from "./schema";

/**
 * The generic SQLite-backed storage Durable Object for apps built from this
 * template: durable, strongly-consistent, per-object SQLite that ships inside
 * the same Worker script. Registered in `wrangler.jsonc` with a
 * `new_sqlite_classes` migration.
 *
 * Data access goes through Drizzle ORM (`worker/schema.ts` defines the tables;
 * `drizzle/` holds the generated migration journal). Implement your app's
 * `AppStorage` methods here — write the query directly in the method (see
 * `.claude/skills/template-patterns/references/storage.md`). The class name
 * stays generic so the Durable Object never needs renaming (which would force
 * a Cloudflare migration).
 */
export class StorageDurableObject extends DurableObject<Env> {
  private readonly db: DrizzleSqliteDODatabase<typeof schema>;

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

  // The minimal worked example of an `AppStorage` method — implement your real
  // methods the same way, beside it.
  async checkHealth(): Promise<{ status: "ok" }> {
    // A real query (not a static value): a green result proves SQLite is
    // reachable and the constructor's migrations completed.
    await this.db.run(sql`select 1`);
    return { status: "ok" };
  }
}
