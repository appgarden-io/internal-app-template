import { defineConfig } from "drizzle-kit";

// Drizzle Kit reads this to generate SQL migrations from `worker/schema.ts`.
// The `durable-sqlite` driver emits a bundled `drizzle/migrations.js` (the
// migrator imports it directly) instead of a runtime filesystem read, since a
// Durable Object cannot read migration files from disk at runtime.
export default defineConfig({
  dialect: "sqlite",
  driver: "durable-sqlite",
  schema: "./worker/schema.ts",
  out: "./drizzle",
});
