#!/usr/bin/env node
// Fails the commit when a hand-written source file grows past 400 lines.
//
// Big files are where demo code stops being copyable: the next agent can no
// longer hold the whole thing in its head, so it clones instead of reusing.
// The 400-line ceiling is a forcing function toward small, single-purpose
// modules (see .claude/skills/template-patterns/ for the patterns to reach for).
//
// Generated and vendored files are exempt — they are not written by hand and
// are not meant to be read or split:
//   - src/routeTree.gen.ts       (TanStack Router, regenerated on build)
//   - drizzle/**                 (drizzle-kit migration output)
//   - src/components/ui/**        (shadcn registry code, copied verbatim)
//   - package-lock.json          (npm lockfile)
//
// Pure Node, no dependencies. Wired into npm run check:sizes and pre-commit.

import { execFileSync } from "node:child_process";

const MAX_LINES = 400;

const SOURCE_GLOBS = ["*.ts", "*.tsx", "*.js", "*.jsx", "*.mjs", "*.cjs"];

const isExempt = (path) =>
  path === "src/routeTree.gen.ts" ||
  path === "package-lock.json" ||
  path.startsWith("drizzle/") ||
  path.startsWith("src/components/ui/");

const listStagedSourceFiles = () => {
  // `--cached` lists the paths in the index (stage 0) — exactly what a commit
  // will contain. A file staged for deletion is already gone from the index, so
  // it never appears; a newly added file appears only once staged. We read the
  // index rather than the working tree on purpose (see countLines): the two can
  // differ, and the commit ships the index. Mirrors check-migrations.mjs, which
  // also evaluates the staged snapshot (`git diff --cached`).
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--", ...SOURCE_GLOBS],
    { encoding: "utf8" },
  );
  return [...new Set(output.split("\n").filter(Boolean))];
};

const countLines = (path) => {
  // Read the staged blob, not the working-tree file: otherwise an oversized file
  // can be `git add`ed, then truncated on disk, and this guard would measure the
  // small working copy while the commit ships the large index blob.
  const contents = execFileSync("git", ["show", `:${path}`], {
    encoding: "utf8",
  });
  if (contents.length === 0) return 0;
  const withoutTrailingNewline = contents.endsWith("\n")
    ? contents.slice(0, -1)
    : contents;
  return withoutTrailingNewline.split("\n").length;
};

const offenders = [];
for (const path of listStagedSourceFiles()) {
  if (isExempt(path)) continue;
  const lines = countLines(path);
  if (lines > MAX_LINES) offenders.push({ path, lines });
}

if (offenders.length === 0) process.exit(0);

offenders.sort((a, b) => b.lines - a.lines);
console.error(
  `Files over the ${MAX_LINES}-line limit — split them into smaller modules:`,
);
for (const { path, lines } of offenders) {
  console.error(`  ${lines}  ${path} (limit ${MAX_LINES})`);
}
process.exit(1);
