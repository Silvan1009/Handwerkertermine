import { and, eq, gte, lt } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./db";
import { appointments } from "./db/schema";

const SLOT_HOURS = [8, 9, 10, 11, 13, 14, 15, 16]; // 1h-Slots, Mittagspause 12–13

/** Alle Slot-Startzeiten eines Tages (Mo–Fr). Reine Funktion → trivial testbar. */
export function slotsFor(day: Date): Date[] {
  if (day.getDay() === 0 || day.getDay() === 6) return [];
  return SLOT_HOURS.map((h) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h));
}

export function isValidSlot(start: Date, now: Date): boolean {
  return start > now && slotsFor(start).some((s) => s.getTime() === start.getTime());
}

export async function freeSlots(db: Db, craftsmanId: number, day: Date, now = new Date()) {
  const from = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
  const taken = await db
    .select({ start: appointments.start })
    .from(appointments)
    .where(and(eq(appointments.craftsmanId, craftsmanId), gte(appointments.start, from), lt(appointments.start, to)));
  const takenTimes = new Set(taken.map((t) => t.start.getTime()));
  return slotsFor(day).filter((s) => s > now && !takenTimes.has(s.getTime()));
}

export const BookingInput = z.object({
  craftsmanId: z.coerce.number().int().positive(),
  start: z.coerce.date(),
  customerName: z.string().trim().min(1, "Name fehlt"),
  customerEmail: z.email("Ungültige E-Mail"),
});

export async function book(db: Db, input: unknown, now = new Date()) {
  const data = BookingInput.parse(input);
  if (!isValidSlot(data.start, now)) throw new Error("Ungültiger Termin");
  const [row] = await db.insert(appointments).values(data).onConflictDoNothing().returning();
  if (!row) throw new Error("Termin bereits vergeben");
  return row;
}
