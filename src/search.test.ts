import { beforeEach, describe, expect, it } from "vitest";
import { PAGE_SIZE, findCraftsmen, type Search } from "./availability";
import type { Ctx } from "./context";
import { requests, users } from "./db/schema";
import { listRequests } from "./requests";
import { testCtx } from "./test-ctx";

let ctx: Ctx;
beforeEach(async () => void ({ ctx } = await testCtx()));

describe("Handwerker suchen nach Gewerk und PLZ/Ort", () => {
  beforeEach(async () => {
    await ctx.db.insert(users).values([
      { name: "Kundin", email: "k@x.de", role: "kunde", plz: "80331", ort: "München" },
      { name: "Müller", email: "m@x.de", role: "handwerker", trade: "Sanitär & Heizung", plz: "80335", ort: "München", notfall: "eingeschraenkt" },
      { name: "Schmidt", email: "s@x.de", role: "handwerker", trade: "Elektro", plz: "85221", ort: "Dachau", notfall: "frei" },
      { name: "Weber", email: "w@x.de", role: "handwerker", trade: "Maler", plz: "10115", ort: "Berlin", notfall: "frei" },
      { name: "Özdemir", email: "o@x.de", role: "handwerker", trade: "Öl_Heizung", plz: "86150", ort: "Überlingen", notfall: "ausgebucht" },
      { name: "Ohne", email: "x@x.de", role: "handwerker", trade: "Elektro" }, // ohne PLZ/Ort
    ]);
  });
  const names = async (s: Search) => (await findCraftsmen(ctx, s)).map((c) => c.name);

  it("Gewerk: enthält, ohne Groß/Klein (auch Umlaute), % und _ gelten wörtlich", async () => {
    expect(await names({ trade: "elek" })).toEqual(["Ohne", "Schmidt"]);
    expect(await names({ trade: " HEIZUNG " })).toEqual(["Müller", "Özdemir"]);
    expect(await names({ trade: "öl_" })).toEqual(["Özdemir"]);
    expect(await names({ trade: "%" })).toEqual([]);
    expect(await names({ trade: "r_&" })).toEqual([]); // _ ist kein Platzhalter (sonst „Sanitär & …“)
  });

  it("PLZ beginnt mit Eingabe oder Ort enthält Eingabe; Kunden werden nie gefunden", async () => {
    expect(await names({ place: "8" })).toEqual(["Müller", "Schmidt", "Özdemir"]);
    expect(await names({ place: "852" })).toEqual(["Schmidt"]);
    expect(await names({ place: "0335" })).toEqual([]); // nur Präfix, nicht mittendrin
    expect(await names({ place: "münch" })).toEqual(["Müller"]);
    expect(await names({ place: "ÜBERLING" })).toEqual(["Özdemir"]);
    expect(await names({ place: "achau" })).toEqual(["Schmidt"]);
  });

  it("leere Felder = kein Filter, Kombination mit Dringlichkeit (frei zuerst)", async () => {
    expect(await names({ trade: "  ", place: "" })).toEqual(["Müller", "Ohne", "Schmidt", "Weber", "Özdemir"]);
    expect(await names({ urgency: "notfall" })).toEqual(["Schmidt", "Weber", "Müller"]);
    expect(await names({ urgency: "notfall", place: "8" })).toEqual(["Schmidt", "Müller"]);
    expect(await names({ urgency: "notfall", trade: "heiz" })).toEqual(["Müller"]); // Özdemir ist ausgebucht
    expect(await names({ urgency: "notfall", trade: "elektro", place: "berlin" })).toEqual([]);
  });
});

describe("Blättern", () => {
  it("Handwerker: je PAGE_SIZE, „more“ nur wenn es weitergeht, Filter wirkt auf alle Seiten", async () => {
    const n = 2 * PAGE_SIZE + 1;
    await ctx.db.insert(users).values(
      Array.from({ length: n }, (_, i) => ({
        name: `H${String(i).padStart(2, "0")}`, email: `h${i}@x.de`, role: "handwerker" as const, trade: i % 2 ? "Maler" : "Fliesen",
      })),
    );
    const p1 = await findCraftsmen(ctx, {}, 1), p3 = await findCraftsmen(ctx, {}, 3);
    expect([p1.length, p1.more, p3.length, p3.more]).toEqual([PAGE_SIZE, true, 1, false]);
    expect(p1[0].name).toBe("H00");
    expect(p3[0].name).toBe(`H${n - 1}`);
    expect(await findCraftsmen(ctx, {}, 4)).toHaveLength(0);
    expect((await findCraftsmen(ctx, {}, 0))[0].name).toBe("H00"); // ungültige Seite = 1

    // genau PAGE_SIZE Treffer: eine Seite, kein „Weiter“
    const maler = await findCraftsmen(ctx, { trade: "maler" }, 1);
    expect([maler.length, maler.more]).toEqual([PAGE_SIZE, false]);
    const fliesen = await findCraftsmen(ctx, { trade: "fliesen" }, 2);
    expect([fliesen.length, fliesen.more, fliesen[0].name]).toEqual([1, false, `H${n - 1}`]);
  });

  it("Anfragen: neueste zuerst, je PAGE_SIZE, nur eigene", async () => {
    const [k, h, andere] = await ctx.db
      .insert(users)
      .values([
        { name: "K", email: "k@x.de", role: "kunde" },
        { name: "H", email: "h@x.de", role: "handwerker", trade: "Maler" },
        { name: "A", email: "a@x.de", role: "kunde" },
      ])
      .returning();
    const req = (customerId: number, i: number) =>
      ({ customerId, craftsmanId: h.id, description: `Nr. ${i}`, urgency: "normal" as const, conditions: [] });
    await ctx.db.insert(requests).values(Array.from({ length: PAGE_SIZE + 1 }, (_, i) => req(k.id, i)));
    await ctx.db.insert(requests).values(req(andere.id, 99));

    const p1 = await listRequests(ctx, k, 1), p2 = await listRequests(ctx, k, 2);
    expect([p1.length, p1.more, p1[0].description]).toEqual([PAGE_SIZE, true, `Nr. ${PAGE_SIZE}`]);
    expect([p2.length, p2.more, p2[0].description]).toEqual([1, false, "Nr. 0"]);
    expect((await listRequests(ctx, h, 2)).map((r) => r.description)).toEqual(["Nr. 1", "Nr. 0"]); // Handwerker: 22 Anfragen
    const a = await listRequests(ctx, andere);
    expect([a.length, a.more]).toEqual([1, false]);
  });
});
