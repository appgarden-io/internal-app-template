import type { FileStore, StoredFile } from "../src/lib/api-routes";

/**
 * Concrete side of the `FileStore` seam (`src/lib/api-routes.ts`): adapts the
 * Cloudflare R2 bucket binding (`env.BUCKET`) to the Worker-free interface the
 * routes depend on.
 *
 * Every App in a Client's Cloudflare account shares one bucket, so each object
 * is namespaced under `<appSlug>/`. Routes work in their own flat key space —
 * the prefix is added here and stripped from everything returned, so it never
 * leaks past this adapter.
 */
export const createFileStore = (
  bucket: R2Bucket,
  appSlug: string,
): FileStore => {
  const prefix = `${appSlug}/`;

  const toStored = (object: R2Object): StoredFile => ({
    key: object.key.slice(prefix.length),
    size: object.size,
    uploadedAt: object.uploaded.toISOString(),
  });

  return {
    async list(): Promise<StoredFile[]> {
      const listed = await bucket.list({ prefix });
      return listed.objects.map(toStored);
    },

    async put(
      key: string,
      body: ArrayBuffer,
      contentType?: string,
    ): Promise<StoredFile> {
      const object = await bucket.put(prefix + key, body, {
        httpMetadata: contentType ? { contentType } : undefined,
      });
      return toStored(object);
    },

    async get(key: string) {
      const object = await bucket.get(prefix + key);
      if (!object) {
        return null;
      }

      return {
        body: object.body,
        contentType: object.httpMetadata?.contentType ?? null,
      };
    },

    async delete(key: string): Promise<boolean> {
      // R2 `delete` is idempotent and never reports whether a key existed, so a
      // `head` first lets the route return an honest 404 vs 204.
      const existing = await bucket.head(prefix + key);
      if (!existing) {
        return false;
      }

      await bucket.delete(prefix + key);
      return true;
    },
  };
};
