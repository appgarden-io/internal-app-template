import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

/**
 * The Drizzle handle the storage Durable Object owns, typed against the schema
 * (`worker/schema.ts`) so `db.query.*` is fully typed. Repository modules under
 * `worker/storage/` take a `Db` and hold the actual queries, keeping the DO
 * itself thin.
 *
 * `typeof import("../schema")` is a pure type expression (erased at build), so
 * this module pulls in no runtime code.
 */
export type Db = DrizzleSqliteDODatabase<typeof import("../schema")>;
