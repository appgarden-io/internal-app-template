#!/usr/bin/env node
/**
 * One-shot removal of the placeholder notes example, run AFTER the app's real
 * feature has been built alongside it (`npm run reset-example`).
 *
 * What it does:
 *   1. Strips every `// <example:notes>` … `// </example:notes>` block from
 *      `src/` and `worker/` (the example code), leaving the reusable seams —
 *      `AppStorage`, `AiRunner`, `FileStore`, the Durable Object shell, the
 *      typed client — untouched.
 *   2. Replaces `src/routes/index.tsx` with a blank starting page IF it still
 *      carries the `// <example:notes file>` marker (i.e. it was never
 *      rewritten for the real app).
 *   3. Wipes the placeholder migration journal in `drizzle/` and regenerates a
 *      clean first migration from the real schema.
 *   4. Formats the touched files and runs the typechecker.
 *
 * SAFE ONLY BEFORE THE FIRST DEPLOY. Step 3 rewrites migration history, which
 * is forbidden once any migration has run against live data (see AGENTS.md).
 * The script refuses to touch `drizzle/` unless the placeholder migration is
 * still present, and it refuses to run at all until `worker/schema.ts` defines
 * at least one real table (pass `--force` to reset a deliberately
 * database-free app).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIRS = ["src", "worker"];
const BLOCK_START = "// <example:notes>";
const BLOCK_END = "// </example:notes>";
const FILE_MARKER = "// <example:notes file>";
// The exact filename of the placeholder migration the template ships with.
// This is the "example era" sentinel: it can only false-negative (skip the
// drizzle/ wipe with a loud warning), never wipe live history. If you ever
// regenerate the template's placeholder migration, update this name to match.
const PLACEHOLDER_MIGRATION = path.join(
  ROOT,
  "drizzle",
  "0000_omniscient_eternals.sql",
);

const HOME_PAGE_REPLACEMENT = `import { createFileRoute } from "@tanstack/react-router";
import { Reveal } from "@/components/ui/motion";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col px-6 py-10">
      <Reveal asChild>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Ready to build
          </h1>
          <p className="text-muted-foreground">
            The example feature has been removed. Build the app's real home
            page here in <code>src/routes/index.tsx</code>.
          </p>
        </div>
      </Reveal>
    </main>
  );
}
`;

const force = process.argv.includes("--force");
const warnings = [];

const listSourceFiles = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(full);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
};

const stripBlocks = (content, file) => {
  const lines = content.split("\n");
  const kept = [];
  let depth = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === BLOCK_START) {
      depth += 1;
      continue;
    }
    if (trimmed === BLOCK_END) {
      if (depth === 0) {
        throw new Error(`${file}: "${BLOCK_END}" without a matching start`);
      }
      depth -= 1;
      continue;
    }
    if (depth === 0) {
      kept.push(line);
    }
  }
  if (depth !== 0) {
    throw new Error(`${file}: "${BLOCK_START}" without a matching end`);
  }
  // Collapse the multi-blank-line gaps that stripping can leave behind.
  return kept.join("\n").replace(/\n{3,}/g, "\n\n");
};

const run = (command) => {
  execSync(command, { cwd: ROOT, stdio: "inherit" });
};

// --- Preflight -------------------------------------------------------------

const sourceFiles = SOURCE_DIRS.flatMap((dir) =>
  listSourceFiles(path.join(ROOT, dir)),
);
const markedFiles = sourceFiles.filter((file) => {
  const content = fs.readFileSync(file, "utf8");
  return content.includes(BLOCK_START) || content.includes(FILE_MARKER);
});
const placeholderMigrationExists = fs.existsSync(PLACEHOLDER_MIGRATION);

if (markedFiles.length === 0 && !placeholderMigrationExists) {
  console.log(
    "Nothing to reset — the example has already been removed. " +
      "Use `npm run db:generate` for schema changes from here on.",
  );
  process.exit(0);
}

const schemaPath = path.join(ROOT, "worker", "schema.ts");
const schemaWithoutExample = stripBlocks(
  fs.readFileSync(schemaPath, "utf8"),
  schemaPath,
);
const realTableCount = (schemaWithoutExample.match(/sqliteTable\(/g) ?? [])
  .length;

if (realTableCount === 0 && !force) {
  console.error(
    "Refusing to reset: worker/schema.ts defines no tables outside the " +
      "example markers.\n\n" +
      "Build the real feature first — study the notes example, add the " +
      "app's real tables, storage methods, routes, and UI alongside it — " +
      "then run `npm run reset-example` to strip the placeholder.\n\n" +
      "If this app genuinely needs no database, rerun with --force.",
  );
  process.exit(1);
}

// Compute every rewrite up front so a bad marker refuses the whole run
// cleanly, instead of failing midway and leaving a half-reset tree.
const plannedWrites = [];
for (const file of markedFiles) {
  const relative = path.relative(ROOT, file);
  const content = fs.readFileSync(file, "utf8");
  if (content.includes(FILE_MARKER)) {
    if (relative !== path.join("src", "routes", "index.tsx")) {
      // Fail fast rather than guess: the whole-file marker is only defined
      // for the example home page.
      console.error(
        `Refusing to reset: ${relative} has an unexpected "${FILE_MARKER}" — ` +
          "that marker only belongs in src/routes/index.tsx. Use block " +
          "markers for everything else.",
      );
      process.exit(1);
    }
    if (!content.includes("fetchNotes")) {
      // The marker is still there but the notes code is not — the page was
      // rewritten for the real app without removing the marker. Overwriting
      // it would silently destroy real work.
      console.error(
        `Refusing to reset: ${relative} still carries "${FILE_MARKER}" but ` +
          "no longer looks like the notes example. If you rewrote this page, " +
          "delete the marker comment block and rerun `npm run reset-example`.",
      );
      process.exit(1);
    }
    plannedWrites.push({
      file,
      relative,
      content: HOME_PAGE_REPLACEMENT,
      verb: "replaced",
    });
  } else {
    try {
      plannedWrites.push({
        file,
        relative,
        content: stripBlocks(content, relative),
        verb: "stripped",
      });
    } catch (error) {
      console.error(`Refusing to reset: ${error.message}`);
      process.exit(1);
    }
  }
}

// --- 1 + 2: strip example blocks / replace the still-example home page -----

const touchedFiles = [];
for (const { file, relative, content, verb } of plannedWrites) {
  fs.writeFileSync(file, content);
  const detail = verb === "replaced" ? " (blank starting page)" : "";
  console.log(`${verb}  ${relative}${detail}`);
  touchedFiles.push(relative);
}

const apiRoutes = fs.readFileSync(
  path.join(ROOT, "src", "lib", "api-routes.ts"),
  "utf8",
);
if (/interface AppStorage\s*\{\s*\}/.test(apiRoutes)) {
  warnings.push(
    "AppStorage (src/lib/api-routes.ts) has no methods left. Add the app's " +
      "real storage methods, or the linter will flag the empty interface.",
  );
}

// --- 3: regenerate a clean first migration ---------------------------------

if (placeholderMigrationExists) {
  const drizzleDir = path.join(ROOT, "drizzle");
  for (const entry of fs.readdirSync(drizzleDir)) {
    // `migrations.d.ts` is hand-written (types for the generated bundle) and
    // is the one file that must survive.
    if (entry === "migrations.d.ts") {
      continue;
    }
    fs.rmSync(path.join(drizzleDir, entry), { recursive: true });
  }
  console.log("wiped     drizzle/ (placeholder migration journal)");
  run("npm run db:generate");
  if (!fs.existsSync(path.join(drizzleDir, "migrations.js"))) {
    // drizzle-kit emits nothing for a table-free schema, but the Durable
    // Object still imports this bundle — write an empty one either way so the
    // tree is never left half-reset with a broken import.
    fs.writeFileSync(
      path.join(drizzleDir, "migrations.js"),
      "export default {\n  journal: { entries: [] },\n  migrations: {},\n};\n",
    );
    console.log(
      "wrote     drizzle/migrations.js (empty — drizzle-kit generated nothing)",
    );
    if (realTableCount > 0) {
      console.error(
        "worker/schema.ts looked like it had real tables, but drizzle-kit " +
          "generated no migration from it (are the tables commented out, or " +
          "not exported?). Fix the schema, then run `npm run db:generate`.",
      );
      process.exit(1);
    }
  }
} else {
  warnings.push(
    "drizzle/ was left untouched: the placeholder migration is already gone, " +
      "so migration history may be live. Never rewrite deployed migrations.",
  );
}

// --- 4: format what changed, then prove the app still compiles -------------

if (touchedFiles.length > 0) {
  try {
    run(`npx biome check --write ${touchedFiles.join(" ")}`);
  } catch {
    warnings.push(
      "Biome could not auto-fix everything it found — run `npm run lint` " +
        "and fix what it reports.",
    );
  }
}

let typecheckFailed = false;
try {
  run("npm run typecheck");
} catch {
  typecheckFailed = true;
}

// --- Summary ---------------------------------------------------------------

console.log("\nExample removed.");
for (const warning of warnings) {
  console.warn(`\nWARNING: ${warning}`);
}
if (typecheckFailed) {
  console.error(
    "\nTypecheck FAILED — fix the errors above before committing. (Most " +
      "common cause: the real feature still references example code.)",
  );
  process.exit(1);
}
console.log(
  "\nTypecheck passed. Review the diff, then commit — from this point on, " +
    "schema changes go through `npm run db:generate` and must follow the " +
    "migration safety rules in AGENTS.md.",
);
