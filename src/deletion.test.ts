import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";
import { redeem, register, sessionToken, sessionUser, sign } from "./accounts";
import { findCraftsmen } from "./availability";
import { addEntry } from "./calendar";
import type { Ctx } from "./context";
import { calendarEntries, images, options, requests, users } from "./db/schema";
import { deleteAccount } from "./deletion";
import type { User } from "./requests";
import { testCtx } from "./test-ctx";

let ctx: Ctx, mails: { to: string; subject: string; text: string }[], kunde: User, hw: User, hw2: User;
const NOW = new Date("2030-11-10T10:00:00Z");
const DAY = 24 * 3600_000;
const load = (u: User) => ctx.db.query.users.findFirst({ where: eq(users.id, u.id) });
const req = (id: number) => ctx.db.query.requests.findFirst({ where: eq(requests.id, id) });

/** Anfrage; `at` = bestätigter Termin (Start), sonst unbestätigt. */
async function anfrage(craftsman: User, description: string, at?: Date) {
  const [r] = await ctx.db
    .insert(requests)
    .values({ customerId: kunde.id, craftsmanId: craftsman.id, description, urgency: "normal", conditions: [] })
    .returning();
  await ctx.db.insert(images).values({ requestId: r.id, mime: "image/png", data: Buffer.from("x") });
  if (at) {
    const [o] = await ctx.db
      .insert(options)
      .values({ requestId: r.id, proposedById: craftsman.id, kind: "termin", start: at, end: new Date(at.getTime() + 3600_000) })
      .returning();
    await ctx.db.update(requests).set({ chosenOptionId: o.id }).where(eq(requests.id, r.id));
  }
  return r.id;
}

beforeEach(async () => {
  ({ ctx, mails } = await testCtx());
  [kunde, hw, hw2] = await ctx.db
    .insert(users)
    .values([
      { name: "Karla", email: "k@x.de", role: "kunde", plz: "80331", ort: "München", phoneHash: "hash-k", phoneHint: "12" },
      {
        name: "Hans", email: "h@x.de", role: "handwerker", trade: "Maler", plz: "10115", ort: "Berlin", normal: "frei",
        maxPerDay: 3, pricing: { app: { mode: "prozent", value: -5 } }, phoneHash: "hash-h", phoneHint: "34",
      },
      { name: "Zweiter", email: "z@x.de", role: "handwerker", trade: "Maler" },
    ])
    .returning();
});

it("anonymisiert das Konto, behält phoneHash/phoneHint, beendet alle Sitzungen", async () => {
  const token = sessionToken(ctx, hw);
  expect(await sessionUser(ctx, token)).toBeTruthy();
  await deleteAccount(ctx, hw, { confirm: "LÖSCHEN" }, NOW);
  expect(await load(hw)).toMatchObject({
    name: "Gelöschtes Konto", email: `geloescht-${hw.id}@invalid`, role: "handwerker", trade: null, plz: null, ort: null,
    pricing: null, maxPerDay: null, notfall: null, kurzfristig: null, normal: null, spaet: null, deletedAt: NOW,
    phoneHash: "hash-h", phoneHint: "34", sessionVersion: 1,
  });
  expect(await sessionUser(ctx, token)).toBeUndefined();
  // ein vor der Löschung verschickter Login-Link funktioniert nicht mehr
  expect(await redeem(ctx, sign("login", { uid: hw.id }, ctx.secret, 60_000))).toBeUndefined();
});

it("Kunde löscht: offene und künftige Anfragen storniert + Mail, vergangene bleiben; Fotos und Texte weg", async () => {
  const offen = await anfrage(hw, "Wand streichen");
  const kuenftig = await anfrage(hw2, "Decke streichen", new Date(NOW.getTime() + 2 * DAY));
  const vergangen = await anfrage(hw, "Tür lackieren", new Date(NOW.getTime() - 2 * DAY));
  const [storniert] = await ctx.db
    .insert(requests)
    .values({ customerId: kunde.id, craftsmanId: hw.id, description: "Alt", urgency: "normal", conditions: [], cancelledAt: new Date(0), appealReason: "privat" })
    .returning();
  // fremde Anfrage bleibt unberührt
  const [fremd] = await ctx.db.insert(users).values({ name: "F", email: "f@x.de", role: "kunde" }).returning();
  const [andere] = await ctx.db
    .insert(requests)
    .values({ customerId: fremd.id, craftsmanId: hw.id, description: "Fremd", urgency: "normal", conditions: [] })
    .returning();
  await ctx.db.insert(images).values({ requestId: andere.id, mime: "image/png", data: Buffer.from("y") });
  mails.length = 0;

  await deleteAccount(ctx, kunde, { confirm: "LÖSCHEN" }, NOW);

  expect(await req(offen)).toMatchObject({ cancelledAt: NOW, description: "(gelöscht)" });
  expect(await req(kuenftig)).toMatchObject({ cancelledAt: NOW, description: "(gelöscht)" });
  expect(await req(vergangen)).toMatchObject({ cancelledAt: null, description: "(gelöscht)" });
  expect(await req(storniert.id)).toMatchObject({ cancelledAt: new Date(0), description: "(gelöscht)", appealReason: "(gelöscht)" });
  expect(await req(andere.id)).toMatchObject({ cancelledAt: null, description: "Fremd" });
  expect((await ctx.db.select().from(images)).map((i) => i.requestId)).toEqual([andere.id]);
  expect(mails.map((m) => m.to).sort()).toEqual(["h@x.de", "z@x.de"]);
  expect(mails[0].subject).toBe("Anfrage storniert: Kunde hat sein Konto gelöscht");
  expect(mails.map((m) => m.text).join()).toContain("Wand streichen"); // Handwerker erkennt, welche Anfrage
  expect(await load(kunde)).toMatchObject({ name: "Gelöschtes Konto", plz: null, ort: null, phoneHash: "hash-k" });
});

