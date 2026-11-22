import { and, desc, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import type { Ctx } from "./context";
import type { Db } from "./db";
import { CATEGORIES, RATINGS, options, requests, users } from "./db/schema";
import { CATEGORY_LABELS } from "./availability";
import { RESTRICTED, standingOf } from "./urgency";
import { calcQuote, eur, parseEuro } from "./pricing";

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
  urgency: z.enum(CATEGORIES, "Dringlichkeit fehlt"),
});

export async function createRequest(ctx: Ctx, user: User, input: unknown) {
  if (user.role !== "kunde") deny();
  const data = RequestInput.parse(input);
  const craftsman = await ctx.db.query.users.findFirst({
    where: and(eq(users.id, data.craftsmanId), eq(users.role, "handwerker")),
  });
  if (!craftsman) throw new Error("Handwerker unbekannt");
  if (RESTRICTED.includes(data.urgency) && (await standingOf(ctx, user.id)).locked)
    throw new Error("Wegen zu vieler unpassender Dringlichkeitsangaben sind Notfall- und kurzfristige Anfragen vorübergehend gesperrt");
  const [row] = await ctx.db.insert(requests).values({ ...data, customerId: user.id }).returning();
  const subject = `Neue Anfrage von ${user.name} – ${CATEGORY_LABELS[data.urgency]}`;
  await notifyOther(ctx, { ...row, customer: user, craftsman }, user, subject);
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

/** Handwerker bewertet nach Bestätigung einmalig die Dringlichkeits-Selbsteinschätzung des Kunden. */
export async function rateUrgency(ctx: Ctx, user: User, requestId: number, rating: unknown) {
  const r = z.enum(RATINGS).parse(rating);
  const req = participant(await loadRequest(ctx.db, requestId), user);
  if (req.craftsmanId !== user.id) deny();
  if (!req.chosenOptionId) throw new Error("Bewertung erst nach Bestätigung möglich");
  const [row] = await ctx.db
    .update(requests)
    .set({ urgencyRating: r })
    .where(and(eq(requests.id, req.id), isNull(requests.urgencyRating)))
    .returning();
  if (!row) throw new Error("Bereits bewertet");
}

/** Handwerker gibt (vor Bestätigung) einen Grundpreis an; seine Preisregeln werden angewendet. */
export async function setQuote(ctx: Ctx, user: User, requestId: number, basePrice: unknown) {
  const req = participant(await loadRequest(ctx.db, requestId), user);
  if (req.craftsmanId !== user.id) deny();
  if (req.chosenOptionId) throw new Error("Anfrage ist bereits bestätigt");
  const earlier = await ctx.db.query.requests.findFirst({
    where: and(
      eq(requests.customerId, req.customerId),
      eq(requests.craftsmanId, req.craftsmanId),
      isNotNull(requests.chosenOptionId),
      ne(requests.id, req.id),
    ),
  });
  const quote = calcQuote(parseEuro(basePrice), req.craftsman.pricing ?? {}, { urgency: req.urgency, firstCustomer: !earlier });
  await ctx.db.update(requests).set({ quote }).where(eq(requests.id, req.id));
  await notifyOther(ctx, req, user, `Preisangebot von ${user.name}: ${eur(quote.total)}`);
  return quote;
}

export function listRequests(ctx: Ctx, user: User) {
  return ctx.db.query.requests.findMany({
    where: eq(user.role === "kunde" ? requests.customerId : requests.craftsmanId, user.id),
    with: { customer: true, craftsman: true, options: { orderBy: options.start } },
    orderBy: desc(requests.id),
  });
}
