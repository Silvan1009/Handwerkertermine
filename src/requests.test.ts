import { beforeEach, describe, expect, it } from "vitest";
import type { Ctx } from "./context";
import { users } from "./db/schema";
import { eq } from "drizzle-orm";
import { chooseOption, createRequest, listRequests, loadImage, proposeOption, rateUrgency, rejectOptions, statusOf, type User } from "./requests";
import { testCtx } from "./test-ctx";
import { standingOf } from "./urgency";

const now = new Date(2030, 0, 1);
const opt = (requestId: number, h: number) => ({
  requestId, kind: "termin", start: new Date(2030, 0, 7, h), end: new Date(2030, 0, 7, h + 2),
});

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

const anfrage = (urgency = "normal") =>
  createRequest(ctx, kunde, { craftsmanId: handwerker.id, description: "Wasserhahn tropft", urgency });
const status = async () => statusOf((await listRequests(ctx, kunde))[0]);
const mailTo = () => mails.map((m) => `${m.to}: ${m.subject}`);

it("Ablauf: Anfrage → Vorschläge → Auswahl, jeweils mit Mail an die Gegenseite", async () => {
  const r = await anfrage();
  expect(await status()).toBe("wartet auf Vorschlag");

  const a = await proposeOption(ctx, handwerker, opt(r.id, 8), now);
  await proposeOption(ctx, handwerker, { ...opt(r.id, 13), kind: "zeitfenster" }, now);
  expect(await status()).toBe("Vorschläge offen");

  await chooseOption(ctx, kunde, a.id);
  expect(await status()).toBe("bestätigt");
  expect(mailTo()).toEqual([
    "h1@x.de: Neue Anfrage von K1 – Normal (4–10 Tage)",
    "k1@x.de: Neuer Terminvorschlag von H1",
    "k1@x.de: Neuer Terminvorschlag von H1",
    "h1@x.de: Termin bestätigt von K1",
  ]);
});

it("Ablehnen und Gegenvorschlag: Kunde lehnt ab, schlägt selbst vor, Handwerker nimmt an", async () => {
  const r = await anfrage();
  const a = await proposeOption(ctx, handwerker, opt(r.id, 8), now);
  await rejectOptions(ctx, kunde, r.id);
  expect(await status()).toBe("abgelehnt – neuer Vorschlag nötig");
  await expect(chooseOption(ctx, kunde, a.id)).rejects.toThrow("abgelehnt");

  const gegen = await proposeOption(ctx, kunde, opt(r.id, 15), now);
  await expect(chooseOption(ctx, kunde, gegen.id)).rejects.toThrow("Gegenseite");
  await chooseOption(ctx, handwerker, gegen.id);
  expect(await status()).toBe("bestätigt");
  expect(mailTo()).toContain("h1@x.de: K1 hat die Vorschläge abgelehnt");
  expect(mailTo().at(-1)).toBe("k1@x.de: Termin bestätigt von H1");
});

it("Ablehnen trifft nur Vorschläge der Gegenseite", async () => {
  const r = await anfrage();
  await proposeOption(ctx, kunde, opt(r.id, 8), now);
  await expect(rejectOptions(ctx, kunde, r.id)).rejects.toThrow("Keine offenen");
  expect(await status()).toBe("Vorschläge offen");
});

it("Mailfehler kippt die Aktion nicht", async () => {
  ctx.send = async () => { throw new Error("SMTP down"); };
  await expect(anfrage()).resolves.toBeDefined();
});

describe("Berechtigungen", () => {
  it("nur Kunden fragen an, nur bei Handwerkern", async () => {
    await expect(createRequest(ctx, handwerker, { craftsmanId: handwerker.id, description: "x", urgency: "normal" })).rejects.toThrow("Nicht erlaubt");
    await expect(createRequest(ctx, kunde, { craftsmanId: andererKunde.id, description: "x", urgency: "normal" })).rejects.toThrow("unbekannt");
  });
  it("Unbeteiligte können weder vorschlagen, wählen noch ablehnen", async () => {
    const r = await anfrage();
    const o = await proposeOption(ctx, handwerker, opt(r.id, 8), now);
    await expect(proposeOption(ctx, andererHandwerker, opt(r.id, 8), now)).rejects.toThrow("Nicht erlaubt");
    await expect(chooseOption(ctx, andererKunde, o.id)).rejects.toThrow("Nicht erlaubt");
    await expect(rejectOptions(ctx, andererKunde, r.id)).rejects.toThrow("Nicht erlaubt");
  });
  it("jeder sieht nur seine Anfragen", async () => {
    await anfrage();
    expect(await listRequests(ctx, andererKunde)).toHaveLength(0);
    expect(await listRequests(ctx, andererHandwerker)).toHaveLength(0);
  });
});