it("Handwerker löscht: Anfragen an ihn storniert + Mail an Kunden, Kalender weg, nicht mehr in der Suche", async () => {
  const offen = await anfrage(hw, "Wand streichen");
  const kuenftig = await anfrage(hw, "Decke streichen", new Date(NOW.getTime() + 2 * DAY));
  const vergangen = await anfrage(hw, "Tür lackieren", new Date(NOW.getTime() - 2 * DAY));
  const beiAnderem = await anfrage(hw2, "Fenster", new Date(NOW.getTime() + 2 * DAY));
  await addEntry(ctx, hw, { kind: "blocker", start: new Date(NOW.getTime() + DAY), end: new Date(NOW.getTime() + DAY + 3600_000) });
  await addEntry(ctx, hw2, { kind: "extern", start: new Date(NOW.getTime() + DAY), end: new Date(NOW.getTime() + DAY + 3600_000) });
  expect((await findCraftsmen(ctx, { trade: "Maler" })).map((c) => c.id)).toEqual([hw.id, hw2.id]);
  mails.length = 0;

  await deleteAccount(ctx, hw, { confirm: "LÖSCHEN" }, NOW);

  expect(await req(offen)).toMatchObject({ cancelledAt: NOW, description: "Wand streichen" });
  expect(await req(kuenftig)).toMatchObject({ cancelledAt: NOW });
  expect(await req(vergangen)).toMatchObject({ cancelledAt: null }); // bleibt beim Kunden als „Gelöschtes Konto“
  expect(await req(beiAnderem)).toMatchObject({ cancelledAt: null });
  expect(mails).toHaveLength(2);
  expect(mails.every((m) => m.to === "k@x.de" && m.subject === "Anfrage storniert: Handwerker hat sein Konto gelöscht")).toBe(true);
  expect((await ctx.db.select().from(calendarEntries)).map((e) => e.craftsmanId)).toEqual([hw2.id]);
  expect(await ctx.db.select().from(images)).toHaveLength(4); // Fotos gehören den Kunden
  expect((await findCraftsmen(ctx)).map((c) => c.id)).toEqual([hw2.id]);
});

it("falsche Bestätigung → Fehler, nichts geändert", async () => {
  const offen = await anfrage(hw, "Wand streichen");
  for (const confirm of [undefined, "", "löschen", "JA", "LÖSCHEN!"])
    await expect(deleteAccount(ctx, kunde, { confirm }, NOW)).rejects.toThrow("Zur Bestätigung bitte LÖSCHEN eintippen");
  expect(await load(kunde)).toEqual(kunde);
  expect(await req(offen)).toMatchObject({ cancelledAt: null, description: "Wand streichen" });
  expect(await ctx.db.select().from(images)).toHaveLength(1);
});

it("bereits gelöschtes Konto kann nicht erneut gelöscht werden", async () => {
  await deleteAccount(ctx, kunde, { confirm: "LÖSCHEN" }, NOW);
  await expect(deleteAccount(ctx, (await load(kunde))!, { confirm: "LÖSCHEN" }, NOW)).rejects.toThrow("bereits gelöscht");
});

it("E-Mail-Adresse ist danach frei für eine Neuregistrierung", async () => {
  await deleteAccount(ctx, kunde, { confirm: "LÖSCHEN" }, NOW);
  mails.length = 0;
  await register(ctx, { name: "Karla Neu", email: "k@x.de", role: "kunde" });
  expect(mails[0].subject).toBe("Registrierung bestätigen");
  const token = mails[0].text.match(/token=(\S+)/)![1];
  const neu = await redeem(ctx, token);
  expect(neu).toMatchObject({ name: "Karla Neu", email: "k@x.de", deletedAt: null, phoneHash: null });
  expect(neu!.id).not.toBe(kunde.id);
});
