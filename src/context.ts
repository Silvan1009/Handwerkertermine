import { createDb, type Db } from "./db";
import { send, type Send } from "./mail";
import { createLimiter, type Limit } from "./ratelimit";

/** Alle Abhängigkeiten der Fachlogik. Tests bauen sich ihren eigenen Ctx. */
export type Ctx = { db: Db; send: Send; limit: Limit; appUrl: string; secret: string };

// In GitHub Codespaces zeigen Links auf die weitergeleitete Adresse statt auf localhost.
const codespaceUrl =
  process.env.CODESPACE_NAME &&
  `https://${process.env.CODESPACE_NAME}-3000.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? "app.github.dev"}`;

export const ctx: Ctx = {
  db: createDb(process.env.DATABASE_URL ?? "file:local.db"),
  send,
  limit: createLimiter(),
  appUrl: process.env.APP_URL || codespaceUrl || "http://localhost:3000",
  get secret() {
    const s = process.env.AUTH_SECRET;
    if (!s && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET fehlt");
    return s ?? "dev-secret";
  },
};
