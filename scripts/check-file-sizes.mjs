#!/usr/bin/env node
// Fails the commit when a hand-written source file grows past 400 lines.
//
// Big files are where demo code stops being copyable: the next agent can no
// longer hold the whole thing in its head, so it clones instead of reusing.
// The 400-line ceiling is a forcing function toward the per-feature split the
// template models (src/lib/api/*, worker/storage/*, src/routes/-notes/*).
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
import { existsSync, readFileSync } from "node:fs";

const MAX_LINES = 400;

const SOURCE_GLOBS = ["*.ts", "*.tsx", "*.js", "*.jsx", "*.mjs", "*.cjs"];

const isExempt = (path) =>
  path === "src/routeTree.gen.ts" ||
  path === "package-lock.json" ||
  path.startsWith("drizzle/") ||
  path.startsWith("src/components/ui/");

const listSourceFiles = () => {
  // `--cached` covers tracked files and `--others --exclude-standard` covers
  // new, not-yet-committed files, so the guard checks the working tree exactly
  // as it will be committed. Files staged for deletion still show under
  // `--cached`, so we drop any path that no longer exists on disk below.
  const output = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      ...SOURCE_GLOBS,
    ],
    { encoding: "utf8" },
  );
  const unique = new Set(output.split("\n").filter(Boolean));
  return [...unique].filter((path) => existsSync(path));
};

const countLines = (path) => {
  const contents = readFileSync(path, "utf8");
  if (contents.length === 0) return 0;
  const withoutTrailingNewline = contents.endsWith("\n")
    ? contents.slice(0, -1)
    : contents;
  return withoutTrailingNewline.split("\n").length;
};

const offenders = [];
for (const path of listSourceFiles()) {
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
