import { expect, test, type Page } from "@playwright/test";
import { registerAndLogin } from "./helpers";

// Nur frische Nutzer; die Seed-Handwerker werden nur gelesen (Müller 80335 München, Schmidt 85221 Dachau, Weber 10115 Berlin).
const errors: string[] = [];
test.beforeEach(() => void (errors.length = 0));
test.afterEach(() => expect(errors).toEqual([]));

const row = (page: Page, name: string) => page.locator("tbody tr", { hasText: name });

/** Füllt das Suchformular aus und wartet, bis die Ergebnisseite geladen ist. */
async function suchen(page: Page, gewerk: string, ort: string) {
  const form = page.locator("form", { hasText: "Handwerker suchen" });
  await form.getByLabel("Gewerk").fill(gewerk);
  await form.getByLabel("PLZ oder Ort").fill(ort);
  await form.getByRole("button", { name: "Suchen" }).click();
  await page.waitForURL((u) => u.searchParams.get("gewerk") === gewerk && u.searchParams.get("ort") === ort);
}

test("Kunde sucht Handwerker nach Gewerk und PLZ/Ort", async ({ browser }) => {
  const gewerk = `Orgelbau${Date.now() % 1e6}`;
  await registerAndLogin(browser, { name: "Zz Orgelbauer", role: "handwerker", trade: gewerk }, errors);
  const kunde = await registerAndLogin(browser, { name: "Suchende Kundin", role: "kunde" }, errors);
  await expect(kunde.getByRole("columnheader", { name: "PLZ / Ort" })).toBeVisible();

  // Gewerk: Teilstring, ohne Groß/Klein
  await suchen(kunde, gewerk.slice(2).toUpperCase(), "");
  await expect(kunde.locator("tbody tr")).toHaveCount(1);
  await expect(row(kunde, "Zz Orgelbauer")).toContainText(gewerk);

  // Ort enthält Eingabe
  await suchen(kunde, "", "münch");
  await expect(row(kunde, "Müller Sanitär")).toContainText("80335 München");
  await expect(row(kunde, "Schmidt Elektro")).toHaveCount(0);
  await expect(row(kunde, "Weber Malerbetrieb")).toHaveCount(0);

  // PLZ beginnt mit Eingabe
  await suchen(kunde, "", "852");
  await expect(row(kunde, "Schmidt Elektro")).toContainText("85221 Dachau");
  await expect(row(kunde, "Müller Sanitär")).toHaveCount(0);

  // Kombination Gewerk + PLZ; Formular behält die Eingaben
  await suchen(kunde, "elektr", "8");
  await expect(row(kunde, "Schmidt Elektro")).toBeVisible();
  await expect(row(kunde, "Müller Sanitär")).toHaveCount(0);
  await expect(kunde.getByLabel("Gewerk")).toHaveValue("elektr");
  await expect(kunde.getByLabel("PLZ oder Ort")).toHaveValue("8");

  await suchen(kunde, "sanitär", "berlin");
  await expect(kunde.getByText("Kein passender Handwerker gefunden.")).toBeVisible();
});

test("Blättern behält Filter und die Seite der anderen Liste", async ({ browser }) => {
  const kunde = await registerAndLogin(browser, { name: "Blätternde Kundin", role: "kunde" }, errors);
  await kunde.goto("/?gewerk=maler&ort=101&hseite=2&aseite=3");
  await expect(kunde.getByText("Seite 2")).toBeVisible();
  await expect(kunde.getByText("Seite 3")).toBeVisible();
  await expect(kunde.getByRole("link", { name: "Weiter ›" })).toHaveCount(0); // nichts mehr dahinter

  const zurueck = kunde.getByRole("link", { name: "‹ Zurück" });
  await expect(zurueck).toHaveCount(2); // Handwerker, Anfragen
  await expect(zurueck.nth(1)).toHaveAttribute("href", "/?gewerk=maler&ort=101&hseite=2&aseite=2");
  await expect(zurueck.nth(0)).toHaveAttribute("href", "/?gewerk=maler&ort=101&aseite=3");

  await zurueck.nth(0).click();
  await kunde.waitForURL((u) => !u.searchParams.has("hseite"));
  await expect(row(kunde, "Weber Malerbetrieb")).toContainText("10115 Berlin");
  await expect(kunde.locator("tbody tr")).toHaveCount(1);
  await expect(kunde.getByLabel("Gewerk")).toHaveValue("maler");
  await expect(kunde.getByLabel("PLZ oder Ort")).toHaveValue("101");
});
