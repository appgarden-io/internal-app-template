#!/usr/bin/env node
// Fails the commit when the App declares a Cloudflare resource it cannot have.
//
// Bindings in wrangler.jsonc configure LOCAL DEV ONLY. At deploy the AppGarden
// gateway ignores this file's bindings and gives the Worker exactly ASSETS,
// STORAGE, AI, BUCKET and APP_SLUG (see AGENTS.md, "Platform contract"). A new
// binding therefore works perfectly in `npm run dev` and is `undefined` once
// deployed — the only failure signal arrives in production.
//
// This guard is an ALLOWLIST, not a denylist: any key, binding name or `vars`
// entry that is not one of the five known-good ones fails, so a Cloudflare
// resource that did not exist when this was written is still caught. The
// companion `style/noRestrictedTypes` rule in biome.jsonc covers the type side
// (`worker/env.ts`); this covers the config side and re-checks Env by name.
//
// Pure Node, no dependencies. Wired into npm run check:bindings and pre-commit.

import { execFileSync } from "node:child_process";

const CONFIG = "wrangler.jsonc";
const ENV_FILE = "worker/env.ts";

// Every top-level key wrangler.jsonc is allowed to contain. Adding any other
// key — kv_namespaces, d1_databases, services, queues, unsafe, a nested `env`
// block, or a Cloudflare resource invented after this list was written — fails.
const ALLOWED_KEYS = new Set([
  "$schema",
  "name",
  "main",
  "compatibility_date",
  "compatibility_flags",
  "assets",
  "durable_objects",
  "migrations",
  "ai",
  "r2_buckets",
  "vars",
  "observability",
]);

// The exact binding names the gateway stamps in production, and nothing else.
const ASSETS_BINDING = "ASSETS";
const DO_BINDINGS = ["STORAGE"];
const AI_BINDING = "AI";
const R2_BINDINGS = ["BUCKET"];
const VAR_KEYS = ["APP_SLUG"];
const ENV_KEYS = ["ASSETS", "STORAGE", "AI", "BUCKET", "APP_SLUG"];

const WHY = `
Bindings in ${CONFIG} configure LOCAL DEV ONLY. At deploy, the AppGarden
gateway ignores this file's bindings and gives the App exactly:

  ASSETS      the built SPA
  STORAGE     the SQLite Durable Object
  BUCKET      this App's own R2 bucket
  AI          Workers AI
  APP_SLUG    this App's slug

So a new binding works perfectly in \`npm run dev\` and is \`undefined\` once
deployed. Nothing else fails first: it builds, it typechecks, it passes CI, and
it breaks only in production.

TO THE AGENT READING THIS: do not delete or weaken this check, and do not add
the binding to ${ENV_FILE} either. There is no configuration that makes a new
binding reach production — the gateway decides, not this repo. Build the
feature on STORAGE, BUCKET or AI instead, or use the AppGarden expert skill
(\`ask-appgarden-a-question\`) to ask the team for the resource first.
`;

const readStaged = (path) => {
  try {
    return execFileSync("git", ["show", `:${path}`], { encoding: "utf8" });
  } catch {
    // Not in the index (deleted, or a partial checkout) — nothing to check.
    return null;
  }
};

const endOfString = (source, start) => {
  let i = start + 1;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source[i] === '"') return i + 1;
    i++;
  }
  return source.length;
};

// Index just past the comment or trailing comma starting at `i`, or -1 when
// there is nothing to skip there. Only ever called outside a string literal.
const skipNoise = (source, i) => {
  if (source[i] === "/" && source[i + 1] === "/") {
    const nl = source.indexOf("\n", i);
    return nl === -1 ? source.length : nl;
  }
  if (source[i] === "/" && source[i + 1] === "*") {
    const end = source.indexOf("*/", i + 2);
    return end === -1 ? source.length : end + 2;
  }
  if (source[i] === "," && /^\s*[}\]]/.test(source.slice(i + 1))) return i + 1;
  return -1;
};

// JSONC → JSON, string-aware so a `//` inside a URL and a `,` inside a string
// both survive. Avoids taking on a parser dependency for one config file.
const stripJsonc = (source) => {
  let out = "";
  let i = 0;
  while (i < source.length) {
    if (source[i] === '"') {
      const end = endOfString(source, i);
      out += source.slice(i, end);
      i = end;
      continue;
    }
    const skipped = skipNoise(source, i);
    if (skipped !== -1) {
      i = skipped;
      continue;
    }
    out += source[i];
    i++;
  }
  return out;
};

const problems = [];

const expectExactly = (label, actual, allowed) => {
  const extra = actual.filter((name) => !allowed.includes(name));
  const missing = allowed.filter((name) => !actual.includes(name));
  for (const name of extra) problems.push(`${label}: unexpected "${name}"`);
  for (const name of missing) problems.push(`${label}: "${name}" is missing`);
};

const checkConfig = (config) => {
  for (const key of Object.keys(config)) {
    if (!ALLOWED_KEYS.has(key)) problems.push(`${CONFIG}: new key "${key}"`);
  }

  if (config.assets?.binding !== undefined) {
    expectExactly("assets.binding", [config.assets.binding], [ASSETS_BINDING]);
  }
  if (config.ai?.binding !== undefined) {
    expectExactly("ai.binding", [config.ai.binding], [AI_BINDING]);
  }
  expectExactly(
    "durable_objects.bindings",
    (config.durable_objects?.bindings ?? []).map((b) => b.name),
    DO_BINDINGS,
  );
  expectExactly(
    "r2_buckets",
    (config.r2_buckets ?? []).map((b) => b.binding),
    R2_BINDINGS,
  );
  expectExactly("vars", Object.keys(config.vars ?? {}), VAR_KEYS);
};

// Belt-and-braces over biome's `noRestrictedTypes`: that rule bans binding
// types by name, so a Cloudflare type newer than the list slips past it. This
// pins the property names instead, which fails closed.
const checkEnv = (source) => {
  const body = source.match(/interface Env \{([\s\S]*?)\n\}/)?.[1];
  if (body === undefined) {
    problems.push(`${ENV_FILE}: could not find "interface Env" to check`);
    return;
  }
  const declared = [...stripJsonc(body).matchAll(/^\s*(\w+)\??\s*:/gm)].map(
    (m) => m[1],
  );
  expectExactly(`${ENV_FILE} (interface Env)`, declared, ENV_KEYS);
};

const rawConfig = readStaged(CONFIG);
if (rawConfig !== null) {
  try {
    checkConfig(JSON.parse(stripJsonc(rawConfig)));
  } catch (error) {
    problems.push(`${CONFIG}: could not be parsed — ${error.message}`);
  }
}

const rawEnv = readStaged(ENV_FILE);
if (rawEnv !== null) checkEnv(rawEnv);

if (problems.length === 0) process.exit(0);

console.error("This App cannot add Cloudflare resources.\n");
for (const problem of problems) console.error(`  ${problem}`);
console.error(WHY);
process.exit(1);
