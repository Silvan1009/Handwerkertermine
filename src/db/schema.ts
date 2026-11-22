import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  role: text({ enum: ["kunde", "handwerker"] }).notNull(),
  trade: text(),
});

export const requests = sqliteTable("requests", {
  id: integer().primaryKey(),
  customerId: integer().notNull().references(() => users.id),
  craftsmanId: integer().notNull().references(() => users.id),
  description: text().notNull(),
  // Status wird abgeleitet (siehe statusOf) – keine separate Statusspalte, die auseinanderlaufen kann.
  chosenOptionId: integer(),
});

/** Vorschlag des Handwerkers: fester Termin oder Zeitfenster – beides ist start..end. */
export const options = sqliteTable("options", {
  id: integer().primaryKey(),
  requestId: integer().notNull().references(() => requests.id),
  // Kunde (Gegenvorschlag) oder Handwerker – angenommen wird immer von der anderen Seite.
  proposedById: integer().notNull().references(() => users.id),
  kind: text({ enum: ["termin", "zeitfenster"] }).notNull(),
  start: integer({ mode: "timestamp" }).notNull(),
  end: integer({ mode: "timestamp" }).notNull(),
  rejected: integer({ mode: "boolean" }).notNull().default(false),
});

export const requestsRelations = relations(requests, ({ one, many }) => ({
  customer: one(users, { fields: [requests.customerId], references: [users.id] }),
  craftsman: one(users, { fields: [requests.craftsmanId], references: [users.id] }),
  options: many(options),
}));

export const optionsRelations = relations(options, ({ one }) => ({
  request: one(requests, { fields: [options.requestId], references: [requests.id] }),
}));
