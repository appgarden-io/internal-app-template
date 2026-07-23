import type { FileStore, StoredFile } from "../src/lib/api/seams";

/**
 * Concrete side of the `FileStore` seam (`src/lib/api/seams.ts`): adapts the
 * Cloudflare R2 bucket binding (`env.BUCKET`) to the Worker-free interface the
 * routes depend on.
 *
 * Each App has its own R2 bucket (created at deploy, named after the repo), so
 * keys live in a flat space with no prefixing — the bucket itself is the
 * isolation boundary.
 */
export const createFileStore = (bucket: R2Bucket): FileStore => {
  const toStored = (object: R2Object): StoredFile => ({
    key: object.key,
    size: object.size,
    uploadedAt: object.uploaded.toISOString(),
  });

  return {
    async list(): Promise<StoredFile[]> {
      const listed = await bucket.list();
      return listed.objects.map(toStored);
    },

    async put(
      key: string,
      body: ArrayBuffer,
      contentType?: string,
    ): Promise<StoredFile> {
      const object = await bucket.put(key, body, {
        httpMetadata: contentType ? { contentType } : undefined,
      });
      return toStored(object);
    },

    async get(key: string) {
      const object = await bucket.get(key);
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
      const existing = await bucket.head(key);
      if (!existing) {
        return false;
      }

      await bucket.delete(key);
      return true;
    },
  };
};
