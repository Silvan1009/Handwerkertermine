import { expect, test, type Browser } from "@playwright/test";
import { sign } from "../src/accounts";

// Jeder Fehler im Browser (z. B. Hydration-Fehler durch ungültiges HTML) lässt den Test scheitern.
const browserErrors: string[] = [];
test.beforeEach(() => void (browserErrors.length = 0));
test.afterEach(() => expect(browserErrors).toEqual([]));

// Seed-Reihenfolge: 1 = Erika (Kundin), 2 = Müller Sanitär
async function loginAs(browser: Browser, uid: number) {
  const page = await (await browser.newContext()).newPage();
  page.on("pageerror", (e) => browserErrors.push(e.message));
  page.on("console", (m) => m.type() === "error" && browserErrors.push(m.text()));
  await page.goto(`/login?token=${sign("login", { uid }, "e2e-secret", 60_000)}`);
  await expect(page.getByText("Angemeldet als")).toBeVisible();
  return page;
}

/** Erzeugt im Browser ein PNG mit 2400×1800 px (wie ein Handyfoto, nur kleiner in Bytes). */
async function bigPng(page: import("@playwright/test").Page) {
  const b64 = await page.evaluate(async () => {
    const c = new OffscreenCanvas(2400, 1800);
    const g = c.getContext("2d")!;
    g.fillStyle = "#c33";
    g.fillRect(0, 0, 2400, 1800);
    const blob = await c.convertToBlob({ type: "image/png" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return btoa(Array.from(bytes, (x) => String.fromCharCode(x)).join(""));
  });
  return Buffer.from(b64, "base64");
}

test("Anfrage mit Foto → Vorschlag → Annahme → Bewertung", async ({ browser }) => {
  const kunde = await loginAs(browser, 1);
  const hw = await loginAs(browser, 2);

  await kunde.getByLabel(/Müller/).check();
  await kunde.fill("textarea", "Rohrbruch im Keller");
  await kunde.selectOption("[name=urgency]", "notfall");
  // großes Foto (2400×1800) – wird im Browser auf max. 1600 px verkleinert
  await kunde.locator("[name=images]").setInputFiles({ name: "rohr.png", mimeType: "image/png", buffer: await bigPng(kunde) });
  await kunde.waitForFunction(() => (document.querySelector("[name=images]") as HTMLInputElement).files?.[0]?.type === "image/jpeg");
  await kunde.getByRole("button", { name: "Anfrage senden" }).click();
  await expect(kunde.locator("article")).toContainText("wartet auf Vorschlag");

  await hw.reload();
  // Handwerker sieht das Foto, verkleinert auf 1600 px Breite
  const foto = hw.locator('article img[alt="Foto zur Anfrage"]');
  await expect(foto).toHaveCount(1);
  await expect.poll(() => foto.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1600);
  await hw.fill("[name=start]", "2030-07-01T08:00");
  await hw.fill("[name=end]", "2030-07-01T10:00");
  await hw.getByRole("button", { name: "Vorschlagen" }).click();
  await expect(hw.locator("article li")).toContainText("Mo., 01.07., 08:00"); // Berliner Zeit hin und zurück

  await kunde.reload();
  await kunde.getByRole("button", { name: "Annehmen" }).click();
  await expect(kunde.locator("article")).toContainText("· bestätigt ·");

  await hw.reload();
  await hw.getByRole("button", { name: "👍" }).click();
  await expect(hw.locator("article")).toContainText("Einschätzung bewertet: 👍");
});

test("fremde Meldungen in der URL werden ignoriert, Abmelden entwertet alte Cookies", async ({ browser }) => {
  const page = await loginAs(browser, 1);
  await page.goto("/?flash=Ihr%20Konto%20ist%20gesperrt%2C%20rufen%20Sie%200900%20an");
  await expect(page.getByText("0900")).toHaveCount(0);

  const stolen = await page.context().cookies();
  await page.getByRole("button", { name: "Abmelden" }).click();
  const thief = await (await browser.newContext()).newPage();
  await thief.context().addCookies(stolen);
  await thief.goto("/");
  await expect(thief.getByRole("heading", { name: "Anmelden" })).toBeVisible();
});

test("Fotos sehen nur Beteiligte", async ({ browser }) => {
  const beteiligt = await loginAs(browser, 2); // Müller – hat die Anfrage mit Foto aus dem ersten Test
  const ok = await beteiligt.request.get("/bild/1");
  expect(ok.status()).toBe(200);
  expect(ok.headers()["content-type"]).toBe("image/jpeg");
  const fremd = await loginAs(browser, 3); // Schmidt Elektro – nicht beteiligt
  const res = await fremd.request.get("/bild/1");
  expect(res.status()).toBe(404);
  const anonym = await (await browser.newContext()).request.get("http://localhost:3200/bild/1");
  expect(anonym.status()).toBe(401);
});
