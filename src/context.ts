import { createDb, type Db } from "./db";
import { send, type Send } from "./mail";
import { createLimiter, type Limit } from "./ratelimit";

/** Alle Abhängigkeiten der Fachlogik. Tests bauen sich ihren eigenen Ctx. */
export type Ctx = { db: Db; send: Send; limit: Limit; appUrl: string; secret: string };

export const ctx: Ctx = {
  db: createDb(process.env.DATABASE_URL ?? "file:local.db"),
  send,
  limit: createLimiter(),
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  get secret() {
    const s = process.env.AUTH_SECRET;
    if (!s && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET fehlt");
    return s ?? "dev-secret";
  },
};
