import { and, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import type { Ctx } from "./context";
import { requests, type Category, type Rating } from "./db/schema";

export const RATING_ICONS = { gut: "👍", schlecht: "👎", katastrophe: "❌", unterschaetzt: "⬇️" } as const;
export const RATING_LABELS = {
  gut: "👍 passend",
  schlecht: "👎 übertrieben",
  katastrophe: "❌ stark übertrieben",
  unterschaetzt: "⬇️ dringender als angegeben",
} as const;

/**
 * Scoring der Dringlichkeits-Selbsteinschätzung:
 * - Startguthaben 3, dann je Bewertung 👍 +1, 👎 −2, ❌ −5, ⬇️ 0 (nur Übertreibung wird bestraft).
 * - Nur die letzten 10 Bewertungen (nach Bewertungszeitpunkt) zählen → Sperre ist vorübergehend.
 * - Bewertungen mit offenem Einspruch oder vom Handwerker zurückgenommene zählen nicht.
 * - Score < 0 → keine Notfall-/kurzfristigen Anfragen. Normale/späte Termine bleiben möglich;
 *   gut bewertete davon heben die Sperre wieder auf (nach einem ❌ z. B. zwei 👍).
 */
export const RATING_POINTS = { gut: 1, schlecht: -2, katastrophe: -5, unterschaetzt: 0 } as const;
const START = 3;
const WINDOW = 10;
export const RESTRICTED: Category[] = ["notfall", "kurzfristig"];
/** Gegen diese Bewertungen ist ein Einspruch möglich. */
export const APPEALABLE: Rating[] = ["schlecht", "katastrophe"];
export const LOCK_HINT =
  "Notfall- und kurzfristige Anfragen sind vorübergehend gesperrt. Gut eingeschätzte normale oder spätere Termine heben die Sperre wieder auf; " +
  "gegen eine Bewertung als übertrieben kannst du bei der Anfrage einmal Einspruch einlegen.";

/** Reine Funktion; ratings: neueste zuerst. */
export function scoreOf(ratings: Rating[]) {
  const score = ratings.slice(0, WINDOW).reduce((s, r) => s + RATING_POINTS[r], START);
  return { score, locked: score < 0 };
}

/** Bewertungsstand mehrerer Kunden mit einer einzigen Abfrage (kein N+1). */
export async function standingsOf(ctx: Ctx, customerIds: number[]) {
  const rows = customerIds.length
    ? await ctx.db
        .select({ customerId: requests.customerId, rating: requests.urgencyRating })
        .from(requests)
        .where(
          and(
            inArray(requests.customerId, customerIds),
            isNotNull(requests.urgencyRating),
            or(isNull(requests.appeal), eq(requests.appeal, "bestaetigt")), // offener Einspruch / zurückgenommen zählt nicht
          ),
        )
        .orderBy(desc(requests.ratedAt), desc(requests.id))
    : [];
  return new Map(
    customerIds.map((id) => {
      const ratings = rows.filter((r) => r.customerId === id).map((r) => r.rating!);
      return [id, { ratings, ...scoreOf(ratings) }] as const;
    }),
  );
}

export const standingOf = async (ctx: Ctx, customerId: number) => (await standingsOf(ctx, [customerId])).get(customerId)!;
