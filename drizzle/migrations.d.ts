/**
 * Hand-written types for the drizzle-kit–generated `migrations.js` in this
 * directory. `tsc` resolves `import migrations from "../drizzle/migrations"` to
 * THIS declaration and never reads `migrations.js`, so it never sees the `.sql`
 * / JSON imports inside it. Those are resolved natively as strings at build and
 * runtime by the Cloudflare Vite plugin and Wrangler — no bundler config needed.
 *
 * The shape mirrors drizzle-orm's `MigrationConfig` (durable-sqlite migrator).
 * `npm run db:generate` only rewrites the generated `.js`/`.sql`; this contract
 * is stable, so this file is not regenerated.
 */
declare const migrations: {
  journal: {
    entries: {
      idx: number;
      version: string;
      when: number;
      tag: string;
      breakpoints: boolean;
    }[];
  };
  migrations: Record<string, string>;
};

export default migrations;
