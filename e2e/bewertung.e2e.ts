import { expect, test } from "@playwright/test";
import { registerAndLogin } from "./helpers";

const errors: string[] = [];
test.beforeEach(() => void (errors.length = 0));
test.afterEach(() => expect(errors).toEqual([]));

const LOCK = "Notfall- und kurzfristige Anfragen sind vorübergehend gesperrt";

test("Bewertung ohne Annahme → Sperre + Mail → Einspruch → Handwerker nimmt zurück → Sperre weg", async ({ browser }) => {
  const run = `${Date.now()}`;
  const trade = `Bewertungstest${run}`;
  const text = `Keller unter Wasser ${run}`;
  const hw = await registerAndLogin(browser, { name: "Bewertung HW", role: "handwerker", trade }, errors);
  const kunde = await registerAndLogin(browser, { name: "Bewertung Kundin", role: "kunde" }, errors);

  // Kundin stellt eine Notfall-Anfrage
  await kunde.goto(`/?gewerk=${trade}`);
  await kunde.getByLabel(/Bewertung HW/).check();
  await kunde.fill("textarea", text);
  await kunde.selectOption("[name=urgency]", "notfall");
  await kunde.getByRole("button", { name: "Anfrage senden" }).click();
  const k = kunde.locator("article", { hasText: text });
  await expect(k).toContainText("wartet auf Vorschlag");

  // Handwerker schlägt einen Termin im Juni 2030 vor (wird nie angenommen) und bewertet trotzdem: ❌
  await hw.goto("/");
  const h = hw.locator("article", { hasText: text });
  await h.locator("[name=start]").fill("2030-06-12T09:00");
  await h.locator("[name=end]").fill("2030-06-12T10:00");
  await h.getByRole("button", { name: "Vorschlagen" }).click();
  await expect(h.locator("li")).toHaveCount(1);
  await h.getByRole("button", { name: "❌ stark übertrieben" }).click();
  await expect(h).toContainText("Einschätzung bewertet: ❌ stark übertrieben");
  await expect(h).toContainText("Vorschläge offen"); // nicht angenommen
  await expect(h.getByRole("button", { name: "👍 passend" })).toHaveCount(0); // nur einmal

  // Kundin sieht Bewertung und Sperre, Notfall ist nicht mehr wählbar
  await kunde.goto("/");
  await expect(k).toContainText("Einschätzung bewertet: ❌ stark übertrieben");
  await expect(kunde.getByText(LOCK)).toBeVisible();
  await expect(kunde.locator("[name=urgency] option[value=notfall]")).toBeDisabled();

  // … und hat eine Mail mit Sperrhinweis
  await kunde.goto("/postfach");
  const mail = kunde.locator("article", { hasText: text }).filter({ hasText: "Deine Dringlichkeitsangabe wurde bewertet: ❌ stark übertrieben" });
  await expect(mail).toHaveCount(1);
  await expect(mail).toContainText(LOCK);

  // Einspruch: bis zur Entscheidung zählt die Bewertung nicht
  await kunde.goto("/");
  await k.locator("[name=reason]").fill("Das Wasser stand 20 cm hoch");
  await k.getByRole("button", { name: "Einspruch einlegen" }).click();
  await expect(k).toContainText("Einspruch offen: „Das Wasser stand 20 cm hoch“");
  await expect(k.getByRole("button", { name: "Einspruch einlegen" })).toHaveCount(0);
  await expect(kunde.getByText(LOCK)).toHaveCount(0);

  // Handwerker sieht den Einspruch samt Begründung und nimmt die Bewertung zurück
  await hw.goto("/");
  await expect(h).toContainText("Einspruch offen: „Das Wasser stand 20 cm hoch“");
  await h.getByRole("button", { name: "Bewertung zurücknehmen" }).click();
  await expect(h).toContainText("Einspruch erfolgreich – Bewertung zurückgenommen");
  await expect(h.locator("s")).toHaveText("❌ stark übertrieben"); // durchgestrichen
  await expect(h.getByRole("button", { name: "Bewertung bestätigen" })).toHaveCount(0);

  // Sperre bleibt weg, Kundin bekommt eine Mail
  await kunde.goto("/");
  await expect(kunde.getByText(LOCK)).toHaveCount(0);
  await expect(kunde.locator("[name=urgency] option[value=notfall]")).toBeEnabled();
  await kunde.goto("/postfach");
  await expect(
    kunde.locator("article", { hasText: text }).filter({ hasText: "Einspruch erfolgreich: Bewertung HW hat die Bewertung zurückgenommen" }),
  ).toHaveCount(1);
});
