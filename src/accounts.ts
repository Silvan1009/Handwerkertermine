import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Ctx } from "./context";
import { users } from "./db/schema";

// Stateless, HMAC-signierte Tokens: `zweck:userId.ablauf.signatur`. Keine Token-Tabelle nötig.
// Login-Links sind bis zum Ablauf mehrfach nutzbar – dafür zerstören Mail-Scanner (Link-Vorschau) sie nicht.
const hmac = (s: string, secret: string) => createHmac("sha256", secret).update(s).digest("base64url");

export function sign(purpose: "login" | "session", userId: number, secret: string, ttlMs: number, now = Date.now()) {
  const body = `${purpose}:${userId}.${now + ttlMs}`;
  return `${body}.${hmac(body, secret)}`;
}

export function verify(token: string, purpose: "login" | "session", secret: string, now = Date.now()): number | null {
  const m = token.match(/^(\w+):(\d+)\.(\d+)\.([\w-]+)$/);
  if (!m || m[1] !== purpose || Number(m[3]) < now) return null;
  const expected = Buffer.from(hmac(`${m[1]}:${m[2]}.${m[3]}`, secret));
  const actual = Buffer.from(m[4]);
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? Number(m[2]) : null;
}

const Email = z.string().trim().toLowerCase().pipe(z.email("Ungültige E-Mail"));

const RegisterInput = z
  .object({
    name: z.string().trim().min(1, "Name fehlt"),
    email: Email,
    role: z.enum(["kunde", "handwerker"]),
    trade: z.string().trim().optional(),
  })
  .refine((u) => u.role === "kunde" || u.trade, "Gewerk fehlt");

export async function register(ctx: Ctx, input: unknown) {
  const u = RegisterInput.parse(input);
  // Existiert die Mail schon, passiert nichts – so verrät die Registrierung nicht, wer Kunde ist.
  await ctx.db.insert(users).values({ ...u, trade: u.role === "handwerker" ? u.trade : null }).onConflictDoNothing();
  await sendLoginLink(ctx, u.email);
}

export async function sendLoginLink(ctx: Ctx, email: unknown) {
  const user = await ctx.db.query.users.findFirst({ where: eq(users.email, Email.parse(email)) });
  if (!user) return;
  const token = sign("login", user.id, ctx.secret, 15 * 60_000);
  await ctx.send(user.email, "Dein Login-Link", `Hier anmelden (15 Min. gültig):\n${ctx.appUrl}/login?token=${token}`);
}
