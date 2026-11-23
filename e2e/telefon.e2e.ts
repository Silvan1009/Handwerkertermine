import { expect, test, type Page } from "@playwright/test";
import { registerAndLogin } from "./helpers";

// Nur frische Nutzer (registerAndLogin), Termine im Oktober 2030.
const errors: string[] = [];
test.beforeEach(() => void (errors.length = 0));
test.afterEach(() => expect(errors).toEqual([]));

const HINT = "Notfall und kurzfristig nur mit bestätigter Handynummer";

async function notfallAnfrage(kunde: Page, trade: string, text: string) {
  await kunde.goto(`/?gewerk=${trade}`);
  await kunde.getByLabel(/Telefon HW/).check();
  await kunde.fill("textarea", text);
  await kunde.selectOption("[name=urgency]", "notfall");
  await kunde.getByRole("button", { name: "Anfrage senden" }).click();
}

async function requestCode(page: Page, phone: string) {
  await page.goto("/profil");
  await page.getByRole("form", { name: "Handynummer" }).locator("[name=phone]").fill(phone);
  await page.getByRole("button", { name: "Code per SMS senden" }).click();
}

test("ohne Nummer: Notfall abgelehnt mit Hinweis → Nummer über Profil + Postfach bestätigen → Notfall-Anfrage klappt", async ({ browser }) => {
  const run = `${Date.now()}${Math.floor(Math.random() * 1e3)}`;
  const digits = run.slice(-8);
  const trade = `Telefontest${run}`;
  const text = `Heizung ausgefallen ${run}`;
  const hw = await registerAndLogin(browser, { name: "Telefon HW", role: "handwerker", trade }, errors);
  const kunde = await registerAndLogin(browser, { name: "Telefon Kundin", role: "kunde" }, errors);

  // Hinweis am Auswahlfeld, Notfall wird mit Verweis aufs Profil abgelehnt
  await kunde.goto(`/?gewerk=${trade}`);
  await expect(kunde.getByText(HINT)).toBeVisible();
  await notfallAnfrage(kunde, trade, text);
  await expect(kunde.getByText("❌ Notfall- und kurzfristige Anfragen gehen nur mit bestätigter Handynummer")).toBeVisible();
  await expect(kunde.locator("article", { hasText: text })).toHaveCount(0);

  // Profil: Nummer eingeben → SMS im Test-Postfach → falscher Code → richtiger Code
  await requestCode(kunde, `0151 ${digits.slice(0, 4)}-${digits.slice(4)}`);
  await expect(kunde.getByText("✅ Code per SMS gesendet")).toBeVisible();
  await expect(kunde.getByText(`Code aus der SMS an ••${digits.slice(-2)}`)).toBeVisible();
  await kunde.goto("/postfach");
  const sms = kunde.locator("article", { hasText: `+49151${digits}` }).first();
  await expect(sms).toContainText("Bestätigungscode");
  const code = (await sms.locator("p").textContent())!.match(/\d{6}/)![0];

  await kunde.goto("/profil");
  const codeForm = kunde.getByRole("form", { name: "Code bestätigen" });
  await codeForm.locator("[name=code]").fill(code === "000000" ? "111111" : "000000");
  await codeForm.getByRole("button", { name: "Nummer bestätigen" }).click();
  await expect(kunde.getByText("❌ Falscher Code")).toBeVisible();
  await codeForm.locator("[name=code]").fill(code);
  await codeForm.getByRole("button", { name: "Nummer bestätigen" }).click();
  await expect(kunde.getByText("✅ Handynummer bestätigt", { exact: true })).toBeVisible(); // Meldung
  await expect(kunde.getByText(`✅ Handynummer bestätigt (endet auf ••${digits.slice(-2)})`)).toBeVisible();
  await expect(kunde.getByRole("form", { name: "Code bestätigen" })).toHaveCount(0);

  // jetzt geht die Notfall-Anfrage, kein Hinweis mehr
  await notfallAnfrage(kunde, trade, text);
  await expect(kunde.locator("article", { hasText: text })).toContainText("wartet auf Vorschlag");
  await expect(kunde.getByText(HINT)).toHaveCount(0);

  // Handwerker bekommt sie und schlägt einen Termin im Oktober 2030 vor
  await hw.goto("/");
  const h = hw.locator("article", { hasText: text });
  await expect(h).toContainText("Notfall");
  await h.locator("[name=start]").fill("2030-10-14T08:00");
  await h.locator("[name=end]").fill("2030-10-14T09:00");
  await h.getByRole("button", { name: "Vorschlagen" }).click();
  await expect(h.locator("li")).toHaveCount(1);

  // dieselbe Nummer bei einem zweiten aktiven Konto → abgelehnt, keine SMS
  const zweite = await registerAndLogin(browser, { name: "Telefon Zweitkonto", role: "kunde" }, errors);
  await requestCode(zweite, `+49 151 ${digits}`);
  await expect(zweite.getByText("❌ Diese Nummer ist bereits bei einem anderen Konto hinterlegt")).toBeVisible();
  await expect(zweite.getByRole("form", { name: "Code bestätigen" })).toHaveCount(0);
});
