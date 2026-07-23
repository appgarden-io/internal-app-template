import { eq } from "drizzle-orm";
import { type Note, notes } from "../schema";
import type { Db } from "./db";

/**
 * Notes repository: plain functions that take the Drizzle `Db` and hold the
 * queries. The storage Durable Object (`worker/storage-do.ts`) delegates its
 * methods here, which keeps the DO thin and these functions testable on their
 * own. Add one repository module per feature as the schema grows.
 */

export const listNotes = (db: Db): Promise<Note[]> =>
  db.query.notes.findMany({
    orderBy: (note, { desc }) => [desc(note.id)],
  });

export const addNote = async (db: Db, text: string): Promise<Note> => {
  const [note] = await db
    .insert(notes)
    .values({ text, createdAt: Date.now() })
    .returning();

  if (!note) {
    throw new Error("Failed to insert note");
  }

  return note;
};

export const deleteNote = async (db: Db, id: number): Promise<boolean> => {
  const deleted = await db
    .delete(notes)
    .where(eq(notes.id, id))
    .returning({ id: notes.id });

  return deleted.length > 0;
};
