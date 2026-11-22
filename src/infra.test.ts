import { describe, expect, it } from "vitest";
import { z } from "zod";
import { UserError, userMessage } from "./errors";
import { createLimiter } from "./ratelimit";
import { formatLocal, parseLocal } from "./time";

describe("userMessage", () => {
  it("zeigt Fachfehler und Validierungen (deutsch), verschluckt interne Fehler", () => {
    expect(userMessage(new UserError("Nicht erlaubt"))).toBe("Nicht erlaubt");
    expect(userMessage(z.coerce.number().int().safeParse("abc").error)).toMatch(/Zahl/);
    const orig = console.error;
    console.error = () => {};
    expect(userMessage(new Error("Failed query: select … params: opfer@example.com"))).toBe(
      "Unerwarteter Fehler – bitte später erneut versuchen",
    );
    console.error = orig;
  });
});

describe("Zeitzone Europe/Berlin – unabhängig vom Server", () => {
  it("Winter- und Sommerzeit", () => {
    expect(parseLocal("2030-01-07T08:00").toISOString()).toBe("2030-01-07T07:00:00.000Z");
    expect(parseLocal("2030-07-01T08:00").toISOString()).toBe("2030-07-01T06:00:00.000Z");
  });
  it("Umstellungstage", () => {
    expect(parseLocal("2030-03-31T12:00").toISOString()).toBe("2030-03-31T10:00:00.000Z");
    expect(parseLocal("2030-10-27T12:00").toISOString()).toBe("2030-10-27T11:00:00.000Z");
  });
  it("Unsinn → ungültiges Datum; Anzeige in Berliner Zeit", () => {
    expect(Number.isNaN(parseLocal("gestern").getTime())).toBe(true);
    expect(formatLocal(new Date("2030-07-01T06:00:00Z"))).toBe("Mo., 01.07., 08:00");
  });
});

it("Ratelimit: max. n pro Fenster, danach wieder frei", () => {
  let t = 0;
  const limit = createLimiter(() => t);
  limit("k", 2, 1000);
  limit("k", 2, 1000);
  expect(() => limit("k", 2, 1000)).toThrow("Zu viele");
  limit("anderer", 2, 1000);
  t = 1001;
  expect(() => limit("k", 2, 1000)).not.toThrow();
});
