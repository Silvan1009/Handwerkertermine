import { and, desc, eq, exists, isNotNull, isNull, ne, notExists } from "drizzle-orm";
import { z } from "zod";
import type { Ctx } from "./context";
import type { Db } from "./db";
import { CATEGORIES, RATINGS, images, options, requests, users } from "./db/schema";
import { CATEGORY_LABELS, paged } from "./availability";
import { APPEALABLE, LOCK_HINT, RATING_LABELS, RESTRICTED, standingOf } from "./urgency";
import { conditionsFor } from "./pricing";
import { UserError } from "./errors";
import { DAY } from "./ratelimit";
import { parseLocal } from "./time";
import { assertBookable } from "./calendar";

export type User = typeof users.$inferSelect;
type Parties = { customerId: number; craftsmanId: number; customer: User; craftsman: User; description: string };

function deny(): never {
  throw new UserError("Nicht erlaubt");
}

/** Wirft, wenn der User nicht an der Anfrage beteiligt ist. */
function participant<T extends Parties>(req: T | undefined, user: User): T {
  if (!req || (req.customerId !== user.id && req.craftsmanId !== user.id)) deny();
  return req;
}

/** Wirft, wenn die Anfrage storniert wurde – danach ist keine Aktion mehr möglich. */
function active<T extends { cancelledAt: Date | null }>(req: T): T {
  if (req.cancelledAt) throw new UserError("Anfrage wurde storniert");
  return req;
}

const loadRequest = (db: Db, id: number) =>
  db.query.requests.findFirst({ where: eq(requests.id, id), with: { customer: true, craftsman: true } });

/** Benachrichtigt die jeweils andere Partei. Ein Mailfehler darf die bereits gespeicherte Aktion nicht kippen. */
async function notifyOther(ctx: Ctx, req: Parties, user: User, subject: string, extra?: string) {
  const other = req.customerId === user.id ? req.craftsman : req.customer;
  try {
    await ctx.send(other.email, subject, `${subject}\n\n${extra ? `${extra}\n\n` : ""}Anfrage: ${req.description}\n\n${ctx.appUrl}`);
  } catch (e) {
    console.error("Mailversand fehlgeschlagen", e);
  }
}

export function statusOf(r: { cancelledAt: Date | null; chosenOptionId: number | null; options: { rejected: boolean }[] }) {
  if (r.cancelledAt) return "storniert";
  if (r.chosenOptionId) return "bestätigt";
  if (r.options.some((o) => !o.rejected)) return "Vorschläge offen";
  if (r.options.length) return "abgelehnt – neuer Vorschlag nötig";
  return "wartet auf Vorschlag";
}

const RequestInput = z.object({
  craftsmanId: z.coerce.number().int(),
  description: z.string().trim().min(1, "Beschreibung fehlt").max(2000),
  urgency: z.enum(CATEGORIES, "Dringlichkeit fehlt"),
});

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]; // kein SVG (könnte Skripte enthalten)
const Images = z
  .array(z.file().max(10_000_000, "Bild zu groß (max. 10 MB)").mime(IMAGE_TYPES, "Nur JPEG, PNG, WebP oder GIF"))
  .max(5, "Höchstens 5 Bilder");

export async function createRequest(ctx: Ctx, user: User, input: unknown, files: unknown = []) {
  if (user.role !== "kunde") deny();
  const data = RequestInput.parse(input);
  const photos = Images.parse(files);
  ctx.limit(`request:${user.id}`, 10, DAY); // Anfragen lösen Mails mit Freitext aus → Spam-Bremse
  const craftsman = await ctx.db.query.users.findFirst({
    where: and(eq(users.id, data.craftsmanId), eq(users.role, "handwerker")),
  });
  if (!craftsman) throw new UserError("Handwerker unbekannt");
  if (RESTRICTED.includes(data.urgency) && (await standingOf(ctx, user.id)).locked)
    throw new UserError("Wegen zu vieler unpassender Dringlichkeitsangaben sind Notfall- und kurzfristige Anfragen vorübergehend gesperrt");
  const earlier = await ctx.db.query.requests.findFirst({
    where: and(eq(requests.customerId, user.id), eq(requests.craftsmanId, craftsman.id), isNotNull(requests.chosenOptionId)),
  });
  const conditions = conditionsFor(craftsman.pricing ?? {}, { urgency: data.urgency, firstCustomer: !earlier });
  const [row] = await ctx.db.insert(requests).values({ ...data, conditions, customerId: user.id }).returning();
  if (photos.length) {
    const values = await Promise.all(photos.map(async (f) => ({ requestId: row.id, mime: f.type, data: Buffer.from(await f.arrayBuffer()) })));
    await ctx.db.insert(images).values(values);
  }
  const subject = `Neue Anfrage von ${user.name} – ${CATEGORY_LABELS[data.urgency]}`;
  await notifyOther(ctx, { ...row, customer: user, craftsman }, user, subject);
  return row;
}

