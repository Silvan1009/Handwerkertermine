import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import type { Ctx } from "./context";
import type { Db } from "./db";
import { options, requests, users } from "./db/schema";

export type User = typeof users.$inferSelect;
type Parties = { customerId: number; craftsmanId: number; customer: User; craftsman: User; description: string };

function deny(): never {
  throw new Error("Nicht erlaubt");
}

/** Wirft, wenn der User nicht an der Anfrage beteiligt ist. */
function participant<T extends Parties>(req: T | undefined, user: User): T {
  if (!req || (req.customerId !== user.id && req.craftsmanId !== user.id)) deny();
  return req;
}

const loadRequest = (db: Db, id: number) =>
  db.query.requests.findFirst({ where: eq(requests.id, id), with: { customer: true, craftsman: true } });

/** Benachrichtigt die jeweils andere Partei. Ein Mailfehler darf die bereits gespeicherte Aktion nicht kippen. */
async function notifyOther(ctx: Ctx, req: Parties, user: User, subject: string) {
  const other = req.customerId === user.id ? req.craftsman : req.customer;
  try {
    await ctx.send(other.email, subject, `${subject}\n\nAnfrage: ${req.description}\n\n${ctx.appUrl}`);
  } catch (e) {
    console.error("Mailversand fehlgeschlagen", e);
  }
}

export function statusOf(r: { chosenOptionId: number | null; options: { rejected: boolean }[] }) {
  if (r.chosenOptionId) return "bestätigt";
  if (r.options.some((o) => !o.rejected)) return "Vorschläge offen";
  if (r.options.length) return "abgelehnt – neuer Vorschlag nötig";
  return "wartet auf Vorschlag";
}

const RequestInput = z.object({
  craftsmanId: z.coerce.number().int(),
  description: z.string().trim().min(1, "Beschreibung fehlt"),
});

export async function createRequest(ctx: Ctx, user: User, input: unknown) {
  if (user.role !== "kunde") deny();
  const data = RequestInput.parse(input);
  const craftsman = await ctx.db.query.users.findFirst({
    where: and(eq(users.id, data.craftsmanId), eq(users.role, "handwerker")),
  });
  if (!craftsman) throw new Error("Handwerker unbekannt");
  const [row] = await ctx.db.insert(requests).values({ ...data, customerId: user.id }).returning();
  await notifyOther(ctx, { ...row, customer: user, craftsman }, user, `Neue Anfrage von ${user.name}`);
  return row;
}

const OptionInput = z
  .object({
    requestId: z.coerce.number().int(),
    kind: z.enum(["termin", "zeitfenster"]),
    start: z.coerce.date(),
    end: z.coerce.date(),
  })
  .refine((o) => o.end > o.start, "Ende muss nach Beginn liegen");

/** Vorschlag (Handwerker) oder Gegenvorschlag (Kunde). */
export async function proposeOption(ctx: Ctx, user: User, input: unknown, now = new Date()) {
  const data = OptionInput.parse(input);
  if (data.start <= now) throw new Error("Vorschlag liegt in der Vergangenheit");
  const req = participant(await loadRequest(ctx.db, data.requestId), user);
  if (req.chosenOptionId) throw new Error("Anfrage ist bereits bestätigt");
  const [row] = await ctx.db.insert(options).values({ ...data, proposedById: user.id }).returning();
  await notifyOther(ctx, req, user, `Neuer Terminvorschlag von ${user.name}`);
  return row;
}

export async function chooseOption(ctx: Ctx, user: User, optionId: number) {
  const opt = await ctx.db.query.options.findFirst({ where: eq(options.id, optionId) });
  if (!opt) deny();
  const req = participant(await loadRequest(ctx.db, opt.requestId), user);
  if (opt.proposedById === user.id) throw new Error("Eigene Vorschläge kann nur die Gegenseite annehmen");
  if (opt.rejected) throw new Error("Vorschlag wurde abgelehnt");
  // Bedingtes Update = atomar, auch bei Doppelklick/parallelen Requests.
  const [row] = await ctx.db
    .update(requests)
    .set({ chosenOptionId: opt.id })
    .where(and(eq(requests.id, req.id), isNull(requests.chosenOptionId)))
    .returning();
  if (!row) throw new Error("Es wurde bereits ein Vorschlag gewählt");
  await notifyOther(ctx, req, user, `Termin bestätigt von ${user.name}`);
  return row;
}

/** Lehnt alle offenen Vorschläge der Gegenseite ab. */
export async function rejectOptions(ctx: Ctx, user: User, requestId: number) {
  const req = participant(await loadRequest(ctx.db, requestId), user);
  if (req.chosenOptionId) throw new Error("Anfrage ist bereits bestätigt");
  const rejected = await ctx.db
    .update(options)
    .set({ rejected: true })
    .where(and(eq(options.requestId, req.id), ne(options.proposedById, user.id), eq(options.rejected, false)))
    .returning();
  if (!rejected.length) throw new Error("Keine offenen Vorschläge");
  await notifyOther(ctx, req, user, `${user.name} hat die Vorschläge abgelehnt`);
}

export function listRequests(ctx: Ctx, user: User) {
  return ctx.db.query.requests.findMany({
    where: eq(user.role === "kunde" ? requests.customerId : requests.craftsmanId, user.id),
    with: { customer: true, craftsman: true, options: { orderBy: options.start } },
    orderBy: desc(requests.id),
  });
}
