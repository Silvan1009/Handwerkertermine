import { describe, expect, it } from "vitest";
import { calcQuote, parsePricing, type Pricing } from "./pricing";

const rules: Pricing = {
  notfall: { mode: "prozent", value: 50 },
  spaet: { mode: "prozent", value: -5 },
  app: { mode: "prozent", value: -10 },
  erstkunde: { mode: "absolut", value: -2000 },
};

describe("calcQuote", () => {
  it("Notfall-Aufschlag + App-Rabatt + Erstkunde, alles bezogen auf den Grundpreis", () => {
    expect(calcQuote(20000, rules, { urgency: "notfall", firstCustomer: true })).toEqual({
      base: 20000,
      lines: [
        { label: "Notfall +50 %", amount: 10000 },
        { label: "Buchung über die App -10 %", amount: -2000 },
        { label: "Erstkunde -20,00 €", amount: -2000 },
      ],
      total: 26000,
    });
  });
  it("Bestandskunde, später Termin: nur Rabatte", () => {
    expect(calcQuote(20000, rules, { urgency: "spaet", firstCustomer: false }).total).toBe(17000);
  });
  it("Kategorie ohne Regel / keine Regeln = Grundpreis", () => {
    expect(calcQuote(20000, {}, { urgency: "normal", firstCustomer: true })).toEqual({ base: 20000, lines: [], total: 20000 });
  });
  it("nie unter 0 €", () => {
    expect(calcQuote(1000, rules, { urgency: "normal", firstCustomer: true }).total).toBe(0);
  });
});

describe("parsePricing", () => {
  it("liest Formularwerte, Komma als Dezimaltrenner, € in Cent, leer = keine Regel", () => {
    expect(
      parsePricing({ notfall_value: "50", notfall_mode: "prozent", erstkunde_value: "-12,50", erstkunde_mode: "absolut", app_value: " " }),
    ).toEqual({ notfall: { mode: "prozent", value: 50 }, erstkunde: { mode: "absolut", value: -1250 } });
  });
  it("App- und Erstkundenrabatt dürfen keine Aufschläge sein", () => {
    expect(() => parsePricing({ app_value: "5" })).toThrow("nur Rabatte");
  });
  it("Unsinn wird abgelehnt", () => {
    expect(() => parsePricing({ normal_value: "abc" })).toThrow("keine gültige Zahl");
    expect(() => parsePricing({ normal_value: "-150", normal_mode: "prozent" })).toThrow("100 %");
  });
});
