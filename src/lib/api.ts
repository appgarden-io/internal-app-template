import { hc } from "hono/client";
// The row type comes from the Drizzle schema (`worker/schema.ts`) — the single
// source of truth shared with the Worker. `import type` is erased at build, so
// no Worker code is pulled into the client bundle.
import type { Note } from "../../worker/schema";
import type { ApiRoutes } from "./api-routes";

export type { Note };

// Typed against the full route surface (`ApiRoutes`), so every request,
// response, and path param below is checked end-to-end — no `fetch`, no casts.
export const apiClient = hc<ApiRoutes>("/api");

export const fetchNotes = async (): Promise<Note[]> => {
  const res = await apiClient.notes.$get();
  if (!res.ok) {
    throw new Error(`Failed to load notes (${res.status})`);
  }

  const { notes } = await res.json();
  return notes;
};

export const createNote = async (text: string): Promise<Note> => {
  const res = await apiClient.notes.$post({ json: { text } });
  if (!res.ok) {
    throw new Error(`Failed to create note (${res.status})`);
  }

  // `res.ok` narrows the response union to the 201 branch, so `.json()` is
  // typed `{ note: Note }` — the cast is gone.
  const { note } = await res.json();
  return note;
};

export const deleteNote = async (id: number): Promise<void> => {
  const res = await apiClient.notes[":id"].$delete({
    param: { id: String(id) },
  });
  if (!res.ok) {
    throw new Error(`Failed to delete note (${res.status})`);
  }
};
