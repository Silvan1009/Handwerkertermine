import { beforeEach, describe, expect, it } from "vitest";
import { register, sendLoginLink, sign, verify } from "./accounts";
import type { Ctx } from "./context";
import { testCtx } from "./test-ctx";

describe("Tokens", () => {
  const t = sign("login", 42, "geheim", 1000, 0);
  it("gültiges Token liefert User-ID", () => expect(verify(t, "login", "geheim", 999)).toBe(42));
  it("abgelaufen", () => expect(verify(t, "login", "geheim", 1001)).toBeNull());
  it("falsches Secret", () => expect(verify(t, "login", "anders", 0)).toBeNull());
  it("falscher Zweck (Login-Link ≠ Session)", () => expect(verify(t, "session", "geheim", 0)).toBeNull());
  it("manipulierte User-ID", () => expect(verify(t.replace(":42.", ":1."), "login", "geheim", 0)).toBeNull());
  it("Müll", () => expect(verify("", "login", "geheim")).toBeNull());
});

describe("Registrierung & Login-Link", () => {
  let ctx: Ctx, mails: Awaited<ReturnType<typeof testCtx>>["mails"];
  beforeEach(async () => ({ ctx, mails } = await testCtx()));

  const tokenFrom = (text: string) => text.match(/token=(\S+)/)![1];

  it("Registrierung schickt funktionierenden Login-Link", async () => {
    await register(ctx, { name: "Erika", email: " Erika@Example.com ", role: "kunde" });
    expect(mails[0].to).toBe("erika@example.com");
    const id = verify(tokenFrom(mails[0].text), "login", "test");
    expect((await ctx.db.query.users.findFirst())?.id).toBe(id);
  });

  it("Handwerker braucht ein Gewerk", async () => {
    await expect(register(ctx, { name: "H", email: "h@x.de", role: "handwerker" })).rejects.toThrow("Gewerk");
  });

  it("doppelte Registrierung legt keinen zweiten User an, schickt aber Link", async () => {
    await register(ctx, { name: "A", email: "a@x.de", role: "kunde" });
    await register(ctx, { name: "Fremder", email: "a@x.de", role: "handwerker", trade: "Maler" });
    expect(await ctx.db.query.users.findMany()).toMatchObject([{ name: "A", role: "kunde" }]);
    expect(mails).toHaveLength(2);
  });

  it("unbekannte Mail: kein Link, kein Fehler (verrät nichts)", async () => {
    await sendLoginLink(ctx, "niemand@x.de");
    expect(mails).toHaveLength(0);
  });
});
