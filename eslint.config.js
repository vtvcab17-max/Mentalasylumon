import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.wrangler/**", "**/node_modules/**", "specs/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["scripts/**", "evals/**", "**/*.config.*"],
    languageOptions: { globals: { process: "readonly", console: "readonly", __dirname: "readonly", fetch: "readonly", performance: "readonly", setTimeout: "readonly", setInterval: "readonly", clearInterval: "readonly" } },
    rules: { "no-console": "off" },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
);
