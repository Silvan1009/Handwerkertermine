import { expect, test, type Page } from "@playwright/test";
import { registerAndLogin } from "./helpers";

// Nur frische Nutzer (registerAndLogin) – Seed-Nutzer bleiben unverändert. Keine Termine nötig.
const browserErrors: string[] = [];
test.beforeEach(() => void (browserErrors.length = 0));
test.afterEach(() => expect(browserErrors).toEqual([]));

const field = (page: Page, name: string) => page.getByRole("form", { name: "Profil" }).locator(`[name=${name}]`);
const save = (page: Page) => page.getByRole("form", { name: "Profil" }).getByRole("button", { name: "Speichern" }).click();

test("Handwerker ändert Name, Gewerk, PLZ und Ort", async ({ browser }) => {
  const hw = await registerAndLogin(browser, { name: "Profil Fliesen", role: "handwerker", trade: "Fliesenleger" }, browserErrors);
  await hw.getByRole("link", { name: "👤 Profil" }).click();
  await expect(hw.getByRole("heading", { name: "👤 Profil" })).toBeVisible();
  await expect(hw.getByText("E-Mail und Rolle können nicht geändert werden.")).toBeVisible();
  await expect(hw.getByText("Rolle: Handwerker")).toBeVisible();
  await expect(field(hw, "email")).toHaveCount(0);
  await expect(field(hw, "role")).toHaveCount(0);
  await expect(field(hw, "name")).toHaveValue("Profil Fliesen");
  await expect(field(hw, "trade")).toHaveValue("Fliesenleger");

  await field(hw, "name").fill("Profil Fliesen & Bad");
  await field(hw, "trade").fill("Fliesen und Bad");
  await field(hw, "plz").fill("85221");
  await field(hw, "ort").fill("Dachau");
  await save(hw);
  await expect(hw.getByText("✅ Profil gespeichert")).toBeVisible();
  await expect(field(hw, "name")).toHaveValue("Profil Fliesen & Bad");
  await expect(field(hw, "trade")).toHaveValue("Fliesen und Bad");
  await expect(field(hw, "plz")).toHaveValue("85221");
  await expect(field(hw, "ort")).toHaveValue("Dachau");

  // ungültige PLZ → Fehlermeldung, gespeicherter Stand bleibt
  await field(hw, "plz").fill("1234");
  await save(hw);
  await expect(hw.getByText("❌ PLZ muss aus 5 Ziffern bestehen")).toBeVisible();
  await expect(field(hw, "plz")).toHaveValue("85221");

  await hw.getByRole("link", { name: "‹ Zur Startseite" }).click();
  await expect(hw.getByText("Angemeldet als Profil Fliesen & Bad")).toBeVisible();
});

test("Kunde: kein Gewerk, PLZ und Ort optional", async ({ browser }) => {
  const kunde = await registerAndLogin(browser, { name: "Profil Kundin", role: "kunde" }, browserErrors);
  await kunde.getByRole("link", { name: "👤 Profil" }).click();
  await expect(kunde.getByText("Rolle: Kunde")).toBeVisible();
  await expect(field(kunde, "trade")).toHaveCount(0);

  await field(kunde, "name").fill("Profil Kundin Neu");
  await field(kunde, "plz").fill("80331");
  await field(kunde, "ort").fill("München");
  await save(kunde);
  await expect(kunde.getByText("✅ Profil gespeichert")).toBeVisible();
  await expect(field(kunde, "plz")).toHaveValue("80331");
  await expect(field(kunde, "ort")).toHaveValue("München");

  // wieder leeren ist erlaubt
  await field(kunde, "plz").fill("");
  await field(kunde, "ort").fill("");
  await save(kunde);
  await expect(kunde.getByText("✅ Profil gespeichert")).toBeVisible();
  await expect(field(kunde, "plz")).toHaveValue("");
  await expect(field(kunde, "ort")).toHaveValue("");

  await kunde.goto("/");
  await expect(kunde.getByText("Angemeldet als Profil Kundin Neu")).toBeVisible();
});

test("Abgemeldete werden vom Profil weggeleitet", async ({ browser }) => {
  const anonym = await (await browser.newContext()).newPage();
  await anonym.goto("/profil");
  await expect(anonym).toHaveURL(/localhost:\d+\/$/);
  await expect(anonym.getByRole("heading", { name: "Anmelden" })).toBeVisible();
});