// Formularwerte sind Berliner Ortszeit; Date-Objekte (Tests) werden direkt übernommen.
const LocalDate = z.preprocess((v) => (typeof v === "string" ? parseLocal(v) : v), z.date("Ungültiges Datum"));

const OptionInput = z
  .object({
    requestId: z.coerce.number().int(),
    kind: z.enum(["termin", "zeitfenster"]),
    start: LocalDate,
    end: LocalDate,
  })
  .refine((o) => o.end > o.start, "Ende muss nach Beginn liegen");

/** Vorschlag (Handwerker) oder Gegenvorschlag (Kunde). */
export async function proposeOption(ctx: Ctx, user: User, input: unknown, now = new Date()) {
  const data = OptionInput.parse(input);
  if (data.start <= now) throw new UserError("Vorschlag liegt in der Vergangenheit");
  const req = active(participant(await loadRequest(ctx.db, data.requestId), user));
  if (req.chosenOptionId) throw new UserError("Anfrage ist bereits bestätigt");
  await assertBookable(ctx, req.craftsmanId, data.start, data.end); // Blocker, Überschneidung, Tageskapazität
  const [row] = await ctx.db.insert(options).values({ ...data, proposedById: user.id }).returning();
  // Wurde die Anfrage zwischen Prüfung und Insert durch einen anderen Vorschlag bestätigt? Dann zurückrollen.
  const after = await loadRequest(ctx.db, req.id);
  if (after?.chosenOptionId && after.chosenOptionId !== row.id) {
    await ctx.db.delete(options).where(eq(options.id, row.id));
    throw new UserError("Anfrage ist bereits bestätigt");
  }
  await notifyOther(ctx, req, user, `Neuer Terminvorschlag von ${user.name}`);
  return row;
}

export async function chooseOption(ctx: Ctx, user: User, optionId: number) {
  const opt = await ctx.db.query.options.findFirst({ where: eq(options.id, optionId) });
  if (!opt) deny();
  const req = active(participant(await loadRequest(ctx.db, opt.requestId), user));
  if (opt.proposedById === user.id) throw new UserError("Eigene Vorschläge kann nur die Gegenseite annehmen");
  if (opt.rejected) throw new UserError("Vorschlag wurde abgelehnt");
  await assertBookable(ctx, req.craftsmanId, opt.start, opt.end); // Kalender kann sich seit dem Vorschlag geändert haben
  // Bedingtes Update = atomar, auch bei Doppelklick oder gleichzeitigem Ablehnen.
  const stillOpen = ctx.db.select().from(options).where(and(eq(options.id, opt.id), eq(options.rejected, false)));
  const [row] = await ctx.db
    .update(requests)
    .set({ chosenOptionId: opt.id })
    .where(and(eq(requests.id, req.id), isNull(requests.chosenOptionId), isNull(requests.cancelledAt), exists(stillOpen)))
    .returning();
  if (!row) throw new UserError("Es wurde bereits ein Vorschlag gewählt");
  await notifyOther(ctx, req, user, `Termin bestätigt von ${user.name}`);
  return row;
}

