import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { sign } from "./accounts";
import type { Ctx } from "./context";
import { users } from "./db/schema";
import { Phone, confirmPhone, pendingPhone, phoneHash, requestPhoneCode } from "./phone";
import { createRequest, rateUrgency, type User } from "./requests";
import { testCtx } from "./test-ctx";
import { standingOf, standingsOf } from "./urgency";

let ctx: Ctx, sms: Awaited<ReturnType<typeof testCtx>>["sms"];
let kunde: User, andererKunde: User, handwerker: User;

beforeEach(async () => {
  ({ ctx, sms } = await testCtx());
  [kunde, andererKunde, handwerker] = await ctx.db
    .insert(users)
    .values([
      { name: "K1", email: "k1@x.de", role: "kunde" },
      { name: "K2", email: "k2@x.de", role: "kunde" },
      { name: "H1", email: "h1@x.de", role: "handwerker" },
    ])
    .returning();
});

const lastCode = () => sms.at(-1)!.text.match(/\d{6}/)![0];
const load = async (u: User) => (await ctx.db.query.users.findFirst({ where: eq(users.id, u.id) }))!;
/** Kompletter Ablauf: Code anfordern, Code aus der SMS eingeben → frischer User aus der DB. */
async function verifyPhone(u: User, phone = "0151 2345678") {
  const token = await requestPhoneCode(ctx, u, phone);
  await confirmPhone(ctx, u, { token, code: lastCode() });
  return load(u);
}
const anfrage = (u: User, urgency: string) => createRequest(ctx, u, { craftsmanId: handwerker.id, description: "Rohrbruch", urgency });

it("Normalisierung: Leerzeichen/Bindestriche/Klammern raus, 0 → +49, 00 → +, nur +<8–15 Ziffern>", () => {
  for (const s of ["0151 2345678", "0151-234 5678", "(0151) 2345678", "0151/2345678", "+49 151 2345678", "0049 151 2345678"])
    expect(Phone.parse(s)).toBe("+491512345678");
  for (const s of ["", "1234", "0151 abc", "+12", "+49 151 234567890123456"]) expect(() => Phone.parse(s)).toThrow("Ungültige Handynummer");
});

describe("Bestätigen per SMS-Code", () => {
  it("Code per SMS → richtiger Code → Hash + letzte 2 Ziffern gespeichert, Klartext nirgends", async () => {
    const token = await requestPhoneCode(ctx, kunde, "0151 23456-78");
    expect(sms).toEqual([{ to: "+491512345678", text: expect.stringMatching(/Bestätigungscode.*\d{6}/) }]);
    expect(pendingPhone(ctx, kunde, token)).toEqual({ hint: "78" });
    expect(pendingPhone(ctx, andererKunde, token)).toBeNull();
    expect(token).not.toContain(lastCode());
    await confirmPhone(ctx, kunde, { token, code: lastCode() });
    const u = await load(kunde);
    expect(u).toMatchObject({ phoneHash: phoneHash(ctx, "+491512345678"), phoneHint: "78" });
    // Klartextnummer weder in der DB noch im Token (Token ist base64-JSON, also lesbar)
    const dump = JSON.stringify(await ctx.db.select().from(users));
    for (const s of ["15123456", "4915123456"]) {
      expect(dump).not.toContain(s);
      expect(Buffer.from(token.split(".")[0], "base64url").toString()).not.toContain(s);
    }
  });

  it("falscher Code, abgelaufenes Token, fremde uid, manipuliertes Token → abgelehnt", async () => {
    const token = await requestPhoneCode(ctx, kunde, "01512345678");
    const code = lastCode();
    await expect(confirmPhone(ctx, kunde, { token, code: code === "000000" ? "111111" : "000000" })).rejects.toThrow("Falscher Code");
    await expect(confirmPhone(ctx, andererKunde, { token, code })).rejects.toThrow("Code abgelaufen");
    await expect(confirmPhone(ctx, kunde, { token: token.slice(0, -2) + "xx", code })).rejects.toThrow("Code abgelaufen");
    const old = sign("phone", { uid: kunde.id, hash: "h", hint: "78", code: "c" }, ctx.secret, 10 * 60_000, Date.now() - 11 * 60_000);
    await expect(confirmPhone(ctx, kunde, { token: old, code })).rejects.toThrow("Code abgelaufen");
    expect((await load(kunde)).phoneHash).toBeNull();
    expect((await load(andererKunde)).phoneHash).toBeNull();
  });

  it("Ratelimits: 3 Codes pro Nutzer/Stunde (und pro Nummer), 5 Prüfversuche pro Nutzer/Stunde", async () => {
    for (let i = 0; i < 3; i++) await requestPhoneCode(ctx, kunde, `0151100000${i}`);
    await expect(requestPhoneCode(ctx, kunde, "01511000009")).rejects.toThrow("Zu viele Versuche");
    expect(sms).toHaveLength(3);
    // dieselbe Nummer über mehrere Konten: höchstens 3 SMS
    for (let i = 0; i < 3; i++) await requestPhoneCode(ctx, i < 2 ? andererKunde : handwerker, "01519999999");
    await expect(requestPhoneCode(ctx, handwerker, "01519999999")).rejects.toThrow("Zu viele Versuche");

    const token = await requestPhoneCode(ctx, andererKunde, "01518888888");
    for (let i = 0; i < 5; i++) await expect(confirmPhone(ctx, andererKunde, { token, code: "x" })).rejects.toThrow("Falscher Code");
    await expect(confirmPhone(ctx, andererKunde, { token, code: lastCode() })).rejects.toThrow("Zu viele Versuche");
  });

  it("andere Nummer bestätigen ersetzt die alte", async () => {
    await verifyPhone(kunde, "01511111111");
    expect(await verifyPhone(kunde, "01512222222")).toMatchObject({ phoneHash: phoneHash(ctx, "+491512222222"), phoneHint: "22" });
  });
});

