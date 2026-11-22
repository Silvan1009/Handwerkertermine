import { redirect } from "next/navigation";
import { openFlash } from "../../accounts";
import { currentUser } from "../../auth";
import { calendarItems, type CalendarItem } from "../../calendar";
import { ctx } from "../../context";
import { TZ, dayKey, dayRange, formatLocal } from "../../time";
import * as a from "./actions";

export const dynamic = "force-dynamic";

const ICONS = { app: "📱", extern: "📒", blocker: "🚫" } as const;
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Kalendertag (UTC-Mitternacht) – nur zum Rechnen mit Tagen, nicht für Zeitpunkte. */
const utc = (key: string) => new Date(`${key.length === 7 ? `${key}-01` : key}T00:00Z`);
const keyOf = (d: Date) => d.toISOString().slice(0, 10);
const addMonths = (monat: string, n: number) => {
  const d = utc(monat);
  return keyOf(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))).slice(0, 7);
};
/** Gültiger Schlüssel (Tag bzw. Monat) – sonst null; verhindert z. B. „2030-02-31“. */
const valid = (s: string | undefined, len: 7 | 10) =>
  s && s.length === len && /^\d{4}-\d{2}(-\d{2})?$/.test(s) && !Number.isNaN(utc(s).getTime()) && keyOf(utc(s)).startsWith(s) ? s : null;

