import { beforeEach, expect, it } from "vitest";
import { findCraftsmen, setAvailability } from "./availability";
import type { Ctx } from "./context";
import { users } from "./db/schema";
import type { User } from "./requests";
import { testCtx } from "./test-ctx";

let ctx: Ctx, kunde: User, handwerker: User;
const input = { notfall: "ausgebucht", kurzfristig: "eingeschraenkt", normal: "frei", spaet: "" };

beforeEach(async () => {
  ({ ctx } = await testCtx());
  [kunde, handwerker] = await ctx.db
    .insert(users)
    .values([
      { name: "K", email: "k@x.de", role: "kunde" },
      { name: "H", email: "h@x.de", role: "handwerker", trade: "Maler" },
    ])
    .returning();
});

it("Handwerker setzt Verfügbarkeit, leer = keine Angabe", async () => {
  await setAvailability(ctx, handwerker, input);
  expect(await ctx.db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, handwerker.id) })).toMatchObject({
    notfall: "ausgebucht", kurzfristig: "eingeschraenkt", normal: "frei", spaet: null,
  });
});

it("nur Handwerker, nur gültige Stufen", async () => {
  await expect(setAvailability(ctx, kunde, input)).rejects.toThrow("Nicht erlaubt");
  await expect(setAvailability(ctx, handwerker, { ...input, notfall: "vielleicht" })).rejects.toThrow();
});

it("Suche nach Dringlichkeit: nur frei/eingeschränkt, frei zuerst", async () => {
  const [a, b] = await ctx.db
    .insert(users)
    .values([
      { name: "A", email: "a@x.de", role: "handwerker", notfall: "eingeschraenkt" },
      { name: "B", email: "b@x.de", role: "handwerker", notfall: "frei" },
      { name: "C", email: "c@x.de", role: "handwerker", notfall: "ausgebucht" },
    ])
    .returning();
  expect((await findCraftsmen(ctx, { urgency: "notfall" })).map((c) => c.id)).toEqual([b.id, a.id]);
  expect(await findCraftsmen(ctx)).toHaveLength(4); // ohne Filter alle (inkl. H ohne Angabe)
});