describe("Regeln", () => {
  it("Vorschlag muss in der Zukunft liegen und Ende nach Beginn", async () => {
    const r = await anfrage();
    await expect(proposeOption(ctx, handwerker, opt(r.id, 8), new Date(2030, 0, 8))).rejects.toThrow("Vergangenheit");
    await expect(proposeOption(ctx, handwerker, { ...opt(r.id, 8), end: new Date(2030, 0, 7, 7) }, now)).rejects.toThrow("Ende");
  });
  it("nach der Auswahl ist alles fix", async () => {
    const r = await anfrage();
    const a = await proposeOption(ctx, handwerker, opt(r.id, 8), now);
    const b = await proposeOption(ctx, handwerker, opt(r.id, 13), now);
    await chooseOption(ctx, kunde, a.id);
    await expect(chooseOption(ctx, kunde, b.id)).rejects.toThrow("bereits");
    await expect(proposeOption(ctx, handwerker, opt(r.id, 15), now)).rejects.toThrow("bereits bestätigt");
    await expect(rejectOptions(ctx, kunde, r.id)).rejects.toThrow("bereits bestätigt");
  });
});

describe("Dringlichkeit & Bewertung", () => {
  const bestaetigt = async (urgency = "normal") => {
    const r = await anfrage(urgency);
    const o = await proposeOption(ctx, handwerker, opt(r.id, 6 + 2 * r.id), now); // je Anfrage eigene Uhrzeit (keine Überschneidung)
    await chooseOption(ctx, kunde, o.id);
    return r;
  };

  it("Dringlichkeit ist Pflicht", async () => {
    await expect(createRequest(ctx, kunde, { craftsmanId: handwerker.id, description: "x" })).rejects.toThrow("Dringlichkeit");
  });

  it("nur der Handwerker bewertet, jederzeit (auch vor Bestätigung), nur einmal", async () => {
    const offen = await anfrage();
    await rateUrgency(ctx, handwerker, offen.id, "gut");
    const r = await bestaetigt();
    await expect(rateUrgency(ctx, kunde, r.id, "gut")).rejects.toThrow("Nicht erlaubt");
    await expect(rateUrgency(ctx, andererHandwerker, r.id, "gut")).rejects.toThrow("Nicht erlaubt");
    await expect(rateUrgency(ctx, handwerker, r.id, "super")).rejects.toThrow();
    await rateUrgency(ctx, handwerker, r.id, "gut");
    await expect(rateUrgency(ctx, handwerker, r.id, "katastrophe")).rejects.toThrow("Bereits bewertet");
  });

  it("nach einer Katastrophe: Notfall gesperrt, normal erlaubt, zwei 👍 heben die Sperre auf", async () => {
    await rateUrgency(ctx, handwerker, (await bestaetigt("notfall")).id, "katastrophe");
    await expect(anfrage("notfall")).rejects.toThrow("gesperrt");
    await expect(anfrage("kurzfristig")).rejects.toThrow("gesperrt");
    await rateUrgency(ctx, handwerker, (await bestaetigt("normal")).id, "gut");
    await rateUrgency(ctx, handwerker, (await bestaetigt("spaet")).id, "gut");
    await expect(anfrage("notfall")).resolves.toBeDefined();
  });
});

describe("Konditionen der Buchung", () => {
  beforeEach(async () => {
    await ctx.db
      .update(users)
      .set({ pricing: { notfall: { mode: "prozent", value: 50 }, erstkunde: { mode: "absolut", value: -2000 } } })
      .where(eq(users.id, handwerker.id));
  });
  const kinds = (r: { conditions: { kind: string }[] }) => r.conditions.map((c) => c.kind);

  it("Erstkunde bekommt Rabatt, nach dem ersten bestätigten Auftrag nicht mehr", async () => {
    const r1 = await anfrage("notfall");
    expect(kinds(r1)).toEqual(["notfall", "erstkunde"]);
    expect(kinds(await anfrage("normal"))).toEqual(["erstkunde"]); // noch nichts bestätigt
    await chooseOption(ctx, kunde, (await proposeOption(ctx, handwerker, opt(r1.id, 8), now)).id);
    expect(kinds(await anfrage("notfall"))).toEqual(["notfall"]);
  });

  it("Snapshot: spätere Regeländerung ändert bestehende Buchungen nicht", async () => {
    await anfrage("notfall");
    await ctx.db.update(users).set({ pricing: {} }).where(eq(users.id, handwerker.id));
    expect(kinds((await listRequests(ctx, kunde))[0])).toEqual(["notfall", "erstkunde"]);
  });
});