const hm = (d: Date) => d.toLocaleTimeString("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const overlaps = (i: CalendarItem, [s, e]: [Date, Date]) => i.start < e && i.end > s;

/** Zeitspanne eines Eintrags aus Sicht des Tages: „08:00–12:00“, „ganzer Tag“ oder mit Datum, wenn er über den Tag hinausreicht. */
function span(i: CalendarItem, [s, e]: [Date, Date]) {
  if (i.start <= s && i.end >= e) return "ganzer Tag";
  const from = i.start < s ? formatLocal(i.start) : hm(i.start);
  const to = i.end > e ? formatLocal(i.end) : i.end.getTime() === e.getTime() ? "24:00" : hm(i.end);
  return `${from}–${to}`;
}

const cell = { display: "block", minHeight: 44, padding: 2, border: "1px solid #ccc", color: "inherit", textDecoration: "none" };

export default async function Kalender({ searchParams }: { searchParams: Promise<{ monat?: string; tag?: string; flash?: string }> }) {
  const user = await currentUser();
  if (!user || user.role !== "handwerker") redirect("/");
  const params = await searchParams;
  const f = params.flash ? openFlash(ctx, params.flash) : null; // nur von uns signierte Meldungen anzeigen
  const heute = dayKey(new Date());
  const tag = valid(params.tag, 10) ?? heute;
  const monat = valid(params.monat, 7) ?? tag.slice(0, 7);

  // Monatsraster: Tage des Monats, davor Leerzellen bis Montag
  const first = utc(monat);
  const lead = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const days = Array.from({ length: count }, (_, i) => `${monat}-${String(i + 1).padStart(2, "0")}`);

  const tagRange = dayRange(tag);
  const monthFrom = dayRange(days[0])[0];
  const monthTo = dayRange(days[count - 1])[1];
  // Ein Abruf für Monat und gewählten Tag (der Tag kann außerhalb des angezeigten Monats liegen)
  const items = await calendarItems(
    ctx, user.id,
    new Date(Math.min(monthFrom.getTime(), tagRange[0].getTime())),
    new Date(Math.max(monthTo.getTime(), tagRange[1].getTime())),
  );
  const perDay = new Map<string, number>(); // Termine (App + extern) zählen am Tag ihres Beginns – wie die Kapazitätsprüfung
  for (const i of items) if (i.kind !== "blocker") perDay.set(dayKey(i.start), (perDay.get(dayKey(i.start)) ?? 0) + 1);
  const max = user.maxPerDay;
  const dayItems = items.filter((i) => overlaps(i, tagRange));

  const monthLabel = first.toLocaleDateString("de-DE", { timeZone: "UTC", month: "long", year: "numeric" });
  const tagLabel = utc(tag).toLocaleDateString("de-DE", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  const hidden = <input type="hidden" name="tag" value={tag} />;

  return (
    <>
      <h2>📅 Kalender</h2>
      {f && <p>{f.kind === "error" ? "❌" : "✅"} {f.text}</p>}

      <p style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <a href={`/kalender?monat=${addMonths(monat, -1)}&tag=${tag}`} aria-label="Vorheriger Monat">‹ zurück</a>
        <b>{monthLabel}</b>
        <a href={`/kalender?monat=${addMonths(monat, 1)}&tag=${tag}`} aria-label="Nächster Monat">vor ›</a>
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, fontSize: 13, textAlign: "center" }}>
        {WEEKDAYS.map((w) => <b key={w}>{w}</b>)}
        {Array.from({ length: lead }, (_, i) => <span key={`leer${i}`} />)}
        {days.map((d) => {
          const n = perDay.get(d) ?? 0;
          const blocked = items.some((i) => i.kind === "blocker" && overlaps(i, dayRange(d)));
          const full = max != null && n >= max;
          return (
            <a
              key={d}
              href={`/kalender?tag=${d}`}
              data-tag={d}
              style={{ ...cell, background: d === tag ? "#def" : undefined, borderColor: d === heute ? "#06c" : "#ccc", fontWeight: d === heute ? "bold" : undefined }}
            >
              {Number(d.slice(8))}
              <br />
              <small style={{ color: full ? "#b00" : undefined }}>{max != null ? `${n}/${max}` : n || ""}</small>
              {blocked && "🚫"}
            </a>
          );
        })}
      </div>
      <p><small>Zahl = Termine (App + extern){max != null && " / max. pro Tag"} · 🚫 = blockiert · <a href="/kalender">Heute</a></small></p>

      <h3>{tagLabel}</h3>
      {dayItems.length === 0 && <p>Keine Einträge.</p>}
      <ul id="eintraege">
        {dayItems.map((i) => (
          <li key={i.kind === "app" ? `a${i.requestId}` : `e${i.entryId}`}>
            {ICONS[i.kind]} {span(i, tagRange)} {i.title}
            {i.kind !== "app" && (
              <form action={a.deleteEntryAction} style={{ display: "inline" }}>
                {hidden}
                <input type="hidden" name="entryId" value={i.entryId} /> <button>Löschen</button>
              </form>
            )}
          </li>
        ))}
      </ul>

      <form action={a.externAction} aria-label="Externer Termin">
        <h3>📒 Externer Termin</h3>
        <small>Termine, die nicht über die App vergeben wurden – sie zählen für „Termine pro Tag“.</small>
        <br />
        {hidden}
        <input type="time" name="von" defaultValue="08:00" required aria-label="von" /> bis{" "}
        <input type="time" name="bis" defaultValue="10:00" required aria-label="bis" />
        <br />
        <input name="title" placeholder="Titel (nur für dich sichtbar)" maxLength={200} aria-label="Titel" />{" "}
        <button>Termin eintragen</button>
      </form>

      <form action={a.blockerAction} aria-label="Blocker">
        <h3>🚫 Blocker</h3>
        <small>In blockierten Zeiten können keine App-Termine vereinbart werden.</small>
        <br />
        {hidden}
        <select name="art" defaultValue="ganz" aria-label="Zeitraum">
          <option value="ganz">Ganzer Tag</option>
          <option value="vormittag">Vormittag (08–12 Uhr)</option>
          <option value="nachmittag">Nachmittag (12–18 Uhr)</option>
          <option value="eigene">Eigene Uhrzeit:</option>
        </select>{" "}
        <input type="time" name="von" aria-label="von" /> bis <input type="time" name="bis" aria-label="bis" />
        <br />
        <input name="title" placeholder="Grund (optional)" maxLength={200} aria-label="Grund" /> <button>Blocker eintragen</button>
      </form>

      <form action={a.maxPerDayAction} aria-label="Termine pro Tag">
        <h3>Termine pro Tag</h3>
        {hidden}
        Höchstens{" "}
        <input type="number" name="maxPerDay" min={1} max={50} defaultValue={max ?? ""} placeholder="unbegrenzt" aria-label="Termine pro Tag" style={{ width: "8em" }} />{" "}
        Termine (App + extern) pro Tag, leer = unbegrenzt <button>Speichern</button>
      </form>
    </>
  );
}
