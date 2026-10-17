// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

/**
 * Server functions read secrets from process.env, but Vite only exposes .env
 * files to import.meta.env. Merge every variable from .env / .env.local into
 * process.env for the dev server, so ANTHROPIC_API_KEY in .env.local reaches
 * the AI gateway locally. In Lovable's runtime, secrets arrive in process.env
 * already; this is a no-op there.
 */
const loadServerEnv = {
  name: "praxis-load-env",
  config(_: unknown, { mode }: { mode: string }) {
    Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  },
};

export default defineConfig({
  plugins: [loadServerEnv],
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
