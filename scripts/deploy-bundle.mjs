/**
 * Assemble this App's Worker bundle from the Vite build output and POST it to
 * the AppGarden deploy gateway (.github/workflows/deploy.yml's deploy step).
 * Plain Node ESM on purpose — no tsx, no extra dependency; Node 22 ships
 * everything used here (crypto, fetch, FormData, File).
 *
 * The multipart wire shape is the gateway's contract:
 *   - `metadata`        — main_module + compatibility fields + the FULL
 *                         declared migration history (the gateway compares it
 *                         against the deployed script and applies only the new
 *                         steps). Bindings/account/namespace are NOT ours to
 *                         declare — the gateway stamps them server-side from
 *                         this App's registration.
 *   - one part per Worker module — `.js`/`.mjs` as ES modules, everything else
 *     the entry imports (e.g. the drizzle `.sql` migration files) as the module
 *     type wrangler would use (text/plain, wasm, or raw bytes).
 *   - `assets-manifest` — { manifest: {"/path": {hash, size}}, config } for the
 *     built SPA, plus one part per UNIQUE content hash.
 *
 * Everything derives from `dist/<worker>/wrangler.json` — the config the
 * @cloudflare/vite-plugin emitted from wrangler.jsonc — so serving behaviour
 * and migrations have ONE source of truth.
 *
 * Zero secrets: the POST authenticates with the workflow-minted GitHub OIDC
 * token (env DEPLOY_OIDC_TOKEN). Set DEPLOY_DRY_RUN=1 to assemble and print
 * the summary without POSTing (local validation).
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ENDPOINT = "https://deploy.appgarden.io/deploy";

/** The served Content-Type per asset extension; unknown → "" (serve none). */
const ASSET_CONTENT_TYPES = {
  css: "text/css",
  html: "text/html",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript",
  json: "application/json",
  map: "application/json",
  mjs: "text/javascript",
  png: "image/png",
  svg: "image/svg+xml",
  txt: "text/plain",
  webmanifest: "application/manifest+json",
  woff2: "font/woff2",
};

/**
 * The Worker-module type per extension — wrangler's mapping, mirrored: JS is an
 * ES module, wasm is wasm, and anything else a Worker imports (the drizzle
 * `.sql` files here) uploads as a text module. `.bin` is raw bytes.
 */
const MODULE_CONTENT_TYPES = {
  bin: "application/octet-stream",
  js: "application/javascript+module",
  mjs: "application/javascript+module",
  wasm: "application/wasm",
};
const DEFAULT_MODULE_TYPE = "text/plain";

const extOf = (path) => extname(path).slice(1).toLowerCase();

/** CF direct-upload manifest hash: sha256(base64(bytes) + ext) → 32 hex. */
const assetHash = (bytes, path) =>
  createHash("sha256")
    .update(bytes.toString("base64") + extOf(path))
    .digest("hex")
    .slice(0, 32);

const walkFiles = (root) =>
  readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)));

const posix = (path) => path.split(sep).join("/");

const isHidden = (path) =>
  path.split(sep).some((segment) => segment.startsWith("."));

