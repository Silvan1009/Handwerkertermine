import { beforeEach, describe, expect, it } from "vitest";
import { endAllSessions, openFlash, redeem, register, sealFlash, sendLoginLink, sessionToken, sessionUser, sign, verify } from "./accounts";
import type { Ctx } from "./context";
import { testCtx } from "./test-ctx";

describe("Tokens", () => {
  const t = sign("login", { uid: 42 }, "geheim", 1000, 0);
  it("gültiges Token liefert Daten", () => expect(verify(t, "login", "geheim", 999)).toMatchObject({ uid: 42 }));
  it("abgelaufen", () => expect(verify(t, "login", "geheim", 1001)).toBeNull());
  it("falsches Secret", () => expect(verify(t, "login", "anders", 0)).toBeNull());
  it("falscher Zweck (Login-Link ≠ Session)", () => expect(verify(t, "session", "geheim", 0)).toBeNull());
  it("manipulierte Daten", () => {
    const [, exp, sig] = t.split(".");
    const evil = Buffer.from(JSON.stringify({ uid: 1, p: "login" })).toString("base64url");
    expect(verify(`${evil}.${exp}.${sig}`, "login", "geheim", 0)).toBeNull();
  });
  it("Müll", () => {
    for (const x of ["", "a.b", "a.b.c.d", "x.1.y"]) expect(verify(x, "login", "geheim")).toBeNull();
  });
});

describe("Registrierung, Login, Sitzung", () => {
  let ctx: Ctx, mails: Awaited<ReturnType<typeof testCtx>>["mails"];
  beforeEach(async () => ({ ctx, mails } = await testCtx()));
  const tokenFrom = (text: string) => text.match(/token=(\S+)/)![1];
  const erika = { name: "Erika", email: " Erika@Example.com ", role: "kunde" };

  it("Account entsteht erst beim Einlösen des Links", async () => {
    await register(ctx, erika);
    expect(await ctx.db.query.users.findMany()).toHaveLength(0);
    expect(mails[0]).toMatchObject({ to: "erika@example.com", subject: "Registrierung bestätigen" });
    const user = await redeem(ctx, tokenFrom(mails[0].text));
    expect(user).toMatchObject({ name: "Erika", email: "erika@example.com", role: "kunde", trade: null });
    expect(await redeem(ctx, tokenFrom(mails[0].text))).toMatchObject({ id: user!.id }); // erneut: kein Duplikat
  });

  it("fremde Registrierung einer bestehenden Adresse ändert nichts und schickt nur einen Login-Link", async () => {
    await redeem(ctx, (await register(ctx, erika), tokenFrom(mails[0].text)));
    await register(ctx, { name: "Fremder", email: "erika@example.com", role: "handwerker", trade: "Maler" });
    expect(mails[1].subject).toBe("Dein Login-Link");
    expect(await redeem(ctx, tokenFrom(mails[1].text))).toMatchObject({ name: "Erika", role: "kunde" });
  });

  it("Handwerker braucht ein Gewerk", async () => {
    await expect(register(ctx, { name: "H", email: "h@x.de", role: "handwerker" })).rejects.toThrow("Gewerk");
  });

  it("unbekannte Mail: kein Link, kein Fehler (verrät nichts)", async () => {
    await sendLoginLink(ctx, "niemand@x.de");
    expect(mails).toHaveLength(0);
  });

  it("höchstens 5 Links pro Adresse und Stunde", async () => {
    for (let i = 0; i < 5; i++) await sendLoginLink(ctx, "a@x.de");
    await expect(sendLoginLink(ctx, "A@x.de")).rejects.toThrow("Zu viele Versuche");
  });

  it("Abmelden macht alle Sitzungen ungültig", async () => {
    await register(ctx, erika);
    const user = (await redeem(ctx, tokenFrom(mails[0].text)))!;
    const token = sessionToken(ctx, user);
    expect(await sessionUser(ctx, token)).toMatchObject({ id: user.id });
    await endAllSessions(ctx, user.id);
    expect(await sessionUser(ctx, token)).toBeUndefined();
    expect(await sessionUser(ctx, "quatsch")).toBeUndefined();
  });

  it("Statusmeldungen: nur signierte werden angezeigt", () => {
    expect(openFlash(ctx, sealFlash(ctx, { kind: "error", text: "x" }))).toMatchObject({ kind: "error", text: "x" });
    expect(openFlash(ctx, "Ihr Konto ist gesperrt, rufen Sie 0900 an")).toBeNull();
  });
});
