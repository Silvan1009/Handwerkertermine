import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Ctx } from "./context";
import { requests, users } from "./db/schema";
import { appealRating, createRequest, decideAppeal, notifyExpiredAppeals, rateUrgency, type User } from "./requests";
import { DAY } from "./ratelimit";
import { testCtx } from "./test-ctx";
import { formatLocal } from "./time";
import { appealDeadline, standingOf, standingsOf } from "./urgency";

let ctx: Ctx, mails: Awaited<ReturnType<typeof testCtx>>["mails"];
let kunde: User, handwerker: User;

beforeEach(async () => {
  ({ ctx, mails } = await testCtx());
  [kunde, handwerker] = await ctx.db
    .insert(users)
    .values([
      { name: "K1", email: "k1@x.de", role: "kunde" },
      { name: "H1", email: "h1@x.de", role: "handwerker" },
    ])
    .returning();
});

const t0 = new Date("2030-09-02T08:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);
/** Anfrage (normal – braucht keine bestätigte Handynummer), vom Handwerker als ❌ bewertet, Kunde legt zum Zeitpunkt `appealedAt` Einspruch ein. */
async function mitEinspruch(appealedAt = t0) {
  const r = await createRequest(ctx, kunde, { craftsmanId: handwerker.id, description: "Heizung tropft", urgency: "normal" });
  await rateUrgency(ctx, handwerker, r.id, "katastrophe");
  await appealRating(ctx, kunde, r.id, "War wirklich dringend", appealedAt);
  return r;
}
const scoreAt = async (now: Date) => (await standingsOf(ctx, [kunde.id], now)).get(kunde.id)!.score;

describe("Einspruchsfrist (7 Tage)", () => {
  it("appealedAt wird gesetzt; Mail an den Handwerker nennt die Frist", async () => {
    const r = await mitEinspruch();
    const [row] = await ctx.db.select().from(requests).where(eq(requests.id, r.id));
    expect(row.appealedAt).toEqual(t0);
    expect(appealDeadline(t0)).toEqual(at(7 * DAY));
    expect(mails.at(-1)).toMatchObject({ to: "h1@x.de", subject: "Einspruch von K1 gegen deine Bewertung" });
    expect(mails.at(-1)!.text).toContain(`Bitte entscheide bis ${formatLocal(at(7 * DAY))} – danach zählt die Bewertung wieder`);
  });

  it("offener Einspruch zählt nicht – ab genau 7 Tagen zählt die Bewertung wieder", async () => {
    await mitEinspruch();
    expect(await scoreAt(t0)).toBe(3);
    expect(await scoreAt(at(7 * DAY - 1000))).toBe(3);
    expect(await scoreAt(at(7 * DAY))).toBe(-2);
    expect(await scoreAt(at(30 * DAY))).toBe(-2);
  });

  it("zurückgenommen zählt nie – auch nicht nach Fristablauf", async () => {
    const r = await mitEinspruch();
    await decideAppeal(ctx, handwerker, r.id, "zurueckgenommen");
    for (const now of [t0, at(7 * DAY), at(365 * DAY)]) expect(await scoreAt(now)).toBe(3);
  });

  it("bestätigt zählt sofort – auch vor Fristablauf", async () => {
    const r = await mitEinspruch();
    await decideAppeal(ctx, handwerker, r.id, "bestaetigt");
    expect(await scoreAt(t0)).toBe(-2);
    expect(await scoreAt(at(DAY))).toBe(-2);
  });

  it("Handwerker kann nach Fristablauf noch entscheiden", async () => {
    const r = await mitEinspruch(new Date(Date.now() - 8 * DAY));
    expect((await standingOf(ctx, kunde.id)).score).toBe(-2); // Frist abgelaufen → zählt wieder
    await decideAppeal(ctx, handwerker, r.id, "zurueckgenommen");
    expect(mails.at(-1)).toMatchObject({ to: "k1@x.de", subject: "Einspruch erfolgreich: H1 hat die Bewertung zurückgenommen" });
    expect((await standingOf(ctx, kunde.id)).score).toBe(3);
    await expect(decideAppeal(ctx, handwerker, r.id, "bestaetigt")).rejects.toThrow("Kein offener Einspruch");
  });

  it("die Frist läuft je Einspruch: ein älterer zählt wieder, ein neuerer noch nicht", async () => {
    await mitEinspruch(t0);
    await mitEinspruch(at(5 * DAY));
    expect(await scoreAt(at(6 * DAY))).toBe(3);
    expect(await scoreAt(at(7 * DAY))).toBe(-2);
    expect(await scoreAt(at(12 * DAY))).toBe(-7);
  });
});

describe("Mail bei Fristablauf", () => {
  const fristMails = () => mails.filter((m) => m.subject.startsWith("Einspruchsfrist abgelaufen"));

  it("vor Fristablauf passiert nichts, ab genau 7 Tagen gehen Mails an beide Seiten – nur einmal", async () => {
    await mitEinspruch();
    expect(await notifyExpiredAppeals(ctx, at(7 * DAY - 1000))).toBe(0);
    expect(fristMails()).toHaveLength(0);

    expect(await notifyExpiredAppeals(ctx, at(7 * DAY))).toBe(1);
    expect(fristMails().map((m) => m.to).sort()).toEqual(["h1@x.de", "k1@x.de"]);
    expect(await notifyExpiredAppeals(ctx, at(8 * DAY))).toBe(0); // schon benachrichtigt
    expect(fristMails()).toHaveLength(2);
  });

  it("Kunde erfährt, dass die Bewertung wieder zählt – bei Sperre mit Hinweis; Handwerker, dass er weiter entscheiden kann", async () => {
    await mitEinspruch(); // ❌ → Score −2, sobald die Bewertung wieder zählt
    await notifyExpiredAppeals(ctx, at(7 * DAY));
    const kundeMail = fristMails().find((m) => m.to === "k1@x.de")!;
    expect(kundeMail.text).toContain("H1 hat über deinen Einspruch nicht innerhalb von 7 Tagen entschieden");
    expect(kundeMail.text).toContain("❌ stark übertrieben");
    expect(kundeMail.text).toContain("vorübergehend gesperrt");
    const hwMail = fristMails().find((m) => m.to === "h1@x.de")!;
    expect(hwMail.text).toContain("Du hast den Einspruch von K1 nicht innerhalb von 7 Tagen entschieden");
    expect(hwMail.text).toContain("weiterhin zurücknehmen oder bestätigen");
  });

  it("ohne Sperre kein Sperrhinweis", async () => {
    const r = await createRequest(ctx, kunde, { craftsmanId: handwerker.id, description: "Tür klemmt", urgency: "normal" });
    await rateUrgency(ctx, handwerker, r.id, "schlecht"); // 👎: Score 1
    await appealRating(ctx, kunde, r.id, "War nicht übertrieben", t0);
    await notifyExpiredAppeals(ctx, at(7 * DAY));
    expect(fristMails().find((m) => m.to === "k1@x.de")!.text).not.toContain("gesperrt");
  });

  it("entschiedene Einsprüche lösen nie eine Mail aus", async () => {
    const a = await mitEinspruch();
    const b = await mitEinspruch();
    await decideAppeal(ctx, handwerker, a.id, "zurueckgenommen");
    await decideAppeal(ctx, handwerker, b.id, "bestaetigt");
    expect(await notifyExpiredAppeals(ctx, at(30 * DAY))).toBe(0);
    expect(fristMails()).toHaveLength(0);
  });

  it("zwei Einsprüche mit verschiedenem Ablauf: jeder genau einmal", async () => {
    await mitEinspruch(t0);
    await mitEinspruch(at(5 * DAY));
    expect(await notifyExpiredAppeals(ctx, at(7 * DAY))).toBe(1);
    expect(await notifyExpiredAppeals(ctx, at(12 * DAY))).toBe(1);
    expect(fristMails()).toHaveLength(4);
  });

  it("gleichzeitige Läufe (z. B. zwei Instanzen): jede Mail nur einmal", async () => {
    await mitEinspruch();
    const counts = await Promise.all([notifyExpiredAppeals(ctx, at(8 * DAY)), notifyExpiredAppeals(ctx, at(8 * DAY))]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
    expect(fristMails()).toHaveLength(2);
  });

  it("gelöschtes Konto bekommt keine Mail, die andere Seite schon; ein Mailfehler lässt den Job nicht scheitern", async () => {
    await mitEinspruch();
    await ctx.db.update(users).set({ deletedAt: at(DAY), email: "geloescht-1@invalid" }).where(eq(users.id, kunde.id));
    await notifyExpiredAppeals(ctx, at(7 * DAY));
    expect(fristMails().map((m) => m.to)).toEqual(["h1@x.de"]);

    await mitEinspruch(at(8 * DAY)); // zweiter Einspruch, jetzt schlägt der Versand fehl
    ctx.send = async () => { throw new Error("SMTP down"); };
    const err = console.error;
    console.error = () => {};
    await expect(notifyExpiredAppeals(ctx, at(16 * DAY))).resolves.toBe(1);
    console.error = err;
  });
});