/** Locate the one dist/<worker>/wrangler.json the Vite plugin emitted. */
const findWorkerDistDir = (distDir) => {
  const candidates = readdirSync(distDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(distDir, entry.name))
    .filter((dir) => {
      try {
        readFileSync(join(dir, "wrangler.json"));
        return true;
      } catch {
        return false;
      }
    });
  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one dist/<worker>/wrangler.json, found ${candidates.length} — did the build run?`,
    );
  }
  return candidates[0];
};

export const assembleBundle = (workerDistDir) => {
  const config = JSON.parse(
    readFileSync(join(workerDistDir, "wrangler.json"), "utf8"),
  );

  const form = new FormData();
  const metadata = {
    compatibility_date: config.compatibility_date,
    compatibility_flags: config.compatibility_flags ?? [],
    main_module: config.main,
  };
  // The FULL declared migration history, verbatim — the gateway computes the
  // delta against the deployed script's current tag.
  if (Array.isArray(config.migrations) && config.migrations.length > 0) {
    metadata.migrations = config.migrations;
  }
  if (config.observability !== undefined) {
    metadata.observability = config.observability;
  }
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
  );

  // Every non-hidden file beside the emitted config is a Worker module: the
  // entry (+ any split chunks) as ES modules, imported non-JS files (.sql) as
  // their wrangler module type. wrangler.json itself and .vite/ stay local.
  const moduleFiles = walkFiles(workerDistDir).filter(
    (path) => !isHidden(path) && posix(path) !== "wrangler.json",
  );
  if (!moduleFiles.map(posix).includes(config.main)) {
    throw new Error(
      `Build output has no main module "${config.main}" under ${workerDistDir}.`,
    );
  }
  for (const path of moduleFiles) {
    const name = posix(path);
    form.append(
      name,
      new File([readFileSync(join(workerDistDir, path))], name, {
        type: MODULE_CONTENT_TYPES[extOf(path)] ?? DEFAULT_MODULE_TYPE,
      }),
    );
  }

  // The client assets: manifest keyed by serve path, one file part per UNIQUE
  // hash. Dotfiles (.assetsignore, .vite) never ship.
  const assetsDir = join(workerDistDir, config.assets.directory);
  const manifest = {};
  const seenHashes = new Set();
  let totalAssetBytes = 0;
  const assetFiles = walkFiles(assetsDir).filter((path) => !isHidden(path));
  for (const path of assetFiles) {
    const bytes = readFileSync(join(assetsDir, path));
    const hash = assetHash(bytes, path);
    manifest[`/${posix(path)}`] = { hash, size: bytes.length };
    totalAssetBytes += bytes.length;
    if (!seenHashes.has(hash)) {
      seenHashes.add(hash);
      form.append(
        hash,
        new File([bytes], hash, {
          type: ASSET_CONTENT_TYPES[extOf(path)] ?? "",
        }),
      );
    }
  }
  if (assetFiles.length === 0) {
    throw new Error(`No client assets found under ${assetsDir}.`);
  }

  form.append(
    "assets-manifest",
    new Blob(
      [
        JSON.stringify({
          config: {
            html_handling: config.assets.html_handling,
            not_found_handling: config.assets.not_found_handling,
            run_worker_first: config.assets.run_worker_first,
          },
          manifest,
        }),
      ],
      { type: "application/json" },
    ),
  );

  return {
    form,
    summary: {
      assetCount: assetFiles.length,
      migrationCount: metadata.migrations?.length ?? 0,
      moduleCount: moduleFiles.length,
      totalAssetBytes,
    },
  };
};

// The gateway answers only after the full deploy (tag lookup, bucket ensure,
// asset session + uploads, script PUT, provenance row) — 5 minutes clears that
// comfortably while still failing a hung POST fast. Re-runs are idempotent.
const POST_TIMEOUT_MS = 300_000;

const main = async () => {
  const workerDistDir = findWorkerDistDir(
    fileURLToPath(new URL("../dist", import.meta.url)),
  );
  const { form, summary } = assembleBundle(workerDistDir);
  process.stdout.write(
    `Assembled ${summary.moduleCount} module(s), ${summary.assetCount} asset file(s) (${summary.totalAssetBytes} bytes), ${summary.migrationCount} declared migration(s).\n`,
  );

  if (process.env.DEPLOY_DRY_RUN === "1") {
    process.stdout.write("DEPLOY_DRY_RUN=1 — skipping the POST.\n");
    return;
  }

  const token = process.env.DEPLOY_OIDC_TOKEN;
  if (!token) {
    throw new Error("DEPLOY_OIDC_TOKEN is not set (the workflow mints it).");
  }
  const endpoint = process.env.DEPLOY_GATEWAY_URL ?? DEFAULT_ENDPOINT;
  const response = await fetch(endpoint, {
    body: form,
    headers: { Authorization: `Bearer ${token}` },
    method: "POST",
    signal: AbortSignal.timeout(POST_TIMEOUT_MS),
  });
  // The gateway answers a JSON report on success AND failure — always surface it.
  process.stdout.write(`${await response.text()}\n`);
  if (!response.ok) {
    throw new Error(`Deploy gateway answered ${response.status}; see above.`);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
