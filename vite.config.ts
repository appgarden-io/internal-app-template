import { fileURLToPath, URL } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // `tanstackRouter` MUST come before `react`.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    // `remoteBindings: false` keeps `npm run dev` fully offline. Durable Object
    // storage and R2 are simulated locally; only Workers AI has no local
    // simulator, and the default (remote bindings on) would open an
    // authenticated session to your Cloudflare account just to boot the dev
    // server. AppGarden Builders have no local Cloudflare credentials, so we opt
    // out: the AI binding is present but only runs once deployed (calling it in
    // local dev throws). To exercise AI locally, flip this to `true` and
    // `wrangler login` with a single account selected.
    cloudflare({ remoteBindings: false }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
