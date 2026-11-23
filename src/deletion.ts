import { and, eq, exists, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { endAllSessions } from "./accounts";
import type { Ctx } from "./context";
import { calendarEntries, images, options, requests, users } from "./db/schema";
import { UserError } from "./errors";
import type { User } from "./requests";

export const DELETED_NAME = "Gelöschtes Konto";
const Confirm = z.object({ confirm: z.literal("LÖSCHEN", "Zur Bestätigung bitte LÖSCHEN eintippen") });

/**
 * Konto löschen = anonymisieren (Zeile bleibt, damit vergangene Termine beim Gegenüber erhalten bleiben).
 * Offene und künftige Anfragen werden storniert (Mail an die Gegenseite), Kunde: Fotos weg, Texte „(gelöscht)“;
 * Handwerker: Kalender weg, Inserat weg. phoneHash/phoneHint bleiben – der Bewertungsstand hängt an der Nummer.
 * Danach sind alle Sitzungen ungültig und die E-Mail-Adresse ist frei.
 */
export async function deleteAccount(ctx: Ctx, user: User, input: unknown, now = new Date()) {
  Confirm.parse(input);
  if (user.deletedAt) throw new UserError("Konto ist bereits gelöscht");
  const isKunde = user.role === "kunde";
  const mine = eq(isKunde ? requests.customerId : requests.craftsmanId, user.id);
  const future = ctx.db.select().from(options).where(and(eq(options.id, requests.chosenOptionId), gt(options.start, now)));
  // Eine Batch-Anweisung = atomar: entweder alles oder nichts.
  const [cancelled] = await ctx.db.batch([
    ctx.db
      .update(requests)
      .set({ cancelledAt: now })
      .where(and(mine, isNull(requests.cancelledAt), or(isNull(requests.chosenOptionId), exists(future))))
      .returning(),
    ctx.db
      .update(users)
      .set({
        name: DELETED_NAME, email: `geloescht-${user.id}@invalid`, trade: null, plz: null, ort: null, pricing: null,
        maxPerDay: null, notfall: null, kurzfristig: null, normal: null, spaet: null, deletedAt: now,
      })
      .where(eq(users.id, user.id)),
    ...(isKunde
      ? [
          ctx.db.delete(images).where(inArray(images.requestId, ctx.db.select({ id: requests.id }).from(requests).where(mine))),
          ctx.db
            .update(requests)
            .set({ description: "(gelöscht)", appealReason: sql`iif(${requests.appealReason} is null, null, '(gelöscht)')` })
            .where(mine),
        ]
      : [ctx.db.delete(calendarEntries).where(eq(calendarEntries.craftsmanId, user.id))]),
  ]);
  await endAllSessions(ctx, user.id);
  // Mail an die Gegenseite (deren Adresse bleibt unverändert). Ein Mailfehler kippt die Löschung nicht.
  const others = cancelled.length
    ? await ctx.db.query.users.findMany({ where: inArray(users.id, cancelled.map((r) => (isKunde ? r.craftsmanId : r.customerId))) })
    : [];
  const subject = `Anfrage storniert: ${isKunde ? "Kunde" : "Handwerker"} hat sein Konto gelöscht`;
  for (const r of cancelled) {
    const other = others.find((u) => u.id === (isKunde ? r.craftsmanId : r.customerId))!;
    try {
      await ctx.send(other.email, subject, `${subject}\n\nAnfrage: ${r.description}\n\n${ctx.appUrl}`);
    } catch (e) {
      console.error("Mailversand fehlgeschlagen", e);
    }
  }
  return cancelled;
}
