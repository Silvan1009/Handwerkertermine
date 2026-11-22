import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { chooseOption, createRequest, listRequests, proposeOption, statusOf, type User } from "./requests";
import { createDb, type Db } from "./db";
import { users } from "./db/schema";

const now = new Date(2030, 0, 1);
const opt = (requestId: number, h: number) => ({
  requestId, kind: "termin", start: new Date(2030, 0, 7, h), end: new Date(2030, 0, 7, h + 2),
});

let db: Db, kunde: User, andererKunde: User, handwerker: User, andererHandwerker: User;

beforeEach(async () => {
  db = createDb(":memory:");
  await migrate(db, { migrationsFolder: "drizzle" });
  [kunde, andererKunde, handwerker, andererHandwerker] = await db
    .insert(users)
    .values([
      { name: "K1", role: "kunde" },
      { name: "K2", role: "kunde" },
      { name: "H1", role: "handwerker" },
      { name: "H2", role: "handwerker" },
    ])
    .returning();
});

const anfrage = () => createRequest(db, kunde, { craftsmanId: handwerker.id, description: "Wasserhahn tropft" });

it("kompletter Ablauf: Anfrage → Vorschläge → Auswahl", async () => {
  const r = await anfrage();
  expect(statusOf((await listRequests(db, handwerker))[0])).toBe("wartet auf Handwerker");

  const a = await proposeOption(db, handwerker, opt(r.id, 8), now);
  await proposeOption(db, handwerker, { ...opt(r.id, 13), kind: "zeitfenster" }, now);
  const [sicht] = await listRequests(db, kunde);
  expect(statusOf(sicht)).toBe("Vorschläge liegen vor");
  expect(sicht.options.map((o) => o.kind)).toEqual(["termin", "zeitfenster"]);

  await chooseOption(db, kunde, a.id);
  const [fertig] = await listRequests(db, kunde);
  expect(statusOf(fertig)).toBe("bestätigt");
  expect(fertig.chosenOptionId).toBe(a.id);
});

describe("Berechtigungen", () => {
  it("nur Kunden fragen an, nur bei Handwerkern", async () => {
    await expect(createRequest(db, handwerker, { craftsmanId: handwerker.id, description: "x" })).rejects.toThrow("Nicht erlaubt");
    await expect(createRequest(db, kunde, { craftsmanId: andererKunde.id, description: "x" })).rejects.toThrow("unbekannt");
  });
  it("nur der angefragte Handwerker schlägt vor", async () => {
    const r = await anfrage();
    await expect(proposeOption(db, andererHandwerker, opt(r.id, 8), now)).rejects.toThrow("Nicht erlaubt");
  });
  it("nur der eigene Kunde wählt", async () => {
    const r = await anfrage();
    const o = await proposeOption(db, handwerker, opt(r.id, 8), now);
    await expect(chooseOption(db, andererKunde, o.id)).rejects.toThrow("Nicht erlaubt");
  });
  it("jeder sieht nur seine Anfragen", async () => {
    await anfrage();
    expect(await listRequests(db, andererKunde)).toHaveLength(0);
    expect(await listRequests(db, andererHandwerker)).toHaveLength(0);
  });
});

describe("Regeln", () => {
  it("Vorschlag muss in der Zukunft liegen und Ende nach Beginn", async () => {
    const r = await anfrage();
    await expect(proposeOption(db, handwerker, opt(r.id, 8), new Date(2030, 0, 8))).rejects.toThrow("Vergangenheit");
    await expect(proposeOption(db, handwerker, { ...opt(r.id, 8), end: new Date(2030, 0, 7, 7) }, now)).rejects.toThrow("Ende");
  });
  it("nach der Auswahl: keine zweite Wahl, keine neuen Vorschläge", async () => {
    const r = await anfrage();
    const a = await proposeOption(db, handwerker, opt(r.id, 8), now);
    const b = await proposeOption(db, handwerker, opt(r.id, 13), now);
    await chooseOption(db, kunde, a.id);
    await expect(chooseOption(db, kunde, b.id)).rejects.toThrow("bereits");
    await expect(proposeOption(db, handwerker, opt(r.id, 15), now)).rejects.toThrow("bereits bestätigt");
  });
});
