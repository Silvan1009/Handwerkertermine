// VERTRAG (vom Lead festgelegt): Signaturen und Semantik nicht ohne Absprache ändern.
// Implementierung: Sub-Agent „kalender-logik“. Bis dahin werfen die Funktionen.
import type { Ctx } from "./context";
import type { calendarEntries } from "./db/schema";
import type { User } from "./requests";

export type Entry = typeof calendarEntries.$inferSelect;

/** Ein Eintrag im Kalender des Handwerkers. */
export type CalendarItem =
  | { kind: "app"; start: Date; end: Date; title: string; requestId: number } // bestätigter, nicht stornierter App-Termin
  | { kind: "extern" | "blocker"; start: Date; end: Date; title: string; entryId: number };

const todo = (): never => {
  throw new Error("noch nicht implementiert (kalender-logik)");
};

/** Externen Termin oder Blocker anlegen. input: { kind: "extern"|"blocker", start, end, title? }; start/end als
 *  datetime-local-String (Berliner Zeit) oder Date. Nur Handwerker, für sich selbst. */
export async function addEntry(ctx: Ctx, user: User, input: unknown): Promise<Entry> {
  return todo();
}

/** Eigenen Eintrag löschen. */
export async function deleteEntry(ctx: Ctx, user: User, entryId: number): Promise<void> {
  return todo();
}

/** Max. Termine pro Tag. input: { maxPerDay: "" (= unbegrenzt) | Zahl ≥ 1 }. Nur Handwerker. */
export async function setMaxPerDay(ctx: Ctx, user: User, input: unknown): Promise<void> {
  return todo();
}

/** Alle Kalendereinträge, die [from, to) überschneiden, sortiert nach Start. */
export async function calendarItems(ctx: Ctx, craftsmanId: number, from: Date, to: Date): Promise<CalendarItem[]> {
  return todo();
}

/** Wirft UserError, wenn [start, end) blockiert ist, sich mit einem App- oder externen Termin überschneidet
 *  oder der Tag (Berliner Zeit, Tag von start) seine Kapazität maxPerDay erreicht hat. */
export async function assertBookable(ctx: Ctx, craftsmanId: number, start: Date, end: Date): Promise<void> {
  return todo();
}
