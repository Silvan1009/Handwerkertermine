// VERTRAG (vom Lead festgelegt): Signaturen und Semantik nicht ohne Absprache ändern.
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import type { Ctx } from "./context";
import { calendarEntries, options, requests, users } from "./db/schema";
import { UserError } from "./errors";
import type { User } from "./requests";
import { dayKey, dayRange, parseLocal } from "./time";

export type Entry = typeof calendarEntries.$inferSelect;

/** Ein Eintrag im Kalender des Handwerkers. */
export type CalendarItem =
  | { kind: "app"; start: Date; end: Date; title: string; requestId: number } // bestätigter, nicht stornierter App-Termin
  | { kind: "extern" | "blocker"; start: Date; end: Date; title: string; entryId: number };

function craftsmanOnly(user: User) {
  if (user.role !== "handwerker") throw new UserError("Nicht erlaubt");
}

// Formularwerte sind Berliner Ortszeit; Date-Objekte (Tests) werden direkt übernommen.
const LocalDate = z.preprocess((v) => (typeof v === "string" ? parseLocal(v) : v), z.date("Ungültiges Datum"));

const EntryInput = z
  .object({
    kind: z.enum(["extern", "blocker"]),
    start: LocalDate,
    end: LocalDate,
    title: z.string().trim().max(200, "Titel zu lang (max. 200 Zeichen)").optional().transform((t) => t || null),
  })
  .refine((e) => e.end > e.start, "Ende muss nach Beginn liegen");

/** Externen Termin oder Blocker anlegen. input: { kind: "extern"|"blocker", start, end, title? }; start/end als
 *  datetime-local-String (Berliner Zeit) oder Date. Nur Handwerker, für sich selbst. */
export async function addEntry(ctx: Ctx, user: User, input: unknown): Promise<Entry> {
  craftsmanOnly(user);
  const [row] = await ctx.db.insert(calendarEntries).values({ ...EntryInput.parse(input), craftsmanId: user.id }).returning();
  return row;
}

/** Eigenen Eintrag löschen. */
export async function deleteEntry(ctx: Ctx, user: User, entryId: number): Promise<void> {
  const deleted = await ctx.db
    .delete(calendarEntries)
    .where(and(eq(calendarEntries.id, entryId), eq(calendarEntries.craftsmanId, user.id)))
    .returning();
  if (!deleted.length) throw new UserError("Nicht erlaubt");
}

// "" aus dem Formular = unbegrenzt
const MaxInput = z.object({
  maxPerDay: z.union([
    z.literal("").transform(() => null),
    z.coerce.number("Ganze Zahl von 1 bis 50").int("Ganze Zahl von 1 bis 50").min(1, "Ganze Zahl von 1 bis 50").max(50, "Ganze Zahl von 1 bis 50"),
  ]),
});

/** Max. Termine pro Tag. input: { maxPerDay: "" (= unbegrenzt) | Zahl ≥ 1 }. Nur Handwerker. */
export async function setMaxPerDay(ctx: Ctx, user: User, input: unknown): Promise<void> {
  craftsmanOnly(user);
  await ctx.db.update(users).set(MaxInput.parse(input)).where(eq(users.id, user.id));
}

const short = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Alle Kalendereinträge, die [from, to) überschneiden, sortiert nach Start. */
export async function calendarItems(ctx: Ctx, craftsmanId: number, from: Date, to: Date): Promise<CalendarItem[]> {
  const [app, entries] = await Promise.all([
    ctx.db
      .select({ requestId: requests.id, start: options.start, end: options.end, name: users.name, description: requests.description })
      .from(requests)
      .innerJoin(options, eq(options.id, requests.chosenOptionId))
      .innerJoin(users, eq(users.id, requests.customerId))
      .where(and(eq(requests.craftsmanId, craftsmanId), isNull(requests.cancelledAt), lt(options.start, to), gt(options.end, from))),
    ctx.db
      .select()
      .from(calendarEntries)
      .where(and(eq(calendarEntries.craftsmanId, craftsmanId), lt(calendarEntries.start, to), gt(calendarEntries.end, from))),
  ]);
  const items: CalendarItem[] = [
    ...app.map((a) => ({ kind: "app" as const, start: a.start, end: a.end, requestId: a.requestId, title: short(`${a.name}: ${a.description}`) })),
    ...entries.map((e) => ({
      kind: e.kind, start: e.start, end: e.end, entryId: e.id,
      title: e.title ?? (e.kind === "extern" ? "Externer Termin" : "Blockiert"),
    })),
  ];
  return items.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Wirft UserError, wenn [start, end) blockiert ist, sich mit einem App- oder externen Termin überschneidet
 *  oder der Tag (Berliner Zeit, Tag von start) seine Kapazität maxPerDay erreicht hat. */
export async function assertBookable(ctx: Ctx, craftsmanId: number, start: Date, end: Date): Promise<void> {
  const day = dayKey(start);
  const [dayStart, dayEnd] = dayRange(day);
  const items = await calendarItems(ctx, craftsmanId, dayStart, end > dayEnd ? end : dayEnd);
  const overlaps = (i: CalendarItem) => i.start < end && i.end > start;
  if (items.some((i) => i.kind === "blocker" && overlaps(i))) throw new UserError("Der Handwerker hat diesen Zeitraum blockiert");
  const termine = items.filter((i) => i.kind !== "blocker");
  if (termine.some(overlaps)) throw new UserError("Der Zeitraum überschneidet sich mit einem anderen Termin");
  // Kapazität: Termine (App + extern), die an diesem Berliner Kalendertag beginnen
  const craftsman = await ctx.db.query.users.findFirst({ where: eq(users.id, craftsmanId), columns: { maxPerDay: true } });
  const max = craftsman?.maxPerDay;
  if (max != null && termine.filter((i) => dayKey(i.start) === day).length >= max)
    throw new UserError("An diesem Tag sind keine Termine mehr frei");
}
