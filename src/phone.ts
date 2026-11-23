import { createHmac, randomInt } from "node:crypto";
import { and, eq, isNull, ne, notExists } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { sign, verify } from "./accounts";
import type { Ctx } from "./context";
import { users } from "./db/schema";
import { UserError } from "./errors";
import { HOUR } from "./ratelimit";
import type { User } from "./requests";

// Handynummer per SMS-Code bestätigen – stateless wie die Login-Links: Die Code-Anfrage liefert ein signiertes Token
// (uid, Nummer-Hash, Code-Hash, 10 Min.), das mit dem Code zurückkommt. Gespeichert wird nur der HMAC-Hash der Nummer.

export const PHONE_REQUIRED =
  "Notfall- und kurzfristige Anfragen gehen nur mit bestätigter Handynummer – bitte im Profil (/profil) bestätigen";
const CODE_TTL = 10 * 60_000;
/** UI: Cookie, in dem das Token bis zur Code-Eingabe wartet (enthält nur Hashes). */
export const PHONE_COOKIE = "phone-code";
type Pending = { uid: number; hash: string; hint: string; code: string };

/** Leerzeichen, Bindestriche, Klammern, Schrägstriche raus; 00 → +, führende 0 → +49; dann nur +<8–15 Ziffern>. */
export const Phone = z
  .string("Handynummer fehlt")
  .transform((s) => s.replace(/[\s\-()/]/g, "").replace(/^00/, "+").replace(/^0/, "+49"))
  .pipe(z.string().regex(/^\+\d{8,15}$/, "Ungültige Handynummer"));

const hmac = (ctx: Ctx, s: string) => createHmac("sha256", ctx.secret).update(s).digest("base64url");
/** Nicht umkehrbar ohne Server-Secret; gleiche Nummer → gleicher Hash (daran hängen die Bewertungen). */
export const phoneHash = (ctx: Ctx, phone: string) => hmac(ctx, phone);
const codeHash = (ctx: Ctx, p: Omit<Pending, "code">, code: string) => hmac(ctx, `code:${p.uid}:${p.hash}:${code}`);

/** Liegt die Nummer bei einem anderen AKTIVEN Konto? (Gelöschte Konten geben ihre Nummer frei – die Bewertungen bleiben dran.) */
const otherActive = (ctx: Ctx, user: User, hash: string) => {
  const other = alias(users, "other");
  return ctx.db.select({ id: other.id }).from(other).where(and(eq(other.phoneHash, hash), isNull(other.deletedAt), ne(other.id, user.id)));
};
const taken = () => new UserError("Diese Nummer ist bereits bei einem anderen Konto hinterlegt");

/** Schickt einen 6-stelligen Code per SMS und liefert das Token für die Bestätigung. Max. 3 Codes pro Nutzer und Nummer/Stunde. */
export async function requestPhoneCode(ctx: Ctx, user: User, phone: unknown) {
  const number = Phone.parse(phone);
  const p = { uid: user.id, hash: phoneHash(ctx, number), hint: number.slice(-2) };
  if ((await otherActive(ctx, user, p.hash)).length) throw taken();
  ctx.limit(`phone-code:${user.id}`, 3, HOUR);
  ctx.limit(`phone-code:${p.hash}`, 3, HOUR); // auch über mehrere Konten keine SMS-Flut an eine Nummer
  const code = String(randomInt(1_000_000)).padStart(6, "0");
  await ctx.sms(number, `Dein Bestätigungscode für Handwerkertermine: ${code} (10 Min. gültig)`);
  return sign("phone", { ...p, code: codeHash(ctx, p, code) }, ctx.secret, CODE_TTL);
}

/** Offene Code-Anfrage dieses Nutzers (für die Anzeige) oder null. */
export function pendingPhone(ctx: Ctx, user: User, token: string) {
  const p = verify<Pending>(token, "phone", ctx.secret);
  return p?.uid === user.id ? { hint: p.hint } : null;
}

/** Prüft den Code (max. 5 Versuche pro Nutzer/Stunde) und hinterlegt die Nummer als Hash + letzte 2 Ziffern. */
export async function confirmPhone(ctx: Ctx, user: User, input: unknown) {
  const { token, code } = z.object({ token: z.string(), code: z.string().trim() }).parse(input);
  ctx.limit(`phone-check:${user.id}`, 5, HOUR);
  const p = verify<Pending>(token, "phone", ctx.secret);
  if (!p || p.uid !== user.id) throw new UserError("Code abgelaufen – bitte neu anfordern");
  if (p.code !== codeHash(ctx, p, code)) throw new UserError("Falscher Code");
  // bedingt = atomar: nicht, falls ein anderes aktives Konto die Nummer inzwischen bestätigt hat (Unique-Index als Netz)
  const [row] = await ctx.db
    .update(users)
    .set({ phoneHash: p.hash, phoneHint: p.hint })
    .where(and(eq(users.id, user.id), notExists(otherActive(ctx, user, p.hash))))
    .returning();
  if (!row) throw taken();
  return row;
}
