import { db, type Db } from "./db";
import { send, type Send } from "./mail";

/** Alle Abhängigkeiten der Fachlogik. Tests bauen sich ihren eigenen Ctx. */
export type Ctx = { db: Db; send: Send; appUrl: string; secret: string };

export const ctx: Ctx = {
  db,
  send,
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  get secret() {
    const s = process.env.AUTH_SECRET;
    if (!s && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET fehlt");
    return s ?? "dev-secret";
  },
};
