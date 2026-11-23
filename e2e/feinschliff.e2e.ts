import { expect, test, type Page } from "@playwright/test";
import { registerAndLogin } from "./helpers";

// Nur frische Nutzer (registerAndLogin) – Seed-Nutzer bleiben unverändert. Termine im August 2030.
const browserErrors: string[] = [];
test.beforeEach(() => void (browserErrors.length = 0));
test.afterEach(() => expect(browserErrors).toEqual([]));

test("Fußzeile führt zur Datenschutzseite, die Bewertung, Sperre und Einspruch erklärt", async ({ browser }) => {
  const kunde = await registerAndLogin(browser, { name: "Datenschutz Kunde", role: "kunde" }, browserErrors);
  await kunde.locator("footer").getByRole("link", { name: "Datenschutz" }).click();
  await expect(kunde).toHaveURL(/\/datenschutz$/);
  await expect(kunde.getByRole("heading", { name: "🔒 Datenschutz" })).toBeVisible();
  await expect(kunde.getByText("Entwurf:", { exact: true })).toBeVisible();
  for (const h of ["Welche Daten wir speichern", "Wer was sieht", "Bewertung der Dringlichkeit und automatische Sperre", "E-Mails", "Wie lange wir speichern"])
    await expect(kunde.getByRole("heading", { name: h })).toBeVisible();
  await expect(kunde.getByText("❌ stark übertrieben: −5 Punkte")).toBeVisible();
  await expect(kunde.getByText("Einspruch:", { exact: true })).toBeVisible();
  await expect(kunde.getByText(/bis du dein Konto löschst/)).toBeVisible();
  await expect(kunde.getByText("7 Tage", { exact: true })).toBeVisible(); // Einspruchsfrist (fett im Text)
  await expect(kunde.getByText(/Bewertungen hängen an der Handynummer/)).toBeVisible();
  // Fußzeile auch ohne Anmeldung
  const anonym = await (await browser.newContext()).newPage();
  await anonym.goto("/");
  await expect(anonym.locator("footer").getByRole("link", { name: "Datenschutz" })).toHaveAttribute("href", "/datenschutz");
});

test("Doppelbuchung: zwei Kunden, gleicher Zeitraum – nur die erste Annahme gilt", async ({ browser }) => {
  const suffix = `${Date.now()}`;
  const hwName = `Feinschliff Fliesen ${suffix}`;
  const trade = `Fliesen${suffix}`;
  const hw = await registerAndLogin(browser, { name: hwName, role: "handwerker", trade }, browserErrors);
  const kunden = [
    await registerAndLogin(browser, { name: "Feinschliff Kundin A", role: "kunde" }, browserErrors),
    await registerAndLogin(browser, { name: "Feinschliff Kunde B", role: "kunde" }, browserErrors),
  ];
  const beschreibung = (i: number) => `Bad fliesen ${suffix} ${i ? "B" : "A"}`;
  const article = (page: Page, i: number) => page.locator("article", { hasText: beschreibung(i) });

  for (const [i, k] of kunden.entries()) {
    await k.goto(`/?gewerk=${trade}`);
    await k.getByLabel(hwName).check();
    await k.fill("textarea[name=description]", beschreibung(i));
    await k.selectOption("[name=urgency]", "normal");
    await k.getByRole("button", { name: "Anfrage senden" }).click();
    await expect(article(k, i)).toContainText("wartet auf Vorschlag");
  }

  // Beide Vorschläge sind erlaubt, solange noch nichts bestätigt ist
  for (const i of [0, 1]) {
    await hw.goto("/");
    await article(hw, i).locator("[name=start]").fill("2030-08-05T08:00");
    await article(hw, i).locator("[name=end]").fill("2030-08-05T10:00");
    await article(hw, i).getByRole("button", { name: "Vorschlagen" }).click();
    await expect(article(hw, i).locator("li")).toContainText("08:00");
  }

  await kunden[0].goto("/");
  await article(kunden[0], 0).getByRole("button", { name: "Annehmen" }).click();
  await expect(article(kunden[0], 0)).toContainText("· bestätigt ·");

  await kunden[1].goto("/");
  await article(kunden[1], 1).getByRole("button", { name: "Annehmen" }).click();
  await expect(kunden[1].getByText("❌ Der Zeitraum überschneidet sich mit einem anderen Termin")).toBeVisible();
  await expect(article(kunden[1], 1)).toContainText("Vorschläge offen");

  // Im Kalender des Handwerkers steht genau ein App-Termin
  await hw.goto("/kalender?tag=2030-08-05");
  await expect(hw.locator("#eintraege li")).toHaveCount(1);
  await expect(hw.locator("#eintraege li")).toContainText("📱 08:00–10:00 Feinschliff Kundin A");
});
