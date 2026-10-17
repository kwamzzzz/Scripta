import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests exercise server handlers directly, without rewriting them into
// browser RPCs or loading the development server's plugins.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"] },
});
