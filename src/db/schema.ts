import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const craftsmen = sqliteTable("craftsmen", {
  id: integer().primaryKey(),
  name: text().notNull(),
  trade: text().notNull(),
});

export const appointments = sqliteTable(
  "appointments",
  {
    id: integer().primaryKey(),
    craftsmanId: integer().notNull().references(() => craftsmen.id),
    start: integer({ mode: "timestamp" }).notNull(),
    customerName: text().notNull(),
    customerEmail: text().notNull(),
  },
  // Doppelbuchungen verhindert die DB – kein Race Condition-Code nötig.
  (t) => [uniqueIndex("one_booking_per_slot").on(t.craftsmanId, t.start)],
);
