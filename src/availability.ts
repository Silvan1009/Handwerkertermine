import { and, desc, eq, inArray } from "drizzle-orm";
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

/** Suche: ohne Dringlichkeit alle Handwerker, sonst nur „frei“ (zuerst) und „eingeschränkt“. Filter läuft in SQL. */
export function findCraftsmen(ctx: Ctx, urgency?: Category, limit = 100) {
  const q = ctx.db.select().from(users);
  const isCraftsman = eq(users.role, "handwerker");
  if (!urgency) return q.where(isCraftsman).orderBy(users.name).limit(limit);
  const col = users[urgency];
  return q
    .where(and(isCraftsman, inArray(col, ["frei", "eingeschraenkt"])))
    .orderBy(desc(eq(col, "frei")), users.name)
    .limit(limit);
}
