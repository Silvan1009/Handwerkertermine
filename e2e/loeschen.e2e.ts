import { expect, test, type Page } from "@playwright/test";
import { registerAndLogin } from "./helpers";

// Nur frische Nutzer (registerAndLogin), Termine im November 2030.
const browserErrors: string[] = [];
test.beforeEach(() => void (browserErrors.length = 0));
test.afterEach(() => expect(browserErrors).toEqual([]));

const unique = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

/** Kunde stellt eine normale Anfrage an den Handwerker mit dem (eindeutigen) Gewerk. */
async function anfrage(kunde: Page, trade: string, text: string) {
  await kunde.goto(`/?gewerk=${trade}`);
  await kunde.getByLabel(/Loesch Maler/).check();
  await kunde.fill("textarea", text);
  await kunde.selectOption("[name=urgency]", "normal");
  await kunde.getByRole("button", { name: "Anfrage senden" }).click();
  await expect(kunde.locator("article", { hasText: text })).toContainText("wartet auf Vorschlag");
}

/** Handwerker schlägt einen Termin vor, Kunde nimmt an → bestätigt. */
async function bestaetigen(hw: Page, kunde: Page, text: string, day: string) {
  await hw.goto("/");
  const a = hw.locator("article", { hasText: text });
  await a.locator("[name=start]").fill(`2030-11-${day}T08:00`);
  await a.locator("[name=end]").fill(`2030-11-${day}T10:00`);
  await a.getByRole("button", { name: "Vorschlagen" }).click();
  await expect(hw.locator("article", { hasText: text })).toContainText("Vorschläge offen");
  await kunde.goto("/");
  await kunde.locator("article", { hasText: text }).getByRole("button", { name: "Annehmen" }).click();
  await expect(kunde.locator("article", { hasText: text })).toContainText("· bestätigt ·");
}

async function loeschen(page: Page, confirm: string) {
  await page.goto("/profil");
  const form = page.getByRole("form", { name: "Konto löschen" });
  await form.locator("[name=confirm]").fill(confirm);
  await form.getByRole("button", { name: "Konto endgültig löschen" }).click();
}

test("Kunde löscht sein Konto: Anfragen storniert, Handwerker sieht „Gelöschtes Konto“ und bekommt Mail", async ({ browser }) => {
  const id = unique(), trade = `Loeschmaler${id}`;
  const hw = await registerAndLogin(browser, { name: `Loesch Maler ${id}`, role: "handwerker", trade }, browserErrors);
  const kunde = await registerAndLogin(browser, { name: `Loesch Kundin ${id}`, role: "kunde" }, browserErrors);
  await anfrage(kunde, trade, "Flur streichen (offen)");
  await anfrage(kunde, trade, "Küche streichen (bestätigt)");
  await bestaetigen(hw, kunde, "Küche streichen (bestätigt)", "04");

  // falsche Bestätigung → Fehler, Konto bleibt
  await loeschen(kunde, "löschen");
  await expect(kunde.getByText("❌ Zur Bestätigung bitte LÖSCHEN eintippen")).toBeVisible();
  await kunde.goto("/");
  await expect(kunde.getByText(`Angemeldet als Loesch Kundin ${id}`)).toBeVisible();

  await loeschen(kunde, "LÖSCHEN");
  await expect(kunde.getByText("Dein Konto wurde gelöscht.")).toBeVisible();
  await expect(kunde.getByRole("heading", { name: "Anmelden" })).toBeVisible();
  await kunde.goto("/profil");
  await expect(kunde.getByRole("heading", { name: "Anmelden" })).toBeVisible();

  await hw.goto("/");
  const articles = hw.locator("article");
  await expect(articles).toHaveCount(2);
  for (const a of await articles.all()) {
    await expect(a).toContainText("Gelöschtes Konto · storniert ·");
    await expect(a).toContainText("(gelöscht)");
  }
  await expect(hw.getByText("Flur streichen")).toHaveCount(0);

  await hw.goto("/postfach");
  const mail = hw.locator("article", { hasText: "Anfrage storniert: Kunde hat sein Konto gelöscht" }).filter({ hasText: `loesch.maler.${id}.` });
  await expect(mail).toHaveCount(2);
  await expect(mail.filter({ hasText: "Flur streichen (offen)" })).toHaveCount(1);
});

test("Handwerker löscht sein Konto: Kunde sieht Storno, Mail, Handwerker nicht mehr in der Suche", async ({ browser }) => {
  const id = unique(), trade = `Loeschmaler${id}`;
  const hw = await registerAndLogin(browser, { name: `Loesch Maler ${id}`, role: "handwerker", trade }, browserErrors);
  const kunde = await registerAndLogin(browser, { name: `Loesch Kunde ${id}`, role: "kunde" }, browserErrors);
  await anfrage(kunde, trade, "Bad fliesen (bestätigt)");
  await bestaetigen(hw, kunde, "Bad fliesen (bestätigt)", "05");

  await loeschen(hw, "LÖSCHEN");
  await expect(hw.getByText("Dein Konto wurde gelöscht.")).toBeVisible();
  await expect(hw.getByRole("heading", { name: "Anmelden" })).toBeVisible();

  await kunde.goto("/");
  const a = kunde.locator("article", { hasText: "Bad fliesen (bestätigt)" });
  await expect(a).toContainText("Gelöschtes Konto · storniert ·");
  await expect(a.getByRole("button", { name: "Stornieren" })).toHaveCount(0);

  await kunde.goto(`/?gewerk=${trade}`);
  await expect(kunde.getByText("Kein passender Handwerker gefunden.")).toBeVisible();

  await kunde.goto("/postfach");
  await expect(
    kunde.locator("article", { hasText: "Anfrage storniert: Handwerker hat sein Konto gelöscht" }).filter({ hasText: `loesch.kunde.${id}.` }),
  ).toContainText("Bad fliesen (bestätigt)");
});
