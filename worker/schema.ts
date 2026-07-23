import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Database schema — define your app's real tables here. This file is the
 * single source of truth for row types: the Worker (`worker/storage-do.ts`)
 * and the SPA's typed API client (`src/lib/api.ts`) both import them, so the
 * shape can never drift between server and client.
 */
// <example:notes>
// The `notes` table is the PLACEHOLDER example. Add your real tables alongside
// it, then run `npm run reset-example` — it removes the example and
// regenerates a clean migration journal in `drizzle/`. (After the first
// deploy, never remove tables that way — see AGENTS.md.)
export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  createdAt: integer("created_at").notNull(),
});

export type Note = typeof notes.$inferSelect;
// </example:notes>
