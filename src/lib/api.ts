import { hc } from "hono/client";
// The row type comes from the Drizzle schema (`worker/schema.ts`) — the single
// source of truth shared with the Worker. `import type` is erased at build, so
// no Worker code is pulled into the client bundle.
import type { Note } from "../../worker/schema";
// The route package's barrel is `./api/index`. It is spelled with the explicit
// `/index` subpath because this file (`api.ts`) shadows the bare `./api`
// specifier — see the note in `worker/index.ts`.
import type { ApiRoutes, StoredFile } from "./api/index";

export type { Note, StoredFile };

// Typed against the full route surface (`ApiRoutes`), so every request,
// response, and path param below is checked end-to-end — no `fetch`, no casts.
export const apiClient = hc<ApiRoutes>("/api");

/**
 * Asserts a Hono `hc` response succeeded, narrowing it to its OK member so the
 * following `res.json()` is typed as the success body — no cast. `hc` types
 * `res.ok` as a literal `true`/`false` per status, so `Extract<T, { ok: true }>`
 * picks the success branch of the response union with no `as`.
 *
 * Typed-error variant — to map a specific status to a value instead of throwing,
 * branch on `res.status` BEFORE calling `expectOk`. For example, treating a
 * missing file as `null` rather than throwing (uses the real GET /files/:key
 * route, so this snippet type-checks as written):
 *
 *   const res = await apiClient.files[":key"].$get({ param: { key } });
 *   if (res.status === 404) return null;
 *   expectOk(res, "Failed to download file");
 *   return res.blob();
 */
function expectOk<T extends { ok: boolean; status: number }>(
  res: T,
  label: string,
): asserts res is Extract<T, { ok: true }> {
  if (!res.ok) {
    throw new Error(`${label} (${res.status})`);
  }
}

// --- App config ---

export const fetchAppName = async (): Promise<string> => {
  const res = await apiClient.config.$get();
  expectOk(res, "Failed to load app config");

  const { appName } = await res.json();
  return appName;
};

export const fetchNotes = async (): Promise<Note[]> => {
  const res = await apiClient.notes.$get();
  expectOk(res, "Failed to load notes");

  const { notes } = await res.json();
  return notes;
};

export const createNote = async (text: string): Promise<Note> => {
  const res = await apiClient.notes.$post({ json: { text } });
  expectOk(res, "Failed to create note");

  const { note } = await res.json();
  return note;
};

export const deleteNote = async (id: number): Promise<void> => {
  const res = await apiClient.notes[":id"].$delete({
    param: { id: String(id) },
  });
  expectOk(res, "Failed to delete note");
};

// --- AI: text generation through AI Gateway ---

export const generateText = async (prompt: string): Promise<string> => {
  const res = await apiClient.ai.generate.$post({ json: { prompt } });
  expectOk(res, "Failed to generate text");

  const { text } = await res.json();
  return text;
};

// --- Files: R2 object storage ---

export const listFiles = async (): Promise<StoredFile[]> => {
  const res = await apiClient.files.$get();
  expectOk(res, "Failed to list files");

  const { files } = await res.json();
  return files;
};

export const uploadFile = async (file: File): Promise<StoredFile> => {
  const res = await apiClient.files.$post({ form: { file } });
  expectOk(res, "Failed to upload file");

  const { file: stored } = await res.json();
  return stored;
};

export const downloadFile = async (key: string): Promise<Blob> => {
  const res = await apiClient.files[":key"].$get({ param: { key } });
  expectOk(res, "Failed to download file");

  return res.blob();
};

export const deleteFile = async (key: string): Promise<void> => {
  const res = await apiClient.files[":key"].$delete({ param: { key } });
  expectOk(res, "Failed to delete file");
};
