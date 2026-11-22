import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { addEntry, assertBookable, calendarItems, deleteEntry, setMaxPerDay } from "./calendar";
import type { Ctx } from "./context";
import { calendarEntries, requests, users } from "./db/schema";
import { chooseOption, createRequest, listRequests, proposeOption, type User } from "./requests";
import { testCtx } from "./test-ctx";
import { dayRange, parseLocal as t } from "./time";

const now = new Date(2030, 0, 1);
let ctx: Ctx;
let kunde: User, andererKunde: User, handwerker: User, andererHandwerker: User;

beforeEach(async () => {
  ({ ctx } = await testCtx());
  [kunde, andererKunde, handwerker, andererHandwerker] = await ctx.db
    .insert(users)
    .values([
      { name: "Erika", email: "k1@x.de", role: "kunde" },
      { name: "Otto", email: "k2@x.de", role: "kunde" },
      { name: "H1", email: "h1@x.de", role: "handwerker" },
      { name: "H2", email: "h2@x.de", role: "handwerker" },
    ])
    .returning();
});

// Zeiten als Berliner Ortszeit am 7.1.2030 (bzw. vollständiger datetime-local-String)
const at = (s: string) => (s.includes("T") ? s : `2030-01-07T${s}`);
const anfrage = (description = "Wasserhahn tropft", k = kunde) =>
  createRequest(ctx, k, { craftsmanId: handwerker.id, description, urgency: "normal" });
const vorschlag = (by: User, requestId: number, von: string, bis: string) =>
  proposeOption(ctx, by, { requestId, kind: "termin", start: at(von), end: at(bis) }, now);
/** Bestätigter App-Termin beim Handwerker. */
const termin = async (von: string, bis: string, description?: string) => {
  const r = await anfrage(description);
  await chooseOption(ctx, kunde, (await vorschlag(handwerker, r.id, von, bis)).id);
  return r;
};
const eintrag = (kind: "extern" | "blocker", von: string, bis: string, title?: string) =>
  addEntry(ctx, handwerker, { kind, start: at(von), end: at(bis), title });
const bookable = (von: string, bis: string) => assertBookable(ctx, handwerker.id, t(at(von)), t(at(bis)));
const BLOCKIERT = "Der Handwerker hat diesen Zeitraum blockiert";
const BELEGT = "Der Zeitraum überschneidet sich mit einem anderen Termin";
const VOLL = "An diesem Tag sind keine Termine mehr frei";

describe("Berechtigungen", () => {
  it("nur Handwerker legen Einträge an und setzen die Tageskapazität – immer für sich selbst", async () => {
    await expect(addEntry(ctx, kunde, { kind: "blocker", start: at("08:00"), end: at("09:00") })).rejects.toThrow("Nicht erlaubt");
    await expect(setMaxPerDay(ctx, kunde, { maxPerDay: 3 })).rejects.toThrow("Nicht erlaubt");
    const e = await addEntry(ctx, handwerker, { kind: "extern", start: at("08:00"), end: at("09:00"), craftsmanId: andererHandwerker.id });
    expect(e.craftsmanId).toBe(handwerker.id);
  });

  it("nur eigene Einträge löschen", async () => {
    const e = await eintrag("blocker", "08:00", "09:00");
    await expect(deleteEntry(ctx, andererHandwerker, e.id)).rejects.toThrow("Nicht erlaubt");
    await expect(deleteEntry(ctx, kunde, e.id)).rejects.toThrow("Nicht erlaubt");
    await expect(deleteEntry(ctx, handwerker, 999)).rejects.toThrow("Nicht erlaubt");
    expect(await ctx.db.select().from(calendarEntries)).toHaveLength(1);
    await deleteEntry(ctx, handwerker, e.id);
    expect(await ctx.db.select().from(calendarEntries)).toHaveLength(0);
  });
});

describe("Validierung", () => {
  it("Einträge: Berliner Ortszeit, Ende nach Beginn, Titel optional (max. 200)", async () => {
    const e = await addEntry(ctx, handwerker, { kind: "extern", start: "2030-07-01T08:00", end: "2030-07-01T09:00", title: "  " });
    expect(e.start.toISOString()).toBe("2030-07-01T06:00:00.000Z");
    expect(e.title).toBeNull();
    await expect(eintrag("extern", "09:00", "09:00")).rejects.toThrow("Ende");
    await expect(addEntry(ctx, handwerker, { kind: "extern", start: "bald", end: at("09:00") })).rejects.toThrow("Ungültiges Datum");
    await expect(addEntry(ctx, handwerker, { kind: "urlaub", start: at("08:00"), end: at("09:00") })).rejects.toThrow();
    await expect(eintrag("blocker", "08:00", "09:00", "x".repeat(201))).rejects.toThrow("max. 200");
  });

  it("Termine pro Tag: leer = unbegrenzt, sonst ganze Zahl 1–50", async () => {
    const max = async () => (await ctx.db.query.users.findFirst({ where: eq(users.id, handwerker.id) }))?.maxPerDay;
    await setMaxPerDay(ctx, handwerker, { maxPerDay: "3" });
    expect(await max()).toBe(3);
    await setMaxPerDay(ctx, handwerker, { maxPerDay: "" });
    expect(await max()).toBeNull();
    for (const v of ["0", "51", "2.5", "abc", -1]) await expect(setMaxPerDay(ctx, handwerker, { maxPerDay: v })).rejects.toThrow("1 bis 50");
    expect(await max()).toBeNull();
  });
});

