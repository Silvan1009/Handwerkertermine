import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Condition, Pricing } from "../pricing";

export const LEVELS = ["frei", "eingeschraenkt", "ausgebucht"] as const;
export const CATEGORIES = ["notfall", "kurzfristig", "normal", "spaet"] as const;
export const RATINGS = ["gut", "schlecht", "katastrophe"] as const;
export const ROLES = ["kunde", "handwerker"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Rating = (typeof RATINGS)[number];
const level = () => text({ enum: LEVELS }); // null = keine Angabe

export const users = sqliteTable("users", {
  id: integer().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  role: text({ enum: ROLES }).notNull(),
  trade: text(),
  // Inserat: wie frei ist der Handwerker je Dringlichkeit (nur für Handwerker relevant)
  notfall: level(),
  kurzfristig: level(),
  normal: level(),
  spaet: level(),
  pricing: text({ mode: "json" }).$type<Pricing>(), // Rabatt-/Aufschlagsregeln
  sessionVersion: integer().notNull().default(0), // hochzählen = alle Sitzungen des Users ungültig
});

export const requests = sqliteTable(
  "requests",
  {
    id: integer().primaryKey(),
    customerId: integer().notNull().references(() => users.id),
    craftsmanId: integer().notNull().references(() => users.id),
    description: text().notNull(),
    urgency: text({ enum: CATEGORIES }).notNull(), // Selbsteinschätzung des Kunden
    urgencyRating: text({ enum: RATINGS }), // Bewertung der Selbsteinschätzung durch den Handwerker
    ratedAt: integer({ mode: "timestamp" }),
    // Bei Buchung geltende Rabatte und Aufschläge, als Snapshot – spätere Regeländerungen ändern sie nicht
    conditions: text({ mode: "json" }).$type<Condition[]>().notNull(),
    // Status wird abgeleitet (siehe statusOf) – keine separate Statusspalte, die auseinanderlaufen kann.
    chosenOptionId: integer(),
  },
  (t) => [index("requests_customer").on(t.customerId), index("requests_craftsman").on(t.craftsmanId)],
);

/** Vorschlag: fester Termin oder Zeitfenster – beides ist start..end. */
export const options = sqliteTable(
  "options",
  {
    id: integer().primaryKey(),
    requestId: integer().notNull().references(() => requests.id),
    // Kunde (Gegenvorschlag) oder Handwerker – angenommen wird immer von der anderen Seite.
    proposedById: integer().notNull().references(() => users.id),
    kind: text({ enum: ["termin", "zeitfenster"] }).notNull(),
    start: integer({ mode: "timestamp" }).notNull(),
    end: integer({ mode: "timestamp" }).notNull(),
    rejected: integer({ mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("options_request").on(t.requestId)],
);

export const requestsRelations = relations(requests, ({ one, many }) => ({
  customer: one(users, { fields: [requests.customerId], references: [users.id] }),
  craftsman: one(users, { fields: [requests.craftsmanId], references: [users.id] }),
  options: many(options),
}));

export const optionsRelations = relations(options, ({ one }) => ({
  request: one(requests, { fields: [options.requestId], references: [requests.id] }),
}));
