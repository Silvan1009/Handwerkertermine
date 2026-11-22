import { describe, expect, it } from "vitest";
import { conditionsFor, formatConditions, parsePricing, type Pricing } from "./pricing";

const rules: Pricing = {
  notfall: { mode: "prozent", value: 50 },
  spaet: { mode: "prozent", value: -5 },
  app: { mode: "prozent", value: -10 },
  erstkunde: { mode: "absolut", value: -2000 },
};

describe("conditionsFor", () => {
  it("Notfall-Aufschlag + App-Rabatt + Erstkunde", () => {
    expect(conditionsFor(rules, { urgency: "notfall", firstCustomer: true }).map((c) => c.kind)).toEqual(["notfall", "app", "erstkunde"]);
  });
  it("Bestandskunde bekommt keinen Erstkundenrabatt", () => {
    expect(conditionsFor(rules, { urgency: "spaet", firstCustomer: false }).map((c) => c.kind)).toEqual(["spaet", "app"]);
  });
  it("Kategorie ohne Regel / keine Regeln = nichts", () => {
    expect(conditionsFor({}, { urgency: "normal", firstCustomer: true })).toEqual([]);
  });
  it("lesbare Darstellung", () => {
    expect(formatConditions(conditionsFor(rules, { urgency: "notfall", firstCustomer: true }))).toBe(
      "Notfall +50 % · Buchung über die App -10 % · Erstkunde -20,00 €",
    );
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
    expect(() => parsePricing({ normal_value: "-150", normal_mode: "prozent" })).toThrow("-100 bis +300 %");
    expect(() => parsePricing({ notfall_value: "10000" })).toThrow("-100 bis +300 %");
    expect(() => parsePricing({ notfall_value: "6000", notfall_mode: "absolut" })).toThrow("-5000 bis +5000 €");
  });
  it("0 = keine Regel", () => {
    expect(parsePricing({ notfall_value: "0" })).toEqual({});
  });
});
