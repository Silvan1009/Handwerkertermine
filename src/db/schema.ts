import { relations, sql } from "drizzle-orm";
import { blob, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { Condition, Pricing } from "../pricing";

export const LEVELS = ["frei", "eingeschraenkt", "ausgebucht"] as const;
export const CATEGORIES = ["notfall", "kurzfristig", "normal", "spaet"] as const;
// gut = passend, schlecht = übertrieben, katastrophe = stark übertrieben, unterschaetzt = dringender als angegeben (keine Strafe)
export const RATINGS = ["gut", "schlecht", "katastrophe", "unterschaetzt"] as const;
export const APPEALS = ["offen", "zurueckgenommen", "bestaetigt"] as const;
export const ROLES = ["kunde", "handwerker"] as const;
export type Category = (typeof CATEGORIES)[number];
export type Rating = (typeof RATINGS)[number];
const level = () => text({ enum: LEVELS }); // null = keine Angabe

export const users = sqliteTable(
  "users",
  {
  id: integer().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  role: text({ enum: ROLES }).notNull(),
  trade: text(),
  plz: text(),
  ort: text(),
  // Inserat: wie frei ist der Handwerker je Dringlichkeit (nur für Handwerker relevant)
  notfall: level(),
  kurzfristig: level(),
  normal: level(),
  spaet: level(),
  pricing: text({ mode: "json" }).$type<Pricing>(), // Rabatt-/Aufschlagsregeln
  sessionVersion: integer().notNull().default(0), // hochzählen = alle Sitzungen des Users ungültig
  maxPerDay: integer(), // Handwerker: max. Termine pro Tag (App + extern), null = unbegrenzt
  // Verifizierte Handynummer: nur HMAC-Hash (+ letzte 2 Ziffern zur Anzeige). Bewertungen hängen an der Nummer.
  phoneHash: text(),
  phoneHint: text(),
  deletedAt: integer({ mode: "timestamp" }), // Konto gelöscht (anonymisiert); phoneHash bleibt für den Bewertungsstand
  },
  // eine Nummer gehört höchstens einem AKTIVEN Konto
  (t) => [uniqueIndex("users_phone_active").on(t.phoneHash).where(sql`${t.deletedAt} is null`)],
);

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
    appeal: text({ enum: APPEALS }), // Einspruch des Kunden gegen die Bewertung; null = keiner
    appealReason: text(),
    appealedAt: integer({ mode: "timestamp" }), // Einspruchsfrist: 7 Tage ab hier
    appealNotifiedAt: integer({ mode: "timestamp" }), // Mail „Frist abgelaufen“ verschickt (einmal je Einspruch)
    // Bei Buchung geltende Rabatte und Aufschläge, als Snapshot – spätere Regeländerungen ändern sie nicht
    conditions: text({ mode: "json" }).$type<Condition[]>().notNull(),
    // Status wird abgeleitet (siehe statusOf) – keine separate Statusspalte, die auseinanderlaufen kann.
    chosenOptionId: integer(),
    cancelledAt: integer({ mode: "timestamp" }), // vom Kunden storniert
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

/** Kalender des Handwerkers: Termine außerhalb der App und Blocker (ganzer Tag, Tagesabschnitt, einzelne Stunden). */
export const calendarEntries = sqliteTable(
  "calendar_entries",
  {
    id: integer().primaryKey(),
    craftsmanId: integer().notNull().references(() => users.id),
    kind: text({ enum: ["extern", "blocker"] }).notNull(),
    start: integer({ mode: "timestamp" }).notNull(),
    end: integer({ mode: "timestamp" }).notNull(),
    title: text(),
  },
  (t) => [index("calendar_craftsman_start").on(t.craftsmanId, t.start)],
);

/** Fotos zur Anfrage – direkt in der DB, kein Dateispeicher nötig. */
export const images = sqliteTable(
  "images",
  {
    id: integer().primaryKey(),
    requestId: integer().notNull().references(() => requests.id),
    mime: text().notNull(),
    data: blob({ mode: "buffer" }).notNull(),
  },
  (t) => [index("images_request").on(t.requestId)],
);

export const requestsRelations = relations(requests, ({ one, many }) => ({
  customer: one(users, { fields: [requests.customerId], references: [users.id] }),
  craftsman: one(users, { fields: [requests.craftsmanId], references: [users.id] }),
  options: many(options),
  images: many(images),
}));

export const imagesRelations = relations(images, ({ one }) => ({
  request: one(requests, { fields: [images.requestId], references: [requests.id] }),
}));

export const optionsRelations = relations(options, ({ one }) => ({
  request: one(requests, { fields: [options.requestId], references: [requests.id] }),
}));
