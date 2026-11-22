import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { Ctx } from "./context";
import { requests, type Category, type Rating } from "./db/schema";

export const RATING_LABELS = { gut: "👍", schlecht: "👎", katastrophe: "❌" } as const;

/**
 * Scoring der Dringlichkeits-Selbsteinschätzung:
 * - Startguthaben 3, dann je Bewertung 👍 +1, 👎 −2, ❌ −5.
 * - Nur die letzten 10 Bewertungen zählen → Sperre ist vorübergehend.
 * - Score < 0 → keine Notfall-/kurzfristigen Anfragen. Normale/späte Termine bleiben möglich;
 *   gut bewertete davon heben die Sperre wieder auf (nach einem ❌ z. B. zwei 👍).
 */
export const RATING_POINTS = { gut: 1, schlecht: -2, katastrophe: -5 } as const;
const START = 3;
const WINDOW = 10;
export const RESTRICTED: Category[] = ["notfall", "kurzfristig"];

/** Reine Funktion; ratings: neueste zuerst. */
export function scoreOf(ratings: Rating[]) {
  const score = ratings.slice(0, WINDOW).reduce((s, r) => s + RATING_POINTS[r], START);
  return { score, locked: score < 0 };
}

export async function standingOf(ctx: Ctx, customerId: number) {
  const rows = await ctx.db
    .select({ rating: requests.urgencyRating })
    .from(requests)
    .where(and(eq(requests.customerId, customerId), isNotNull(requests.urgencyRating)))
    .orderBy(desc(requests.id));
  const ratings = rows.map((r) => r.rating!);
  return { ratings, ...scoreOf(ratings) };
}
