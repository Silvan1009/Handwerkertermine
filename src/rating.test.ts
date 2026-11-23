import { beforeEach, describe, expect, it } from "vitest";
import type { Ctx } from "./context";
import { users } from "./db/schema";
import { appealRating, cancelRequest, createRequest, decideAppeal, rateUrgency, type User } from "./requests";
import { testCtx } from "./test-ctx";
import { scoreOf, standingOf } from "./urgency";

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

const anfrage = (urgency = "notfall") => createRequest(ctx, kunde, { craftsmanId: handwerker.id, description: "Rohrbruch", urgency });
/** Anfrage, die der Handwerker sofort (ohne Annahme) bewertet. */
const bewertet = async (rating: string, urgency = "notfall") => {
  const r = await anfrage(urgency);
  await rateUrgency(ctx, handwerker, r.id, rating);
  return r;
};
const score = async () => (await standingOf(ctx, kunde.id)).score;

describe("Bewertung der Dringlichkeit", () => {
  it("jederzeit: auch ohne Annahme und nach Storno – aber nur einmal und nur vom Handwerker der Anfrage", async () => {
    const offen = await anfrage();
    for (const u of [kunde, andererKunde, andererHandwerker])
      await expect(rateUrgency(ctx, u, offen.id, "gut")).rejects.toThrow("Nicht erlaubt");
    await expect(rateUrgency(ctx, handwerker, offen.id, "super")).rejects.toThrow();
    await rateUrgency(ctx, handwerker, offen.id, "gut");
    await expect(rateUrgency(ctx, handwerker, offen.id, "katastrophe")).rejects.toThrow("Bereits bewertet");

    const storniert = await anfrage();
    await cancelRequest(ctx, kunde, storniert.id);
    await rateUrgency(ctx, handwerker, storniert.id, "schlecht");
    expect((await standingOf(ctx, kunde.id)).ratings).toEqual(["schlecht", "gut"]);
  });

  it("Mail an den Kunden mit Label; führt die Bewertung zur Sperre, mit Hinweis, wie man sie zurückbekommt", async () => {
    await bewertet("gut");
    expect(mails.at(-1)).toMatchObject({ to: "k1@x.de", subject: "Deine Dringlichkeitsangabe wurde bewertet: 👍 passend" });
    expect(mails.at(-1)!.text).not.toContain("gesperrt");

    await bewertet("katastrophe");
    expect(mails.at(-1)).toMatchObject({ to: "k1@x.de", subject: "Deine Dringlichkeitsangabe wurde bewertet: ❌ stark übertrieben" });
    expect(mails.at(-1)!.text).toContain("vorübergehend gesperrt");
    expect(mails.at(-1)!.text).toContain("Einspruch");
  });

  it("nur Übertreibung wird bestraft: ⬇️ dringender als angegeben = 0 Punkte", async () => {
    expect(scoreOf(["unterschaetzt", "unterschaetzt"])).toEqual({ score: 3, locked: false });
    await bewertet("unterschaetzt", "normal");
    expect(mails.at(-1)!.subject).toBe("Deine Dringlichkeitsangabe wurde bewertet: ⬇️ dringender als angegeben");
    expect(await score()).toBe(3);
  });
});

describe("Einspruch", () => {
  it("nur der Kunde, nur gegen 👎/❌, nur einmal, Begründung 1–500 Zeichen; Mail an den Handwerker", async () => {
    const gut = await bewertet("gut");
    await expect(appealRating(ctx, kunde, gut.id, "Doch!")).rejects.toThrow("nur gegen eine Bewertung als übertrieben");
    const unbewertet = await anfrage();
    await expect(appealRating(ctx, kunde, unbewertet.id, "Doch!")).rejects.toThrow("nur gegen eine Bewertung als übertrieben");

    const r = await bewertet("schlecht");
    for (const u of [handwerker, andererKunde, andererHandwerker])
      await expect(appealRating(ctx, u, r.id, "Doch!")).rejects.toThrow("Nicht erlaubt");
    await expect(appealRating(ctx, kunde, r.id, "   ")).rejects.toThrow("Begründung fehlt");
    await expect(appealRating(ctx, kunde, r.id, "x".repeat(501))).rejects.toThrow("max. 500");
    await appealRating(ctx, kunde, r.id, "  Wasser stand 10 cm hoch  ");
    expect(mails.at(-1)).toMatchObject({ to: "h1@x.de", subject: "Einspruch von K1 gegen deine Bewertung" });
    expect(mails.at(-1)!.text).toContain("Begründung: Wasser stand 10 cm hoch\n");
    await expect(appealRating(ctx, kunde, r.id, "Nochmal")).rejects.toThrow("bereits eingelegt");
  });

  it("offener Einspruch hebt die Sperre bis zur Entscheidung auf; zurückgenommen zählt nicht, bestätigt zählt wieder", async () => {
    const r = await bewertet("katastrophe");
    expect(await score()).toBe(-2);
    await expect(anfrage("notfall")).rejects.toThrow("gesperrt");

    await appealRating(ctx, kunde, r.id, "Es war wirklich ein Notfall");
    expect(await score()).toBe(3);
    await decideAppeal(ctx, handwerker, r.id, "bestaetigt");
    expect(mails.at(-1)).toMatchObject({ to: "k1@x.de", subject: "Einspruch abgelehnt: H1 hält die Bewertung aufrecht" });
    expect(mails.at(-1)!.text).toContain("vorübergehend gesperrt");
    expect(await score()).toBe(-2);

    const r2 = await bewertet("schlecht", "normal");
    await appealRating(ctx, kunde, r2.id, "Termin war am selben Tag nötig");
    await decideAppeal(ctx, handwerker, r2.id, "zurueckgenommen");
    expect(mails.at(-1)).toMatchObject({ to: "k1@x.de", subject: "Einspruch erfolgreich: H1 hat die Bewertung zurückgenommen" });
    expect((await standingOf(ctx, kunde.id)).ratings).toEqual(["katastrophe"]);
  });

  it("Entscheidung nur durch den Handwerker der Anfrage und nur bei offenem Einspruch", async () => {
    const r = await bewertet("schlecht");
    await expect(decideAppeal(ctx, handwerker, r.id, "zurueckgenommen")).rejects.toThrow("Kein offener Einspruch");
    await appealRating(ctx, kunde, r.id, "Doch dringend");
    for (const u of [kunde, andererKunde, andererHandwerker])
      await expect(decideAppeal(ctx, u, r.id, "zurueckgenommen")).rejects.toThrow("Nicht erlaubt");
    await expect(decideAppeal(ctx, handwerker, r.id, "offen")).rejects.toThrow();
    await decideAppeal(ctx, handwerker, r.id, "zurueckgenommen");
    await expect(decideAppeal(ctx, handwerker, r.id, "bestaetigt")).rejects.toThrow("Kein offener Einspruch");
    await expect(appealRating(ctx, kunde, r.id, "Nochmal")).rejects.toThrow("bereits eingelegt");
  });
});
