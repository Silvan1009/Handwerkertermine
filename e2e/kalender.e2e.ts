import { expect, test, type Browser, type Page } from "@playwright/test";
import { sign } from "../src/accounts";

// Kalender von Weber Malerbetrieb (4) im März 2030 – kollidiert nicht mit flow.e2e.ts (nutzt 1 und 2).
const browserErrors: string[] = [];
test.beforeEach(() => void (browserErrors.length = 0));
test.afterEach(() => expect(browserErrors).toEqual([]));

async function loginAs(browser: Browser, uid: number) {
  const page = await (await browser.newContext()).newPage();
  page.on("pageerror", (e) => browserErrors.push(e.message));
  page.on("console", (m) => m.type() === "error" && browserErrors.push(m.text()));
  await page.goto(`/login?token=${sign("login", { uid }, "e2e-secret", 60_000)}`);
  await expect(page.getByText("Angemeldet als")).toBeVisible();
  return page;
}

const WEBER = 4;
const form = (page: Page, name: string) => page.getByRole("form", { name });
const entries = (page: Page) => page.locator("#eintraege li");
const day = (page: Page, tag: string) => page.locator(`[data-tag="${tag}"]`);
const count = (page: Page, tag: string) => day(page, tag).locator("small"); // „n“ bzw. „n/max“ in der Zelle

async function blocker(page: Page, tag: string, art: string, von = "", bis = "", grund = "") {
  await page.goto(`/kalender?tag=${tag}`);
  const f = form(page, "Blocker");
  await f.locator("[name=art]").selectOption(art);
  if (von) await f.locator("[name=von]").fill(von);
  if (bis) await f.locator("[name=bis]").fill(bis);
  if (grund) await f.locator("[name=title]").fill(grund);
  await f.getByRole("button", { name: "Blocker eintragen" }).click();
  await expect(page.getByText("✅ Blocker eingetragen")).toBeVisible();
}

async function extern(page: Page, tag: string, von: string, bis: string, titel: string) {
  await page.goto(`/kalender?tag=${tag}`);
  const f = form(page, "Externer Termin");
  await f.locator("[name=von]").fill(von);
  await f.locator("[name=bis]").fill(bis);
  await f.locator("[name=title]").fill(titel);
  await f.getByRole("button", { name: "Termin eintragen" }).click();
}

test("Kalender öffnen über die Startseite", async ({ browser }) => {
  const hw = await loginAs(browser, WEBER);
  await hw.getByRole("link", { name: "📅 Kalender" }).click();
  await expect(hw.getByRole("heading", { name: "📅 Kalender" })).toBeVisible();
  await expect(hw.locator("[data-tag]").first()).toBeVisible(); // Monatsraster
  // Monat blättern behält den gewählten Tag
  await hw.goto("/kalender?tag=2030-03-11");
  await expect(hw.getByText("März 2030")).toBeVisible();
  await hw.getByRole("link", { name: "Nächster Monat" }).click();
  await expect(hw.getByText("April 2030")).toBeVisible();
  await expect(hw.getByRole("heading", { name: "Montag, 11.03.2030" })).toBeVisible();
});

test("Blocker: ganzer Tag, Vormittag, eigene Stunden", async ({ browser }) => {
  const hw = await loginAs(browser, WEBER);

  await blocker(hw, "2030-03-11", "ganz");
  await expect(entries(hw)).toHaveCount(1);
  await expect(entries(hw).first()).toContainText("🚫 ganzer Tag");
  await expect(day(hw, "2030-03-11")).toContainText("🚫");
  await expect(day(hw, "2030-03-10")).not.toContainText("🚫"); // endet um Mitternacht, nicht am Vortag

  await blocker(hw, "2030-03-12", "vormittag");
  await expect(entries(hw).first()).toContainText("🚫 08:00–12:00");
  await expect(day(hw, "2030-03-12")).toContainText("🚫");

  await blocker(hw, "2030-03-13", "eigene", "14:00", "15:30", "Arzt");
  await expect(entries(hw).first()).toContainText("🚫 14:00–15:30 Arzt");

  // Ansicht bleibt nach dem Neuladen erhalten
  await hw.goto("/kalender?tag=2030-03-11");
  await expect(entries(hw).first()).toContainText("ganzer Tag");
});

test("Externer Termin anlegen und Termine pro Tag setzen", async ({ browser }) => {
  const hw = await loginAs(browser, WEBER);

  await extern(hw, "2030-03-14", "09:00", "11:00", "Frau Meier (telefonisch)");
  await expect(hw.getByText("✅ Externer Termin eingetragen")).toBeVisible();
  await expect(entries(hw).first()).toContainText("📒 09:00–11:00 Frau Meier (telefonisch)");
  await expect(count(hw, "2030-03-14")).toHaveText("1");

  const max = form(hw, "Termine pro Tag");
  await max.locator("[name=maxPerDay]").fill("2");
  await max.getByRole("button", { name: "Speichern" }).click();
  await expect(hw.getByText("✅ Termine pro Tag gespeichert")).toBeVisible();
  await expect(form(hw, "Termine pro Tag").locator("[name=maxPerDay]")).toHaveValue("2");
  await expect(count(hw, "2030-03-14")).toHaveText("1/2");
  await expect(count(hw, "2030-03-15")).toHaveText("0/2");

  // leer = unbegrenzt
  await form(hw, "Termine pro Tag").locator("[name=maxPerDay]").fill("");
  await form(hw, "Termine pro Tag").getByRole("button", { name: "Speichern" }).click();
  await expect(hw.getByText("✅ Termine pro Tag gespeichert")).toBeVisible();
  await expect(form(hw, "Termine pro Tag").locator("[name=maxPerDay]")).toHaveValue("");
  await expect(count(hw, "2030-03-14")).toHaveText("1");

  // Ende vor Beginn → Fehlermeldung, nichts gespeichert
  await extern(hw, "2030-03-14", "12:00", "11:00", "verkehrt");
  await expect(hw.getByText("❌ Ende muss nach Beginn liegen")).toBeVisible();
  await expect(entries(hw)).toHaveCount(1);
});

test("Eintrag löschen", async ({ browser }) => {
  const hw = await loginAs(browser, WEBER);
  await extern(hw, "2030-03-20", "10:00", "11:00", "Wegwerftermin");
  await expect(entries(hw)).toHaveCount(1);
  await entries(hw).first().getByRole("button", { name: "Löschen" }).click();
  await expect(hw.getByText("✅ Eintrag gelöscht")).toBeVisible();
  await expect(entries(hw)).toHaveCount(0);
  await expect(hw.getByText("Keine Einträge.")).toBeVisible();
  await expect(hw.getByRole("heading", { name: "Mittwoch, 20.03.2030" })).toBeVisible(); // bleibt auf dem Tag
});

test("Kunden und Abgemeldete werden vom Kalender weggeleitet", async ({ browser }) => {
  const kunde = await loginAs(browser, 1);
  await expect(kunde.getByRole("link", { name: "📅 Kalender" })).toHaveCount(0);
  await kunde.goto("/kalender");
  await expect(kunde).toHaveURL(/localhost:3200\/$/);
  await expect(kunde.getByText("Angemeldet als")).toBeVisible();

  const anonym = await (await browser.newContext()).newPage();
  await anonym.goto("/kalender");
  await expect(anonym.getByRole("heading", { name: "Anmelden" })).toBeVisible();
});
