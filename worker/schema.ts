/**
 * Database schema — define your app's real tables here. This file is the
 * single source of truth for row types: the Worker (`worker/storage-do.ts`)
 * and the SPA both import them (via `import type`), so the shape can never
 * drift between server and client.
 *
 * The template ships with no tables. After adding your first table, run
 * `npm run db:generate` and commit the generated files under `drizzle/`.
 * Before ANY change to this file, read
 * `.claude/skills/template-patterns/references/database.md` — it contains the
 * rules that prevent live data loss.
 *
 * Example shape:
 *
 *   import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
 *
 *   export const notes = sqliteTable("notes", {
 *     id: integer("id").primaryKey({ autoIncrement: true }),
 *     text: text("text").notNull(),
 *     createdAt: integer("created_at").notNull(),
 *   });
 *
 *   export type Note = typeof notes.$inferSelect;
 */

// Keeps this file a module while it has no tables, so `import * as schema`
// in `worker/storage-do.ts` stays valid. Remove once a table is exported.
export {};
