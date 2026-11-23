import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Ctx } from "./context";
import { ROLES, users } from "./db/schema";
import { HOUR } from "./ratelimit";

// Stateless, HMAC-signierte Tokens: `base64url(json).ablauf.signatur`. Keine Token-Tabelle nötig.
// Login-Links sind bis zum Ablauf mehrfach nutzbar – dafür zerstören Mail-Scanner (Link-Vorschau) sie nicht.
type Purpose = "login" | "register" | "session" | "flash" | "phone";
const hmac = (s: string, secret: string) => createHmac("sha256", secret).update(s).digest("base64url");

export function sign(purpose: Purpose, data: object, secret: string, ttlMs: number, now = Date.now()) {
  const body = `${Buffer.from(JSON.stringify({ ...data, p: purpose })).toString("base64url")}.${now + ttlMs}`;
  return `${body}.${hmac(body, secret)}`;
}

export function verify<T>(token: string, purpose: Purpose, secret: string, now = Date.now()): T | null {
  const [payload, exp, sig, ...rest] = token.split(".");
  if (!sig || rest.length) return null;
  const expected = Buffer.from(hmac(`${payload}.${exp}`, secret));
  const actual = Buffer.from(sig);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected) || Number(exp) < now) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString()); // signiert → stammt von uns
  return data.p === purpose ? data : null;
}

const Email = z.string().trim().toLowerCase().pipe(z.email("Ungültige E-Mail"));

const RegisterInput = z
  .object({
    name: z.string().trim().min(1, "Name fehlt").max(100),
    email: Email,
    role: z.enum(ROLES),
    trade: z.string().trim().max(100).optional(),
  })
  .refine((u) => u.role === "kunde" || u.trade, "Gewerk fehlt")
  .transform((u) => ({ ...u, trade: u.role === "handwerker" ? u.trade! : null }));
type Registration = z.infer<typeof RegisterInput>;

const LINK_TTL = 15 * 60_000;
const SESSION_TTL = 30 * 24 * HOUR;
/** Max. 5 Links pro Adresse und Stunde – verhindert Mail-Bombing über das Formular. */
const limitLinks = (ctx: Ctx, email: string) => ctx.limit(`link:${email}`, 5, HOUR);
const findByEmail = (ctx: Ctx, email: string) => ctx.db.query.users.findFirst({ where: eq(users.email, email) });

async function mailLoginLink(ctx: Ctx, user: { id: number; email: string }) {
  const token = sign("login", { uid: user.id }, ctx.secret, LINK_TTL);
  await ctx.send(user.email, "Dein Login-Link", `Hier anmelden (15 Min. gültig):\n${ctx.appUrl}/login?token=${token}`);
}

export async function sendLoginLink(ctx: Ctx, email: unknown) {
  const addr = Email.parse(email);
  limitLinks(ctx, addr);
  const user = await findByEmail(ctx, addr);
  if (user) await mailLoginLink(ctx, user); // unbekannte Adresse: still nichts tun – verrät nicht, wer registriert ist
}

/**
 * Der Account entsteht erst beim Klick auf den Link (Daten stecken signiert im Token).
 * So kann niemand eine fremde Adresse mit eigenem Namen/Rolle vorbelegen.
 */
export async function register(ctx: Ctx, input: unknown) {
  const u = RegisterInput.parse(input);
  limitLinks(ctx, u.email);
  const existing = await findByEmail(ctx, u.email);
  if (existing) return mailLoginLink(ctx, existing);
  const token = sign("register", u, ctx.secret, LINK_TTL);
  await ctx.send(u.email, "Registrierung bestätigen", `Hier Registrierung abschließen (15 Min. gültig):\n${ctx.appUrl}/login?token=${token}`);
}

/** Löst einen Login- oder Registrierungslink ein → User oder null. */
export async function redeem(ctx: Ctx, token: string) {
  const login = verify<{ uid: number }>(token, "login", ctx.secret);
  if (login) return ctx.db.query.users.findFirst({ where: and(eq(users.id, login.uid), isNull(users.deletedAt)) }); // Link von vor der Löschung
  const reg = verify<Registration>(token, "register", ctx.secret);
  if (!reg) return undefined;
  const { name, email, role, trade } = reg;
  await ctx.db.insert(users).values({ name, email, role, trade }).onConflictDoNothing();
  return findByEmail(ctx, email); // existierte die Adresse inzwischen: Login in diesen Account (Postfach ist bewiesen)
}

export const sessionToken = (ctx: Ctx, user: { id: number; sessionVersion: number }) =>
  sign("session", { uid: user.id, v: user.sessionVersion }, ctx.secret, SESSION_TTL);

export async function sessionUser(ctx: Ctx, token: string) {
  const s = verify<{ uid: number; v: number }>(token, "session", ctx.secret);
  const user = s && (await ctx.db.query.users.findFirst({ where: eq(users.id, s.uid) }));
  return user && user.sessionVersion === s.v ? user : undefined;
}

/** Abmelden = alle Sitzungen dieses Users ungültig (auch gestohlene Cookies). */
export async function endAllSessions(ctx: Ctx, userId: number) {
  await ctx.db.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, userId));
}

/** Signierte Statusmeldung für die URL – fremde Texte (Phishing über ?error=…) werden nicht angezeigt. */
export type Flash = { kind: "error" | "info"; text: string };
export const sealFlash = (ctx: Ctx, f: Flash) => sign("flash", f, ctx.secret, 60_000);
export const openFlash = (ctx: Ctx, token: string) => verify<Flash>(token, "flash", ctx.secret);
