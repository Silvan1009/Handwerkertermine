import { expect, type Browser, type Page } from "@playwright/test";

/** Sammelt Browser-Fehler einer Seite (Hydration, Konsole) – im Test am Ende `expect(errors).toEqual([])`. */
export function trackErrors(page: Page, errors: string[]) {
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
}

/**
 * Registriert einen FRISCHEN Nutzer über das echte Formular und meldet ihn über das Test-Postfach an.
 * So kommen sich parallel laufende E2E-Dateien nicht in die Quere (eigene Nutzer statt Seed-Nutzer).
 */
export async function registerAndLogin(
  browser: Browser,
  opts: { name: string; role: "kunde" | "handwerker"; trade?: string },
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
  return page;
}
