import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Ctx } from "./context";
import { requests, users } from "./db/schema";
import { cancelRequest, chooseOption, createRequest, proposeOption, type User } from "./requests";
import { testCtx } from "./test-ctx";

const now = new Date(2030, 0, 1);
let ctx: Ctx;
let kunde: User, andererKunde: User, handwerker: User;

beforeEach(async () => {
  ({ ctx } = await testCtx());
  [kunde, andererKunde, handwerker] = await ctx.db
    .insert(users)
    .values([
      { name: "K1", email: "k1@x.de", role: "kunde" },
      { name: "K2", email: "k2@x.de", role: "kunde" },
      { name: "H1", email: "h1@x.de", role: "handwerker", pricing: { erstkunde: { mode: "absolut", value: -2000 } } },
    ])
    .returning();
});

const anfrage = (k = kunde) => createRequest(ctx, k, { craftsmanId: handwerker.id, description: "Wasserhahn tropft", urgency: "normal" });
/** Vorschlag des Handwerkers am 7.1.2030 von h bis h+2 Uhr. */
const vorschlag = (requestId: number, h: number) =>
  proposeOption(ctx, handwerker, { requestId, kind: "termin", start: new Date(2030, 0, 7, h), end: new Date(2030, 0, 7, h + 2) }, now);
const bestaetigte = async () => (await ctx.db.select().from(requests)).filter((r) => r.chosenOptionId && !r.cancelledAt);
const kinds = (r: { conditions: { kind: string }[] }) => r.conditions.map((c) => c.kind);
const conditionsOf = async (id: number) => kinds((await ctx.db.query.requests.findFirst({ where: eq(requests.id, id) }))!);

describe("Doppelbuchung", () => {
  it("gleichzeitige Annahmen überschneidender Vorschläge: genau eine gewinnt", async () => {
    const [r1, r2] = [await anfrage(), await anfrage(andererKunde)];
    const [o1, o2] = [await vorschlag(r1.id, 8), await vorschlag(r2.id, 9)]; // 8–10 und 9–11 überschneiden sich
    const results = await Promise.allSettled([chooseOption(ctx, kunde, o1.id), chooseOption(ctx, andererKunde, o2.id)]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { message: "Der Zeitraum überschneidet sich mit einem anderen Termin" } });
    expect(await bestaetigte()).toHaveLength(1);
  });

  it("nicht überschneidende und stornierte Termine blockieren nicht", async () => {
    const [r1, r2] = [await anfrage(), await anfrage(andererKunde)];
    const [o1, o2] = [await vorschlag(r1.id, 8), await vorschlag(r2.id, 10)]; // 8–10 und 10–12: direkt hintereinander
    const results = await Promise.allSettled([chooseOption(ctx, kunde, o1.id), chooseOption(ctx, andererKunde, o2.id)]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);

    await cancelRequest(ctx, kunde, r1.id, now);
    const r3 = await anfrage();
    await chooseOption(ctx, kunde, (await vorschlag(r3.id, 8)).id); // Platz des stornierten Termins ist wieder frei
    expect(await bestaetigte()).toHaveLength(2);
  });
});

describe("Erstkundenrabatt", () => {
  it("stornierte Aufträge zählen nicht als früherer Auftrag", async () => {
    const r1 = await anfrage();
    await chooseOption(ctx, kunde, (await vorschlag(r1.id, 8)).id);
    expect(kinds(await anfrage())).toEqual([]); // bestätigt → kein Erstkunde mehr
    await cancelRequest(ctx, kunde, r1.id, now);
    expect(kinds(await anfrage())).toEqual(["erstkunde"]);
  });

  it("parallele Anfragen: nach Annahme der ersten verliert die zweite bei ihrer Annahme den Rabatt", async () => {
    const [r1, r2] = [await anfrage(), await anfrage()];
    expect([kinds(r1), kinds(r2)]).toEqual([["erstkunde"], ["erstkunde"]]);
    expect(kinds(await chooseOption(ctx, kunde, (await vorschlag(r1.id, 8)).id))).toEqual(["erstkunde"]);
    expect(kinds(await chooseOption(ctx, kunde, (await vorschlag(r2.id, 13)).id))).toEqual([]);
    expect(await conditionsOf(r1.id)).toEqual(["erstkunde"]);
    expect(await conditionsOf(r2.id)).toEqual([]);
  });

  it("gleichzeitige Annahmen: der Rabatt gilt genau einmal", async () => {
    const [r1, r2] = [await anfrage(), await anfrage()];
    const [o1, o2] = [await vorschlag(r1.id, 8), await vorschlag(r2.id, 13)];
    await Promise.all([chooseOption(ctx, kunde, o1.id), chooseOption(ctx, kunde, o2.id)]);
    expect([...(await conditionsOf(r1.id)), ...(await conditionsOf(r2.id))]).toEqual(["erstkunde"]);
  });

  it("andere Kunden und stornierte Aufträge nehmen den Rabatt bei der Annahme nicht weg", async () => {
    const [r1, r2, fremd] = [await anfrage(), await anfrage(), await anfrage(andererKunde)];
    await chooseOption(ctx, andererKunde, (await vorschlag(fremd.id, 6)).id);
    await chooseOption(ctx, kunde, (await vorschlag(r1.id, 8)).id);
    await cancelRequest(ctx, kunde, r1.id, now);
    expect(kinds(await chooseOption(ctx, kunde, (await vorschlag(r2.id, 13)).id))).toEqual(["erstkunde"]);
  });
});
