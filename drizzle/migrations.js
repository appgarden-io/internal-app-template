// Empty migration journal, hand-written as the template ships with no tables
// and drizzle-kit emits nothing for a table-free schema — the one sanctioned
// exception to "never hand-edit drizzle/". The Durable Object imports this
// bundle unconditionally and `migrate()` no-ops on the empty journal. Your
// first `npm run db:generate` (after adding a table to `worker/schema.ts`)
// overwrites this file with the real generated journal.
export default {
  journal: { entries: [] },
  migrations: {},
};
