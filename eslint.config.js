import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    // Lovable regenerates these on every sync, so a fix made here is erased
    // on the next one and a complaint about them is not actionable. They are
    // still typechecked; they are just not ours to style.
    ignores: [
      "src/routeTree.gen.ts",
      "src/integrations/supabase/auth-attacher.ts",
      "src/integrations/supabase/auth-middleware.ts",
      "src/integrations/supabase/client.server.ts",
      "src/integrations/supabase/client.ts",
      "src/integrations/supabase/previewAuthStorage.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Server functions consume Supabase's fluent query client and untyped
      // JSON rows at the network boundary; the runtime validators remain the
      // source of truth until generated database types cover these relations.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  eslintPluginPrettier,
  {
    // Formatting is applied to files changed by this redesign. The inherited
    // codebase is not yet uniformly Prettier-formatted, so lint stays focused
    // on semantic and React correctness.
    rules: { "prettier/prettier": "off" },
  },
);