describe("Blocker", () => {
  it("ganzer Tag blockiert Vorschlag des Handwerkers und Gegenvorschlag des Kunden", async () => {
    const [start, end] = dayRange("2030-01-07");
    await addEntry(ctx, handwerker, { kind: "blocker", start, end });
    const r = await anfrage();
    await expect(vorschlag(handwerker, r.id, "08:00", "10:00")).rejects.toThrow(BLOCKIERT);
    await expect(vorschlag(kunde, r.id, "23:00", "2030-01-08T01:00")).rejects.toThrow(BLOCKIERT);
    await expect(vorschlag(kunde, r.id, "2030-01-08T00:00", "2030-01-08T02:00")).resolves.toBeDefined(); // Folgetag frei
    expect((await listRequests(ctx, kunde))[0].options).toHaveLength(1);
  });

  it("Tagesabschnitt (08–12) – angrenzende Zeiträume bleiben frei", async () => {
    await eintrag("blocker", "08:00", "12:00");
    await expect(bookable("11:00", "13:00")).rejects.toThrow(BLOCKIERT);
    await expect(bookable("07:00", "08:00")).resolves.toBeUndefined();
    await expect(bookable("12:00", "14:00")).resolves.toBeUndefined();
  });

  it("einzelne Stunde", async () => {
    await eintrag("blocker", "10:00", "11:00");
    await expect(bookable("10:30", "10:45")).rejects.toThrow(BLOCKIERT);
    await expect(bookable("09:00", "10:00")).resolves.toBeUndefined();
  });

  it("später eingetragener Blocker verhindert die Annahme – auch eines Gegenvorschlags", async () => {
    const r = await anfrage();
    const a = await vorschlag(handwerker, r.id, "08:00", "10:00");
    const gegen = await vorschlag(kunde, r.id, "14:00", "16:00");
    await eintrag("blocker", "09:00", "15:00");
    await expect(chooseOption(ctx, kunde, a.id)).rejects.toThrow(BLOCKIERT);
    await expect(chooseOption(ctx, handwerker, gegen.id)).rejects.toThrow(BLOCKIERT);
    expect((await listRequests(ctx, kunde))[0].chosenOptionId).toBeNull();
  });
});

describe("Überschneidungen", () => {
  it("mit bestätigtem App-Termin", async () => {
    await termin("08:00", "10:00");
    const r = await anfrage("Heizung");
    await expect(vorschlag(handwerker, r.id, "09:00", "11:00")).rejects.toThrow(BELEGT);
    await expect(vorschlag(kunde, r.id, "07:00", "08:30")).rejects.toThrow(BELEGT);
    await expect(vorschlag(handwerker, r.id, "10:00", "12:00")).resolves.toBeDefined();
  });

  it("offene (unbestätigte) Vorschläge blockieren nichts – die zweite Annahme scheitert", async () => {
    const r1 = await anfrage();
    const r2 = await anfrage("Heizung");
    const a = await vorschlag(handwerker, r1.id, "08:00", "10:00");
    const b = await vorschlag(handwerker, r2.id, "09:00", "11:00");
    await chooseOption(ctx, kunde, a.id);
    await expect(chooseOption(ctx, kunde, b.id)).rejects.toThrow(BELEGT);
  });

  it("mit externem Termin – Blocker hat Vorrang in der Meldung", async () => {
    await eintrag("extern", "14:00", "15:00");
    await expect(bookable("14:30", "16:00")).rejects.toThrow(BELEGT);
    await eintrag("blocker", "15:30", "16:30");
    await expect(bookable("14:30", "16:00")).rejects.toThrow(BLOCKIERT);
  });

  it("Einträge anderer Handwerker zählen nicht", async () => {
    await addEntry(ctx, andererHandwerker, { kind: "blocker", start: at("08:00"), end: at("18:00") });
    await expect(bookable("09:00", "10:00")).resolves.toBeUndefined();
  });
});

