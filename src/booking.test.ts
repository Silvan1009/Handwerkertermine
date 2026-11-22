import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { book, freeSlots, isValidSlot, slotsFor } from "./booking";
import { createDb, type Db } from "./db";
import { craftsmen } from "./db/schema";

const monday = new Date(2030, 0, 7);
const at = (h: number) => new Date(2030, 0, 7, h);
const before = new Date(2030, 0, 1);
const input = { craftsmanId: 1, start: at(9), customerName: "Erika", customerEmail: "erika@example.com" };

describe("slotsFor / isValidSlot", () => {
  it("liefert Werktags-Slots ohne Mittagspause", () => {
    expect(slotsFor(monday).map((d) => d.getHours())).toEqual([8, 9, 10, 11, 13, 14, 15, 16]);
  });
  it("liefert am Wochenende nichts", () => {
    expect(slotsFor(new Date(2030, 0, 5))).toEqual([]);
  });
  it("lehnt vergangene und krumme Zeiten ab", () => {
    expect(isValidSlot(at(9), before)).toBe(true);
    expect(isValidSlot(at(9), new Date(2030, 0, 8))).toBe(false);
    expect(isValidSlot(at(12), before)).toBe(false);
    expect(isValidSlot(new Date(2030, 0, 7, 9, 30), before)).toBe(false);
  });
});

describe("book / freeSlots (echte In-Memory-DB, keine Mocks)", () => {
  let db: Db;
  beforeEach(async () => {
    db = createDb(":memory:");
    await migrate(db, { migrationsFolder: "drizzle" });
    await db.insert(craftsmen).values({ id: 1, name: "Test", trade: "Maler" });
  });

  it("bucht einen Slot und entfernt ihn aus den freien Slots", async () => {
    await book(db, input, before);
    const free = await freeSlots(db, 1, monday, before);
    expect(free.map((d) => d.getHours())).not.toContain(9);
    expect(free).toHaveLength(7);
  });

  it("verhindert Doppelbuchung", async () => {
    await book(db, input, before);
    await expect(book(db, input, before)).rejects.toThrow("bereits vergeben");
  });

  it("validiert Eingaben", async () => {
    await expect(book(db, { ...input, customerEmail: "x" }, before)).rejects.toThrow();
    await expect(book(db, { ...input, start: at(12) }, before)).rejects.toThrow("Ungültiger Termin");
  });
});