describe("Härtung", () => {
  it("Formularwerte werden als Berliner Ortszeit gelesen", async () => {
    const r = await anfrage();
    const o = await proposeOption(ctx, handwerker, { requestId: r.id, kind: "termin", start: "2030-07-01T08:00", end: "2030-07-01T10:00" }, now);
    expect(o.start.toISOString()).toBe("2030-07-01T06:00:00.000Z");
    await expect(proposeOption(ctx, handwerker, { requestId: r.id, kind: "termin", start: "bald", end: "" }, now)).rejects.toThrow("Ungültiges Datum");
  });

  it("höchstens 10 Anfragen pro Kunde und Tag", async () => {
    for (let i = 0; i < 10; i++) await anfrage();
    await expect(anfrage()).rejects.toThrow("Zu viele Versuche");
  });

  it("Score-Fenster richtet sich nach dem Bewertungszeitpunkt, nicht nach dem Alter der Anfrage", async () => {
    const confirm = async () => {
      const r = await anfrage();
      await chooseOption(ctx, kunde, (await proposeOption(ctx, handwerker, opt(r.id, 6 + 2 * r.id), now)).id); // keine Überschneidung
      return r;
    };
    const alt = await confirm();
    const neu = await confirm();
    await rateUrgency(ctx, handwerker, neu.id, "gut");
    await new Promise((res) => setTimeout(res, 1100)); // Zeitstempel haben Sekundenauflösung
    await rateUrgency(ctx, handwerker, alt.id, "katastrophe");
    expect((await standingOf(ctx, kunde.id)).ratings).toEqual(["katastrophe", "gut"]);
  });
});

describe("Gleichzeitige Aktionen bleiben konsistent", () => {
  it("Annehmen und Ablehnen gleichzeitig: nie ein abgelehnter Vorschlag als bestätigter Termin", async () => {
    const r = await anfrage();
    const o = await proposeOption(ctx, handwerker, opt(r.id, 8), now);
    await Promise.allSettled([chooseOption(ctx, kunde, o.id), rejectOptions(ctx, kunde, r.id)]);
    const [after] = await listRequests(ctx, kunde);
    expect(after.chosenOptionId && after.options.find((x) => x.id === after.chosenOptionId)?.rejected).toBeFalsy();
  });
});

describe("Fotos", () => {
  const png = (bytes = 10, type = "image/png") => new File([new Uint8Array(bytes)], "foto.png", { type });
  const mitFotos = (files: unknown) =>
    createRequest(ctx, kunde, { craftsmanId: handwerker.id, description: "Riss in der Wand", urgency: "normal" }, files);

  it("werden mit der Anfrage gespeichert und nur den Beteiligten ausgeliefert", async () => {
    await mitFotos([png(), png(20)]);
    const [r] = await listRequests(ctx, handwerker);
    expect(r.images).toHaveLength(2);
    const img = await loadImage(ctx, handwerker, r.images[1].id);
    expect(img).toMatchObject({ mime: "image/png" });
    expect(img.data.length).toBe(20);
    await expect(loadImage(ctx, kunde, r.images[0].id)).resolves.toBeDefined();
    await expect(loadImage(ctx, andererKunde, r.images[0].id)).rejects.toThrow("Nicht erlaubt");
    await expect(loadImage(ctx, andererHandwerker, r.images[0].id)).rejects.toThrow("Nicht erlaubt");
    await expect(loadImage(ctx, kunde, 999)).rejects.toThrow("Nicht erlaubt");
  });

  it("Regeln: max. 5, max. 10 MB, nur Bildformate (kein SVG) – sonst entsteht gar keine Anfrage", async () => {
    await expect(mitFotos(Array.from({ length: 6 }, () => png()))).rejects.toThrow("Höchstens 5 Bilder");
    await expect(mitFotos([png(10_000_001)])).rejects.toThrow("max. 10 MB");
    await expect(mitFotos([png(10, "image/svg+xml")])).rejects.toThrow("Nur JPEG");
    await expect(mitFotos([png(10, "text/html")])).rejects.toThrow("Nur JPEG");
    expect(await listRequests(ctx, kunde)).toHaveLength(0);
  });

  it("ohne Fotos geht es weiterhin", async () => {
    expect((await listRequests(ctx, kunde, 1)).length).toBe(0);
    await mitFotos([]);
    expect((await listRequests(ctx, kunde))[0].images).toEqual([]);
  });
});
