import { migrate } from "drizzle-orm/libsql/migrator";
import type { Ctx } from "./context";
import { createDb } from "./db";
import { createLimiter } from "./ratelimit";

/** Frischer Ctx mit In-Memory-DB, Mail-Postfach und SMS-Postfach zum Nachschauen. */
export async function testCtx() {
  const db = createDb(":memory:");
  await migrate(db, { migrationsFolder: "drizzle" });
  const mails: { to: string; subject: string; text: string }[] = [];
  const sms: { to: string; text: string }[] = [];
  const ctx: Ctx = {
    db,
    appUrl: "http://app",
    secret: "test",
    limit: createLimiter(),
    send: async (to, subject, text) => void mails.push({ to, subject, text }),
    sms: async (to, text) => void sms.push({ to, text }),
  };
  return { ctx, mails, sms };
}
