import { expect, test } from "@playwright/test";
import { registerAndLogin } from "./helpers";

const errors: string[] = [];
test.beforeEach(() => void (errors.length = 0));
test.afterEach(() => expect(errors).toEqual([]));

/** Fristablauf selbst prüft der Unit-Test (src/appeal-deadline.test.ts) – hier nur die Anzeige der Frist. */
test("Einspruch → beide Seiten sehen „Einspruch offen – Frist bis …“, Handwerker bekommt die Frist per Mail", async ({ browser }) => {
  const run = `${Date.now()}`;
  const trade = `Fristtest${run}`;
  const text = `Wasserhahn tropft ${run}`;
  const hw = await registerAndLogin(browser, { name: "Frist HW", role: "handwerker", trade }, errors);
  const kunde = await registerAndLogin(browser, { name: "Frist Kundin", role: "kunde" }, errors);
  // Fristende = jetzt + 7 Tage (Berliner Datum, wie in der App angezeigt)
  const until = new Date(Date.now() + 7 * 24 * 3600_000).toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" });

  // Kundin stellt eine normale Anfrage (braucht keine bestätigte Handynummer)
  await kunde.goto(`/?gewerk=${trade}`);
  await kunde.getByLabel(/Frist HW/).check();
  await kunde.fill("textarea", text);
  await kunde.selectOption("[name=urgency]", "normal");
  await kunde.getByRole("button", { name: "Anfrage senden" }).click();
  const k = kunde.locator("article", { hasText: text });
  await expect(k).toContainText("wartet auf Vorschlag");

  // Handwerker schlägt einen Termin im September 2030 vor und bewertet: 👎
  await hw.goto("/");
  const h = hw.locator("article", { hasText: text });
  await h.locator("[name=start]").fill("2030-09-16T09:00");
  await h.locator("[name=end]").fill("2030-09-16T10:00");
  await h.getByRole("button", { name: "Vorschlagen" }).click();
  await expect(h.locator("li")).toHaveCount(1);
  await h.getByRole("button", { name: "👎 übertrieben" }).click();
  await expect(h).toContainText("Einschätzung bewertet: 👎 übertrieben");
  await expect(h).not.toContainText("Frist bis");

  // Kundin legt Einspruch ein → Frist wird angezeigt
  await kunde.goto("/");
  await k.locator("[name=reason]").fill("Es tropft seit Tagen");
  await k.getByRole("button", { name: "Einspruch einlegen" }).click();
  await expect(k).toContainText("Einspruch offen: „Es tropft seit Tagen“");
  await expect(k).toContainText("Einspruch offen – Frist bis");
  await expect(k.locator("small", { hasText: "Frist bis" })).toContainText(until);
  await expect(k).not.toContainText("Einspruchsfrist abgelaufen");

  // Handwerker sieht dieselbe Frist und hat eine Mail mit Frist
  await hw.goto("/");
  await expect(h).toContainText("Einspruch offen – Frist bis");
  await expect(h.locator("small", { hasText: "Frist bis" })).toContainText(until);
  await hw.goto("/postfach");
  const mail = hw.locator("article", { hasText: text }).filter({ hasText: "Einspruch von Frist Kundin gegen deine Bewertung" });
  await expect(mail).toHaveCount(1);
  await expect(mail).toContainText("Bitte entscheide bis");
  await expect(mail).toContainText(until);

  // Nach der Entscheidung verschwindet die Frist
  await hw.goto("/");
  await h.getByRole("button", { name: "Bewertung bestätigen" }).click();
  await expect(h).toContainText("Einspruch abgelehnt – Bewertung bleibt");
  await expect(h).not.toContainText("Frist bis");
  await kunde.goto("/");
  await expect(k).toContainText("Einspruch abgelehnt – Bewertung bleibt");
  await expect(k).not.toContainText("Frist bis");
});
