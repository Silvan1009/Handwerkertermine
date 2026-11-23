import { defineConfig } from "@playwright/test";

// Startet die App gegen eine frische Wegwerf-DB (e2e.db) mit festem Test-Secret.
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  timeout: 60_000, // viele Dateien parallel gegen einen Dev-Server, der Seiten beim ersten Aufruf kompiliert
  use: { baseURL: "http://localhost:3200", trace: "off" },
  webServer: {
    command: "rm -f e2e.db && drizzle-kit migrate && tsx src/db/seed.ts && next dev -p 3200",
    url: "http://localhost:3200",
    env: { DATABASE_URL: "file:e2e.db", AUTH_SECRET: "e2e-secret", APP_URL: "http://localhost:3200" },
    timeout: 120_000,
  },
});