/** Lehnt alle offenen Vorschläge der Gegenseite ab. */
export async function rejectOptions(ctx: Ctx, user: User, requestId: number) {
  const req = active(participant(await loadRequest(ctx.db, requestId), user));
  if (req.chosenOptionId) throw new UserError("Anfrage ist bereits bestätigt");
  const rejected = await ctx.db
    .update(options)
    .set({ rejected: true })
    .where(
      and(
        eq(options.requestId, req.id),
        ne(options.proposedById, user.id),
        eq(options.rejected, false),
        // atomar: nicht ablehnen, falls inzwischen bestätigt wurde
        notExists(ctx.db.select().from(requests).where(and(eq(requests.id, req.id), isNotNull(requests.chosenOptionId)))),
      ),
    )
    .returning();
  if (!rejected.length) throw new UserError("Keine offenen Vorschläge");
  await notifyOther(ctx, req, user, `${user.name} hat die Vorschläge abgelehnt`);
}

/** Handwerker bewertet nach Bestätigung einmalig die Dringlichkeits-Selbsteinschätzung des Kunden. */
export async function rateUrgency(ctx: Ctx, user: User, requestId: number, rating: unknown) {
  const r = z.enum(RATINGS).parse(rating);
  const req = active(participant(await loadRequest(ctx.db, requestId), user));
  if (req.craftsmanId !== user.id) deny();
  if (!req.chosenOptionId) throw new UserError("Bewertung erst nach Bestätigung möglich");
  const [row] = await ctx.db
    .update(requests)
    .set({ urgencyRating: r, ratedAt: new Date() })
    .where(and(eq(requests.id, req.id), isNull(requests.urgencyRating)))
    .returning();
  if (!row) throw new UserError("Bereits bewertet");
}

/** Darf der Kunde stornieren? Unbestätigt jederzeit, bestätigt nur bis 24 h vor Beginn des gewählten Vorschlags. */
export function canCancel(
  r: { cancelledAt: Date | null; chosenOptionId: number | null; options: { id: number; start: Date }[] },
  now = new Date(),
) {
  if (r.cancelledAt) return false;
  if (!r.chosenOptionId) return true;
  const chosen = r.options.find((o) => o.id === r.chosenOptionId);
  return !!chosen && chosen.start.getTime() - now.getTime() >= DAY;
}

/** Kunde storniert seine Anfrage (bzw. zieht sie zurück) – Mail an den Handwerker. */
export async function cancelRequest(ctx: Ctx, user: User, requestId: number, now = new Date()) {
  const req = participant(await loadRequest(ctx.db, requestId), user);
  if (req.customerId !== user.id) deny();
  if (req.cancelledAt) throw new UserError("Anfrage wurde bereits storniert");
  const opts = await ctx.db.query.options.findMany({ where: eq(options.requestId, req.id) });
  if (!canCancel({ ...req, options: opts }, now)) throw new UserError("Stornierung nur bis 24 h vor dem Termin möglich");
  // Bedingt auf den geprüften Stand: nicht doppelt und nicht, falls inzwischen (kurzfristig) bestätigt wurde.
  const [row] = await ctx.db
    .update(requests)
    .set({ cancelledAt: now })
    .where(
      and(
        eq(requests.id, req.id),
        isNull(requests.cancelledAt),
        req.chosenOptionId ? eq(requests.chosenOptionId, req.chosenOptionId) : isNull(requests.chosenOptionId),
      ),
    )
    .returning();
  if (!row) throw new UserError("Anfrage wurde inzwischen geändert – bitte neu laden");
  await notifyOther(ctx, req, user, `Anfrage storniert von ${user.name}`);
  return row;
}

/** Ein Foto – nur für Kunde und Handwerker der Anfrage. */
export async function loadImage(ctx: Ctx, user: User, id: number) {
  const img = await ctx.db.query.images.findFirst({ where: eq(images.id, id), with: { request: true } });
  if (!img || (img.request.customerId !== user.id && img.request.craftsmanId !== user.id)) deny();
  return img;
}

/** Anfragen des Users, neueste zuerst – Seite `page` (ab 1) zu je PAGE_SIZE; `.more` = es gibt eine nächste Seite. */
export function listRequests(ctx: Ctx, user: User, page = 1) {
  return paged(page, (limit, offset) =>
    ctx.db.query.requests.findMany({
      where: eq(user.role === "kunde" ? requests.customerId : requests.craftsmanId, user.id),
      with: { customer: true, craftsman: true, options: { orderBy: options.start }, images: { columns: { id: true } } },
      orderBy: desc(requests.id),
      limit,
      offset,
    }),
  );
}
