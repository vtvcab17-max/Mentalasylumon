import path from "node:path";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, "migrations"));
  return {
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
      poolOptions: {
        workers: {
          singleWorker: true,
          wrangler: { configPath: "./wrangler.jsonc" },
          miniflare: {
            bindings: {
              APP_ENV: "dev",
              TEST_MIGRATIONS: migrations,
              CHAT_ENCRYPTION_KEY: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
              GOOGLE_CLIENT_ID: "test-client",
              GOOGLE_CLIENT_SECRET: "test-secret",
              ANTHROPIC_API_KEY: "",
            },
          },
        },
      },
    },
  };
});
