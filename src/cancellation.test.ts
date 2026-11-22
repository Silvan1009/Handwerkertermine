import { beforeEach, describe, expect, it } from "vitest";
import type { Ctx } from "./context";
import { users } from "./db/schema";
import { DAY } from "./ratelimit";
import { canCancel, cancelRequest, chooseOption, createRequest, listRequests, proposeOption, rateUrgency, rejectOptions, statusOf, type User } from "./requests";
import { testCtx } from "./test-ctx";

const proposedAt = new Date(2030, 0, 1);
const start = (day: number, h = 8) => new Date(2030, 0, day, h);
const opt = (requestId: number, day: number, h = 8) => ({ requestId, kind: "termin", start: start(day, h), end: start(day, h + 2) });

let ctx: Ctx, mails: Awaited<ReturnType<typeof testCtx>>["mails"];
let kunde: User, andererKunde: User, handwerker: User, andererHandwerker: User;

beforeEach(async () => {
  ({ ctx, mails } = await testCtx());
  [kunde, andererKunde, handwerker, andererHandwerker] = await ctx.db
    .insert(users)
    .values([
      { name: "K1", email: "k1@x.de", role: "kunde" },
      { name: "K2", email: "k2@x.de", role: "kunde" },
      { name: "H1", email: "h1@x.de", role: "handwerker" },
      { name: "H2", email: "h2@x.de", role: "handwerker" },
    ])
    .returning();
});

const anfrage = () => createRequest(ctx, kunde, { craftsmanId: handwerker.id, description: "Wasserhahn tropft", urgency: "normal" });
/** Bestätigte Anfrage mit Termin am 2030-01-<day> um 8 Uhr. */
const bestaetigt = async (day = 7) => {
  const r = await anfrage();
  await chooseOption(ctx, kunde, (await proposeOption(ctx, handwerker, opt(r.id, day), proposedAt)).id);
  return r;
};
const status = async (id: number) => statusOf((await listRequests(ctx, kunde)).find((r) => r.id === id)!);

describe("Storno durch den Kunden", () => {
  it("unbestätigt jederzeit – Status „storniert“, Mail an den Handwerker", async () => {
    const ohne = await anfrage();
    const mitVorschlag = await anfrage();
    await proposeOption(ctx, handwerker, opt(mitVorschlag.id, 2, 8), proposedAt);
    // auch wenn der Vorschlag unmittelbar bevorsteht: unbestätigt ist nichts fest
    await cancelRequest(ctx, kunde, ohne.id, start(2, 7));
    await cancelRequest(ctx, kunde, mitVorschlag.id, start(2, 7));
    expect(await status(ohne.id)).toBe("storniert");
    expect(await status(mitVorschlag.id)).toBe("storniert");
    expect(mails.at(-1)).toMatchObject({ to: "h1@x.de", subject: "Anfrage storniert von K1" });
  });

  it("bestätigt nur bis 24 h vor Beginn – genau 24 h geht noch", async () => {
    const knapp = await bestaetigt(7);
    await expect(cancelRequest(ctx, kunde, knapp.id, new Date(start(7).getTime() - DAY + 1))).rejects.toThrow(
      "Stornierung nur bis 24 h vor dem Termin möglich",
    );
    expect(await status(knapp.id)).toBe("bestätigt");

    const grenze = await bestaetigt(8);
    await cancelRequest(ctx, kunde, grenze.id, new Date(start(8).getTime() - DAY));
    expect(await status(grenze.id)).toBe("storniert"); // „storniert“ hat Vorrang vor „bestätigt“
  });

  it("nur der eigene Kunde darf stornieren", async () => {
    const r = await anfrage();
    for (const u of [handwerker, andererKunde, andererHandwerker])
      await expect(cancelRequest(ctx, u, r.id, proposedAt)).rejects.toThrow("Nicht erlaubt");
    await expect(cancelRequest(ctx, kunde, 999, proposedAt)).rejects.toThrow("Nicht erlaubt");
    expect(await status(r.id)).toBe("wartet auf Vorschlag");
  });

  it("doppelt stornieren → Fehler, nur eine Mail", async () => {
    const r = await anfrage();
    await cancelRequest(ctx, kunde, r.id, proposedAt);
    await expect(cancelRequest(ctx, kunde, r.id, proposedAt)).rejects.toThrow("bereits storniert");
    expect(mails.filter((m) => m.subject.startsWith("Anfrage storniert"))).toHaveLength(1);
  });

  it("nach dem Storno ist keine Folgeaktion mehr möglich", async () => {
    const r = await anfrage();
    const o = await proposeOption(ctx, handwerker, opt(r.id, 7), proposedAt);
    await cancelRequest(ctx, kunde, r.id, proposedAt);
    await expect(proposeOption(ctx, handwerker, opt(r.id, 9), proposedAt)).rejects.toThrow("Anfrage wurde storniert");
    await expect(proposeOption(ctx, kunde, opt(r.id, 9), proposedAt)).rejects.toThrow("Anfrage wurde storniert");
    await expect(chooseOption(ctx, kunde, o.id)).rejects.toThrow("Anfrage wurde storniert");
    await expect(rejectOptions(ctx, kunde, r.id)).rejects.toThrow("Anfrage wurde storniert");

    const b = await bestaetigt(10);
    await cancelRequest(ctx, kunde, b.id, proposedAt);
    await expect(rateUrgency(ctx, handwerker, b.id, "gut")).rejects.toThrow("Anfrage wurde storniert");
  });

  it("Storno und Annehmen gleichzeitig: nie storniert und zugleich neu bestätigt", async () => {
    const r = await anfrage();
    const o = await proposeOption(ctx, handwerker, opt(r.id, 7), proposedAt);
    const results = await Promise.allSettled([cancelRequest(ctx, kunde, r.id, proposedAt), chooseOption(ctx, kunde, o.id)]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });
});

describe("canCancel (für die UI)", () => {
  const now = new Date(2030, 0, 1, 12);
  const options = [{ id: 1, start: new Date(now.getTime() + DAY) }, { id: 2, start: new Date(now.getTime() + DAY - 1) }];
  it.each([
    ["unbestätigt, ohne Vorschläge", { cancelledAt: null, chosenOptionId: null, options: [] }, true],
    ["unbestätigt, Vorschlag gleich", { cancelledAt: null, chosenOptionId: null, options }, true],
    ["bestätigt, genau 24 h", { cancelledAt: null, chosenOptionId: 1, options }, true],
    ["bestätigt, knapp unter 24 h", { cancelledAt: null, chosenOptionId: 2, options }, false],
    ["bereits storniert", { cancelledAt: now, chosenOptionId: null, options: [] }, false],
  ])("%s → %s", (_, r, expected) => {
    expect(canCancel(r, now)).toBe(expected);
  });
});
