import { expect, type Browser, type Page } from "@playwright/test";

/** Sammelt Browser-Fehler einer Seite (Hydration, Konsole) – im Test am Ende `expect(errors).toEqual([])`. */
export function trackErrors(page: Page, errors: string[]) {
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
}

/** Bestätigt eine zufällige Handynummer über /profil und den SMS-Code aus dem Test-Postfach. */
export async function verifyPhone(page: Page) {
  const digits = String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
  await page.goto("/profil");
  await page.getByRole("form", { name: "Handynummer" }).locator("[name=phone]").fill(`0151 ${digits}`);
  await page.getByRole("button", { name: "Code per SMS senden" }).click();
  await expect(page.getByText("Code per SMS gesendet")).toBeVisible();
  await page.goto("/postfach");
  const sms = await page.locator("article", { hasText: `+49151${digits}` }).first().locator("p").textContent();
  await page.goto("/profil");
  await page.getByRole("form", { name: "Code bestätigen" }).locator("[name=code]").fill(sms!.match(/\d{6}/)![0]);
  await page.getByRole("button", { name: "Nummer bestätigen" }).click();
  await expect(page.getByText(`Handynummer bestätigt (endet auf ••${digits.slice(-2)})`)).toBeVisible();
}

/**
 * Registriert einen FRISCHEN Nutzer über das echte Formular und meldet ihn über das Test-Postfach an.
 * So kommen sich parallel laufende E2E-Dateien nicht in die Quere (eigene Nutzer statt Seed-Nutzer).
 * `phone: true` bestätigt zusätzlich eine Handynummer (nötig für Notfall-/kurzfristige Anfragen); danach steht die Seite auf /profil.
 */
export async function registerAndLogin(
  browser: Browser,
  opts: { name: string; role: "kunde" | "handwerker"; trade?: string; phone?: boolean },
  errors?: string[],
): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  if (errors) trackErrors(page, errors);
  const email = `${opts.name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}.${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/");
  const form = page.locator("form", { hasText: "Registrieren" });
  await form.locator("[name=name]").fill(opts.name);
  await form.locator("[name=email]").fill(email);
  await form.locator("[name=role]").selectOption(opts.role);
  if (opts.trade) await form.locator("[name=trade]").fill(opts.trade);
  await form.getByRole("button", { name: "Registrieren" }).click();
  await expect(page.getByText("✉️")).toBeVisible();
  await page.goto("/postfach");
  const mail = page.locator("article", { hasText: email }).first();
  await page.goto((await mail.getByRole("link").getAttribute("href"))!);
  await expect(page.getByText(`Angemeldet als ${opts.name}`)).toBeVisible();
  if (opts.phone) await verifyPhone(page);
  return page;
}
