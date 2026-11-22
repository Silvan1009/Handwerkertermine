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

export const formatLocal = (d: Date) =>
  d.toLocaleString("de-DE", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
