import { relations } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Condition, Pricing } from "../pricing";

export const LEVELS = ["frei", "eingeschraenkt", "ausgebucht"] as const;
export const CATEGORIES = ["notfall", "kurzfristig", "normal", "spaet"] as const;
export const RATINGS = ["gut", "schlecht", "katastrophe"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Rating = (typeof RATINGS)[number];
const level = () => text({ enum: LEVELS }); // null = keine Angabe

export const users = sqliteTable("users", {
  id: integer().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  role: text({ enum: ["kunde", "handwerker"] }).notNull(),
  trade: text(),
  // Inserat: wie frei ist der Handwerker je Dringlichkeit (nur für Handwerker relevant)
  notfall: level(),
  kurzfristig: level(),
  normal: level(),
  spaet: level(),
  pricing: text({ mode: "json" }).$type<Pricing>(), // Rabatt-/Aufschlagsregeln
});

export const requests = sqliteTable("requests", {
  id: integer().primaryKey(),
  customerId: integer().notNull().references(() => users.id),
  craftsmanId: integer().notNull().references(() => users.id),
  description: text().notNull(),
  urgency: text({ enum: CATEGORIES }).notNull().default("normal"), // Selbsteinschätzung des Kunden
  urgencyRating: text({ enum: RATINGS }), // Bewertung der Selbsteinschätzung durch den Handwerker
  // Bei Buchung geltende Rabatte und Aufschläge, als Snapshot – spätere Regeländerungen ändern sie nicht
  conditions: text({ mode: "json" }).$type<Condition[]>().notNull().default([]),
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