describe("Tageskapazität", () => {
  it("zählt App- und externe Termine, Blocker nicht; Folgetag frei", async () => {
    await setMaxPerDay(ctx, handwerker, { maxPerDay: 2 });
    await eintrag("blocker", "12:00", "13:00");
    await eintrag("extern", "08:00", "09:00");
    await expect(bookable("14:00", "15:00")).resolves.toBeUndefined();
    await termin("10:00", "11:00");
    const r = await anfrage("Heizung");
    await expect(vorschlag(handwerker, r.id, "14:00", "15:00")).rejects.toThrow(VOLL);
    await expect(vorschlag(kunde, r.id, "2030-01-08T14:00", "2030-01-08T15:00")).resolves.toBeDefined();
  });

  it("gilt auch bei der Annahme", async () => {
    await setMaxPerDay(ctx, handwerker, { maxPerDay: 1 });
    const r1 = await anfrage();
    const r2 = await anfrage("Heizung");
    const a = await vorschlag(handwerker, r1.id, "08:00", "09:00");
    const b = await vorschlag(handwerker, r2.id, "14:00", "15:00");
    await chooseOption(ctx, kunde, a.id);
    await expect(chooseOption(ctx, kunde, b.id)).rejects.toThrow(VOLL);
  });

  it("richtet sich nach dem Berliner Kalendertag, nicht nach UTC", async () => {
    await setMaxPerDay(ctx, handwerker, { maxPerDay: 1 });
    await eintrag("extern", "23:00", "23:30"); // 22:00 UTC am 7.
    await expect(bookable("2030-01-08T00:30", "2030-01-08T01:00")).resolves.toBeUndefined(); // 23:30 UTC am 7., Berlin am 8.
    await expect(bookable("06:00", "07:00")).rejects.toThrow(VOLL);
    // Sommerzeit: 1.7. 00:30 Berlin = 30.6. 22:30 UTC
    await eintrag("extern", "2030-06-30T23:00", "2030-06-30T23:30");
    await expect(bookable("2030-07-01T00:30", "2030-07-01T01:00")).resolves.toBeUndefined();
  });
});

describe("stornierte Termine zählen nicht", () => {
  it("weder im Kalender noch bei Überschneidung oder Kapazität", async () => {
    await setMaxPerDay(ctx, handwerker, { maxPerDay: 1 });
    const r = await termin("08:00", "10:00");
    await expect(bookable("09:00", "11:00")).rejects.toThrow(BELEGT);
    await ctx.db.update(requests).set({ cancelledAt: new Date() }).where(eq(requests.id, r.id));
    expect(await calendarItems(ctx, handwerker.id, ...dayRange("2030-01-07"))).toEqual([]);
    await expect(bookable("09:00", "11:00")).resolves.toBeUndefined();
  });
});

describe("calendarItems", () => {
  it("App-Termine, externe Termine und Blocker im Bereich [from, to), nach Start sortiert", async () => {
    await eintrag("blocker", "12:00", "13:00", "Mittag");
    const r = await termin("10:00", "11:00");
    await eintrag("extern", "08:00", "09:00");
    await eintrag("blocker", "2030-01-06T20:00", "2030-01-07T00:00"); // endet genau bei from → nicht dabei
    await eintrag("extern", "2030-01-08T00:00", "2030-01-08T01:00"); // beginnt genau bei to → nicht dabei
    await eintrag("blocker", "2030-01-06T22:00", "2030-01-07T07:00", "Nacht"); // ragt hinein → dabei
    await addEntry(ctx, andererHandwerker, { kind: "extern", start: at("09:00"), end: at("10:00") });
    const offen = await anfrage("nur vorgeschlagen");
    await vorschlag(handwerker, offen.id, "15:00", "16:00");

    const items = await calendarItems(ctx, handwerker.id, ...dayRange("2030-01-07"));
    expect(items.map(({ kind, title }) => `${kind} ${title}`)).toEqual([
      "blocker Nacht",
      "extern Externer Termin",
      "app Erika: Wasserhahn tropft",
      "blocker Mittag",
    ]);
    expect(items[2]).toMatchObject({ requestId: r.id, start: t(at("10:00")), end: t(at("11:00")) });
    expect(items[1]).toHaveProperty("entryId");
  });

  it("lange Beschreibungen werden gekürzt", async () => {
    await termin("10:00", "11:00", "x".repeat(500));
    const [item] = await calendarItems(ctx, handwerker.id, ...dayRange("2030-01-07"));
    expect(item.title.length).toBeLessThanOrEqual(80);
    expect(item.title).toMatch(/^Erika: x+…$/);
  });
});

describe("Meldungen ohne private Details", () => {
  it("Titel von Blockern und externen Terminen erscheinen nicht in Fehlermeldungen", async () => {
    await eintrag("blocker", "08:00", "09:00", "Urlaub Mallorca");
    await eintrag("extern", "10:00", "11:00", "Arzttermin Dr. Geheim");
    const r = await anfrage();
    const fehler = async (von: string, bis: string) => (await vorschlag(kunde, r.id, von, bis).catch((e: Error) => e)) as Error;
    expect((await fehler("08:30", "09:30")).message).toBe(BLOCKIERT);
    expect((await fehler("10:30", "11:30")).message).toBe(BELEGT);
  });
});

// andererKunde: App-Termin eines anderen Kunden zählt genauso
it("Termine verschiedener Kunden beim selben Handwerker überschneiden sich nicht", async () => {
  await termin("08:00", "10:00");
  const r = await anfrage("Heizung", andererKunde);
  await expect(vorschlag(andererKunde, r.id, "09:00", "10:00")).rejects.toThrow(BELEGT);
});
