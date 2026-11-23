import { and, desc, eq, inArray, or, sql, type SQLWrapper } from "drizzle-orm";
import { UserError } from "./errors";
import { z } from "zod";
import type { Ctx } from "./context";
import { LEVELS, users, type Category } from "./db/schema";
import type { User } from "./requests";

export const CATEGORY_LABELS = {
  notfall: "Notfall",
  kurzfristig: "Kurzfristig (1–3 Tage)",
  normal: "Normal (4–10 Tage)",
  spaet: "Später (ab 11 Tagen)",
} as const;

export const LEVEL_LABELS = { frei: "🟢 frei", eingeschraenkt: "🟡 eingeschränkt", ausgebucht: "🔴 ausgebucht" } as const;

// "" aus dem Formular = keine Angabe
const Level = z.union([z.enum(LEVELS), z.literal("")]).transform((v) => v || null);
const AvailabilityInput = z.object({ notfall: Level, kurzfristig: Level, normal: Level, spaet: Level });

export async function setAvailability(ctx: Ctx, user: User, input: unknown) {
  if (user.role !== "handwerker") throw new UserError("Nicht erlaubt");
  await ctx.db.update(users).set(AvailabilityInput.parse(input)).where(eq(users.id, user.id));
}

export const PAGE_SIZE = 20;

/** Seite `page` (ab 1) einer Liste: lädt einen Eintrag mehr, um zu wissen, ob es eine nächste Seite gibt. */
export async function paged<T>(page: number, load: (limit: number, offset: number) => Promise<T[]>) {
  const rows = await load(PAGE_SIZE + 1, (Math.max(1, Math.floor(page) || 1) - 1) * PAGE_SIZE);
  return Object.assign(rows.slice(0, PAGE_SIZE), { more: rows.length > PAGE_SIZE });
}

// SQLite ignoriert Groß/Klein nur bei ASCII – Umlaute angleichen; % und _ aus der Eingabe gelten wörtlich
const fold = (col: SQLWrapper) => sql`lower(replace(replace(replace(${col}, 'Ä', 'ä'), 'Ö', 'ö'), 'Ü', 'ü'))`;
const escape = (s: string) => s.toLowerCase().replace(/[\\%_]/g, "\\$&");
const like = (col: SQLWrapper, pattern: string) => sql`${fold(col)} like ${pattern} escape '\\'`;

export type Search = { urgency?: Category; trade?: string; place?: string };

/**
 * Suche: ohne Dringlichkeit alle Handwerker, sonst nur „frei“ (zuerst) und „eingeschränkt“.
 * Gewerk enthält `trade`; `place` = PLZ beginnt damit oder Ort enthält es (jeweils ohne Groß/Klein). Filter läuft in SQL.
 */
export function findCraftsmen(ctx: Ctx, { urgency, trade, place }: Search = {}, page = 1) {
  const t = trade?.trim(), p = place?.trim();
  const col = urgency && users[urgency];
  const where = and(
    eq(users.role, "handwerker"),
    col && inArray(col, ["frei", "eingeschraenkt"]),
    t ? like(users.trade, `%${escape(t)}%`) : undefined,
    p ? or(like(users.plz, `${escape(p)}%`), like(users.ort, `%${escape(p)}%`)) : undefined,
  );
  const order = [...(col ? [desc(eq(col, "frei"))] : []), users.name, users.id];
  return paged(page, (limit, offset) => ctx.db.select().from(users).where(where).orderBy(...order).limit(limit).offset(offset));
}
