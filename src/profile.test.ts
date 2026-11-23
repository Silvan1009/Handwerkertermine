import { eq } from "drizzle-orm";
import { beforeEach, expect, it } from "vitest";
import type { Ctx } from "./context";
import { users } from "./db/schema";
import { updateProfile } from "./profile";
import type { User } from "./requests";
import { testCtx } from "./test-ctx";

let ctx: Ctx, kunde: User, handwerker: User;
const load = (u: User) => ctx.db.query.users.findFirst({ where: eq(users.id, u.id) });

beforeEach(async () => {
  ({ ctx } = await testCtx());
  [kunde, handwerker] = await ctx.db
    .insert(users)
    .values([
      { name: "K", email: "k@x.de", role: "kunde", plz: "80331", ort: "München" },
      { name: "H", email: "h@x.de", role: "handwerker", trade: "Maler", plz: "10115", ort: "Berlin" },
    ])
    .returning();
});

it("Handwerker ändert Name, Gewerk, PLZ und Ort (getrimmt)", async () => {
  await updateProfile(ctx, handwerker, { name: " Hans Maler ", trade: " Fliesenleger ", plz: " 85221 ", ort: " Dachau " });
  expect(await load(handwerker)).toMatchObject({ name: "Hans Maler", trade: "Fliesenleger", plz: "85221", ort: "Dachau" });
});

it("Kunde: PLZ und Ort optional, Gewerk wird ignoriert", async () => {
  await updateProfile(ctx, kunde, { name: "Karla", trade: "Maler", plz: "", ort: "" });
  expect(await load(kunde)).toMatchObject({ name: "Karla", trade: null, plz: null, ort: null });
  await updateProfile(ctx, kunde, { name: "Karla" }); // fehlende Felder = keine Angabe
  expect(await load(kunde)).toMatchObject({ name: "Karla", plz: null, ort: null });
});

it("Validierung: Name, Gewerk (Handwerker), PLZ, Ort", async () => {
  const ok = { name: "H", trade: "Maler", plz: "10115", ort: "Berlin" };
  await expect(updateProfile(ctx, handwerker, { ...ok, name: "  " })).rejects.toThrow("Name fehlt");
  await expect(updateProfile(ctx, handwerker, { ...ok, name: "x".repeat(101) })).rejects.toThrow();
  await expect(updateProfile(ctx, handwerker, { ...ok, trade: " " })).rejects.toThrow("Gewerk fehlt");
  await expect(updateProfile(ctx, handwerker, { ...ok, trade: undefined })).rejects.toThrow("Gewerk fehlt");
  for (const plz of ["1234", "123456", "1234a", "12 345"])
    await expect(updateProfile(ctx, handwerker, { ...ok, plz })).rejects.toThrow("PLZ muss aus 5 Ziffern bestehen");
  await expect(updateProfile(ctx, kunde, { name: "K", plz: "abc" })).rejects.toThrow("PLZ muss aus 5 Ziffern bestehen");
  await expect(updateProfile(ctx, handwerker, { ...ok, ort: "x".repeat(101) })).rejects.toThrow();
  expect(await load(handwerker)).toMatchObject({ name: "H", trade: "Maler", plz: "10115", ort: "Berlin" }); // nichts gespeichert
  await updateProfile(ctx, handwerker, { ...ok, plz: "", ort: "" }); // Handwerker: PLZ/Ort dürfen leer sein
  expect(await load(handwerker)).toMatchObject({ plz: null, ort: null });
});

it("E-Mail und Rolle sind nicht änderbar, andere Nutzer bleiben unberührt", async () => {
  await updateProfile(ctx, kunde, { name: "K2", email: "boese@x.de", role: "handwerker", trade: "Maler", sessionVersion: 99 });
  expect(await load(kunde)).toMatchObject({ name: "K2", email: "k@x.de", role: "kunde", trade: null, sessionVersion: 0 });
  expect(await load(handwerker)).toMatchObject({ name: "H", email: "h@x.de", role: "handwerker", trade: "Maler" });
});
