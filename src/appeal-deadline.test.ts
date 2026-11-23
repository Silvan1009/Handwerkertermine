import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Ctx } from "./context";
import { requests, users } from "./db/schema";
import { appealRating, createRequest, decideAppeal, rateUrgency, type User } from "./requests";
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