describe("Eine Nummer – ein aktives Konto", () => {
  it("Nummer eines anderen aktiven Kontos → abgelehnt (bei der Anfrage und bei der Bestätigung)", async () => {
    await verifyPhone(kunde);
    await expect(requestPhoneCode(ctx, andererKunde, "+49 151 2345678")).rejects.toThrow("bereits bei einem anderen Konto");
    expect(sms).toHaveLength(1); // keine SMS

    // Wettlauf: beide fordern einen Code an, bevor einer bestätigt
    const t1 = await requestPhoneCode(ctx, andererKunde, "01513333333");
    const c1 = lastCode();
    await verifyPhone(kunde, "01513333333");
    await expect(confirmPhone(ctx, andererKunde, { token: t1, code: c1 })).rejects.toThrow("bereits bei einem anderen Konto");
    expect((await load(andererKunde)).phoneHash).toBeNull();
  });

  it("Sperre lässt sich nicht per Neu-Konto umgehen: gelöschtes Konto gibt die Nummer frei, die Bewertungen gehen mit", async () => {
    // Kunde 1 bestätigt seine Nummer, übertreibt einen Notfall → gesperrt
    await verifyPhone(kunde);
    kunde = await load(kunde);
    await rateUrgency(ctx, handwerker, (await anfrage(kunde, "notfall")).id, "katastrophe");
    expect((await standingOf(ctx, kunde.id)).locked).toBe(true);
    await expect(anfrage(kunde, "notfall")).rejects.toThrow("gesperrt");

    // … löscht sein Konto (anonymisiert wie in src/deletion.ts; phoneHash bleibt) und registriert sich neu
    await ctx.db.update(users).set({ name: "Gelöschtes Konto", email: `geloescht-${kunde.id}@invalid`, deletedAt: new Date() }).where(eq(users.id, kunde.id));
    const [neu] = await ctx.db.insert(users).values({ name: "Neu", email: "k1@x.de", role: "kunde" }).returning();
    // ohne Nummer: kein Notfall; normale Anfrage geht
    await expect(anfrage(neu, "notfall")).rejects.toThrow("bestätigter Handynummer");
    await expect(anfrage(neu, "normal")).resolves.toBeDefined();
    expect((await standingOf(ctx, neu.id)).locked).toBe(false);

    // dieselbe Nummer ist erlaubt (gehört nur einem gelöschten Konto) – aber die Sperre kommt mit
    const verified = await verifyPhone(neu);
    expect(verified.phoneHash).toBe(kunde.phoneHash);
    expect(await standingOf(ctx, neu.id)).toMatchObject({ ratings: ["katastrophe"], locked: true });
    await expect(anfrage(verified, "notfall")).rejects.toThrow("gesperrt");
    await expect(anfrage(verified, "kurzfristig")).rejects.toThrow("gesperrt");

    // zusammengezählt in beide Richtungen, auch in der Mehrfachabfrage (Handwerkeransicht); andere Kunden unberührt
    for (let i = 0; i < 2; i++) await rateUrgency(ctx, handwerker, (await anfrage(verified, "normal")).id, "gut");
    const s = await standingsOf(ctx, [neu.id, andererKunde.id]);
    expect(s.get(neu.id)).toMatchObject({ ratings: ["gut", "gut", "katastrophe"], score: 0, locked: false });
    expect(s.get(andererKunde.id)).toMatchObject({ ratings: [], score: 3 });
    await expect(anfrage(verified, "notfall")).resolves.toBeDefined(); // Sperre regulär aufgehoben
  });
});

describe("Pflicht für Notfall und kurzfristig", () => {
  it("ohne bestätigte Nummer nur normal/spät – mit Hinweis aufs Profil", async () => {
    for (const u of ["notfall", "kurzfristig"]) await expect(anfrage(kunde, u)).rejects.toThrow(/bestätigter Handynummer.*\/profil/);
    for (const u of ["normal", "spaet"]) await expect(anfrage(kunde, u)).resolves.toBeDefined();
    const verified = await verifyPhone(kunde);
    for (const u of ["notfall", "kurzfristig"]) await expect(anfrage(verified, u)).resolves.toBeDefined();
  });

  it("Anfrage an ein gelöschtes Handwerkerkonto → „Handwerker unbekannt“", async () => {
    await ctx.db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, handwerker.id));
    await expect(anfrage(kunde, "normal")).rejects.toThrow("Handwerker unbekannt");
  });
});
