#!/usr/bin/env node
// Guards the drizzle/ migration history at commit time.
//
// Migrations run INSIDE the deployed app against live data: every Durable
// Object records each file as applied the first time it wakes, and never
// re-runs it. So the committed history is append-only — rewriting or deleting
// a file that already reached main makes old and new objects diverge, and a
// DROP silently destroys real rows. This hook enforces three rules on the
// staged drizzle/*.sql files:
//
//   1. Deleting an existing migration          -> always blocked.
//   2. Editing an existing migration           -> allowed ONLY if every added
//      line is a `--` comment or blank and nothing is removed. (This is the
//      exemption that lets the baseline header comment through untouched.)
//   3. A NEW migration containing DROP TABLE /  -> allowed only if the commit
//      DROP COLUMN / a `__new_` table rebuild      message contains the token
//                                                  MIGRATION-ACK.
//
// The token is a deliberate speed bump: those statements can destroy data or
// rebuild a whole table, so the author must acknowledge they read the SQL.
// Renames are surfaced as delete+add (via --no-renames), so a renamed
// migration trips rule 1.
//
// argv[2] is the commit-message file husky passes as "$1". Pure Node, no deps.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ACK_TOKEN = "MIGRATION-ACK";

const DESTRUCTIVE_PATTERNS = [
  { label: "DROP TABLE", regex: /DROP\s+TABLE/i },
  { label: "DROP COLUMN", regex: /DROP\s+COLUMN/i },
  { label: "table rebuild (__new_)", regex: /__new_/ },
];

const git = (args) => execFileSync("git", args, { encoding: "utf8" });

const isCommentOrBlank = (line) => {
  const trimmed = line.trim();
  return trimmed === "" || trimmed.startsWith("--");
};

// Parse a `git diff --cached --unified=0` patch into its added/removed content
// lines. Only one file is diffed per call, so the `diff --git`/index/`---`/
// `+++` header block always precedes the first `@@` hunk; we ignore everything
// until then. That matters because a removed `-- comment` line renders as
// `--- comment` in the patch and would otherwise be mistaken for the `---`
// file header — staying inside hunks avoids the collision.
const readDiff = (path) => {
  const patch = git(["diff", "--cached", "--unified=0", "--", path]);
  const added = [];
  const removed = [];
  let inHunk = false;
  for (const line of patch.split("\n")) {
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith("+")) added.push(line.slice(1));
    else if (line.startsWith("-")) removed.push(line.slice(1));
  }
  return { added, removed };
};

const commitMessageHasAck = () => {
  const messagePath = process.argv[2];
  if (!messagePath) return false;
  try {
    return readFileSync(messagePath, "utf8").includes(ACK_TOKEN);
  } catch {
    return false;
  }
};

const stagedMigrations = () => {
  const output = git([
    "diff",
    "--cached",
    "--name-status",
    "--no-renames",
    "--",
    "drizzle",
  ]);
  const entries = [];
  for (const line of output.split("\n")) {
    if (!line) continue;
    const [status, path] = line.split("\t");
    if (path?.endsWith(".sql")) entries.push({ status: status[0], path });
  }
  return entries;
};

const errors = [];

const checkDeleted = (path) => {
  errors.push(
    `${path}: deleting a committed migration is not allowed — deployed ` +
      `objects already recorded it as applied. Retire a table in a NEW ` +
      `migration instead.`,
  );
};

const checkModified = (path) => {
  const { added, removed } = readDiff(path);
  if (removed.length > 0) {
    errors.push(
      `${path}: editing an existing migration is not allowed (removed ` +
        `${removed.length} line(s)). A fix is always a NEW migration.`,
    );
    return;
  }
  const realSql = added.filter((line) => !isCommentOrBlank(line));
  if (realSql.length > 0) {
    errors.push(
      `${path}: an existing migration may only gain \`--\` comments, but ` +
        `${realSql.length} SQL line(s) were added. A fix is always a NEW ` +
        `migration.`,
    );
  }
};

const checkAdded = (path, hasAck) => {
  if (hasAck) return;
  const { added } = readDiff(path);
  const sql = added.filter((line) => !isCommentOrBlank(line)).join("\n");
  const hits = DESTRUCTIVE_PATTERNS.filter(({ regex }) => regex.test(sql));
  if (hits.length === 0) return;
  const labels = hits.map(({ label }) => label).join(", ");
  errors.push(
    `${path}: new migration contains ${labels}. This can destroy live ` +
      `data — read the SQL, then add the token ${ACK_TOKEN} to your commit ` +
      `message to confirm.`,
  );
};

const migrations = stagedMigrations();
if (migrations.length > 0) {
  const hasAck = commitMessageHasAck();
  for (const { status, path } of migrations) {
    if (status === "D") checkDeleted(path);
    else if (status === "M") checkModified(path);
    else if (status === "A") checkAdded(path, hasAck);
  }
}

if (errors.length === 0) process.exit(0);

console.error("Migration guard blocked this commit:\n");
for (const error of errors) console.error(`  - ${error}`);
console.error(
  `\nSee .claude/skills/template-patterns/references/database.md for the safe path.`,
);
process.exit(1);
