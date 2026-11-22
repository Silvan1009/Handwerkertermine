/** Alle Termine sind deutsche Ortszeit – unabhängig von der Zeitzone des Servers. */
export const TZ = "Europe/Berlin";

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** Minuten, die Berlin zum Zeitpunkt d vor UTC liegt (60 bzw. 120). */
function offsetMin(d: Date) {
  const p = Object.fromEntries(parts.formatToParts(d).map((x) => [x.type, Number(x.value)]));
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(d.getTime() / 1000) * 1000) / 60_000;
}

/** Wert eines `<input type="datetime-local">` („2030-01-07T08:00“, Berliner Zeit) → Date. */
export function parseLocal(s: string) {
  const asUtc = Date.parse(`${s}Z`);
  if (Number.isNaN(asUtc)) return new Date(NaN);
  const guess = asUtc - offsetMin(new Date(asUtc)) * 60_000; // zweiter Schritt korrigiert Sommerzeit-Wechsel
  return new Date(asUtc - offsetMin(new Date(guess)) * 60_000);
}

/** Berliner Kalendertag eines Zeitpunkts als „YYYY-MM-DD“. */
export const dayKey = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: TZ });

/** Beginn und Ende (exklusiv) eines Berliner Kalendertags – berücksichtigt 23-/25-Stunden-Tage. */
export function dayRange(key: string): [Date, Date] {
  const [y, m, d] = key.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return [parseLocal(`${key}T00:00`), parseLocal(`${next}T00:00`)];
}

export const formatLocal = (d: Date) =>
  d.toLocaleString("de-DE", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
