import { queryOptions } from "@tanstack/react-query";
import { fetchNotes } from "@/lib/api";

/**
 * The single source of truth for the notes query. The route reads it with
 * `useQuery`, and both mutations (`note-form.tsx`, `notes-table.tsx`)
 * invalidate `notesQueryOptions.queryKey` — so there is one shared cache key
 * and no stringly-typed keys to keep in sync.
 */
export const notesQueryOptions = queryOptions({
  queryKey: ["notes"],
  queryFn: fetchNotes,
});
