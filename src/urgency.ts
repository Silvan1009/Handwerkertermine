import { and, desc, eq, inArray, isNotNull, isNull, lte, or, type SQL } from "drizzle-orm";
import type { Ctx } from "./context";
import { alias } from "drizzle-orm/sqlite-core";
import { requests, users, type Category, type Rating } from "./db/schema";
import { DAY } from "./ratelimit";

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
 * - Vom Handwerker zurückgenommene Bewertungen zählen nicht, solche mit offenem Einspruch erst nach 7 Tagen wieder.
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

/** Ein offener Einspruch setzt die Bewertung nur so lange aus – entscheidet der Handwerker nicht, zählt sie danach wieder. */
export const APPEAL_PERIOD = 7 * DAY;
export const appealDeadline = (appealedAt: Date) => new Date(appealedAt.getTime() + APPEAL_PERIOD);

/** NAHTSTELLE (Agent frist): SQL-Bedingung, welche Bewertungen zum Zeitpunkt `now` zählen. */
export function ratingCounts(now: Date): SQL {
  // zurückgenommen zählt nie; offener Einspruch nur bis zum Fristablauf nicht
  return or(
    isNull(requests.appeal),
    eq(requests.appeal, "bestaetigt"),
    and(eq(requests.appeal, "offen"), lte(requests.appealedAt, new Date(now.getTime() - APPEAL_PERIOD))),
  )!;
}

/** NAHTSTELLE (Agent telefon): Bewertungsstand je Kunde. Welche Bewertungen zählen, entscheidet ausschließlich ratingCounts(now). */
export async function standingsOf(ctx: Ctx, customerIds: number[], now = new Date()) {
  // Bewertungen zählen pro Person: alle Konten mit derselben bestätigten Nummer (auch gelöschte) – eine Sperre lässt sich
  // nicht mit einem neuen Konto umgehen. Konten ohne Nummer zählen für sich. Eine Abfrage für alle Kunden.
  const me = alias(users, "me");
  const author = alias(users, "author");
  const rows = customerIds.length
    ? await ctx.db
        .select({ customerId: me.id, rating: requests.urgencyRating })
        .from(requests)
        .innerJoin(author, eq(author.id, requests.customerId))
        .innerJoin(me, or(eq(me.id, author.id), eq(me.phoneHash, author.phoneHash)))
        .where(
          and(
            inArray(me.id, customerIds),
            isNotNull(requests.urgencyRating),
            ratingCounts(now),
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
