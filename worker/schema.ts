import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * PLACEHOLDER schema — the example `notes` table behind the demo storage
 * Durable Object. Replace it with your app's real tables, then regenerate the
 * migration journal with `npm run db:generate` (writes to `drizzle/`, which is
 * committed). The Durable Object applies pending migrations on startup.
 *
 * This file is the single source of truth for the `Note` row type: the Worker
 * (`worker/storage-do.ts`) and the SPA's typed API client (`src/lib/api.ts`)
 * both import it, so the shape can never drift between server and client.
 */
export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  createdAt: integer("created_at").notNull(),
});

export type Note = typeof notes.$inferSelect;
