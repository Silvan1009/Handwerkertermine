import { currentUser } from "../auth";
import { ctx } from "../context";
import { CATEGORY_LABELS, LEVEL_LABELS, findCraftsmen } from "../availability";
import { CATEGORIES, LEVELS, RATINGS, type Category } from "../db/schema";
import { listRequests, statusOf } from "../requests";
import { RATING_LABELS, RESTRICTED, standingOf } from "../urgency";
import { KIND_LABELS, PRICE_KINDS, eur, formatRule, type Pricing, type Quote } from "../pricing";
import * as a from "./actions";

export const dynamic = "force-dynamic";

const time = (d: Date) =>
  d.toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const inline = { display: "inline" };
const conditions = (p: Pricing | null) =>
  PRICE_KINDS.filter((k) => p?.[k]).map((k) => `${KIND_LABELS[k]} ${formatRule(p![k]!)}`).join(" · ") || "–";
const QuoteView = ({ q }: { q: Quote }) => (
  <p>
    💶 Grundpreis {eur(q.base)}
    {q.lines.map((l) => <span key={l.label}> · {l.label}: {l.amount > 0 ? "+" : ""}{eur(l.amount)}</span>)} → <b>{eur(q.total)}</b>
  </p>
);

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string; info?: string; dringlichkeit?: string }> }) {
  const user = await currentUser();
  const { error, info, dringlichkeit } = await searchParams;
  const urgency = CATEGORIES.find((c) => c === dringlichkeit) as Category | undefined;
  const flash = (
    <>
      {error && <p>❌ {error}</p>}
      {info && <p>✉️ {info}</p>}
    </>
  );

  if (!user) {
    return (
      <>
        {flash}
        <form action={a.loginAction}>
          <h2>Anmelden</h2>
          <input name="email" type="email" placeholder="E-Mail" required /> <button>Login-Link senden</button>
        </form>
        <form action={a.registerAction}>
          <h2>Registrieren</h2>
          <input name="name" placeholder="Name / Firma" required />{" "}
          <input name="email" type="email" placeholder="E-Mail" required />{" "}
          <select name="role">
            <option value="kunde">Ich suche einen Handwerker</option>
            <option value="handwerker">Ich bin Handwerker</option>
          </select>{" "}
          <input name="trade" placeholder="Gewerk (nur Handwerker)" /> <button>Registrieren</button>
        </form>
      </>
    );
  }

  const isKunde = user.role === "kunde";
  const list = await listRequests(ctx, user);
  const craftsmen = isKunde ? await findCraftsmen(ctx, urgency) : [];
  // Kunde: eigenes Profil; Handwerker: Zuverlässigkeit jedes anfragenden Kunden
  const standings = new Map(
    await Promise.all(
      [...new Set(isKunde ? [user.id] : list.map((r) => r.customerId))].map(async (id) => [id, await standingOf(ctx, id)] as const),
    ),
  );
  const standingText = (id: number) => {
    const s = standings.get(id)!;
    const count = (r: (typeof RATINGS)[number]) => s.ratings.filter((x) => x === r).length;
    return `${RATINGS.map((r) => `${RATING_LABELS[r]} ${count(r)}`).join(" · ")} · Score ${s.score}${s.locked ? " ⛔" : ""}`;
  };
  const myStanding = isKunde ? standings.get(user.id)! : undefined;

  return (
    <>
      <p>
        Angemeldet als <b>{user.name}</b>{" "}
        <form action={a.logoutAction} style={inline}><button>Abmelden</button></form>
      </p>
      {flash}

      {myStanding && (
        <p>
          Deine Dringlichkeits-Einschätzungen: {standingText(user.id)}
          {myStanding.locked && (
            <><br />⛔ Notfall- und kurzfristige Anfragen sind vorübergehend gesperrt. Gut eingeschätzte normale Termine heben die Sperre wieder auf.</>
          )}
        </p>
      )}

      {isKunde && (
        <form>
          <h2>Handwerker suchen</h2>
          Dringlichkeit:{" "}
          <select name="dringlichkeit" defaultValue={urgency ?? ""}>
            <option value="">alle</option>
            {CATEGORIES.map((k) => <option key={k} value={k}>{CATEGORY_LABELS[k]}</option>)}
          </select>{" "}
          <button>Filtern</button>
        </form>
      )}

      {isKunde && (
        <form action={a.createRequestAction}>
          <h2>Neue Anfrage</h2>
          {craftsmen.length === 0 && <p>Kein Handwerker für diese Dringlichkeit frei.</p>}
          <table>
            <thead>
              <tr>
                <th /><th align="left">Handwerker</th>
                {CATEGORIES.map((k) => <th key={k}>{CATEGORY_LABELS[k]}</th>)}
                <th>Rabatte / Aufschläge</th>
              </tr>
            </thead>
            <tbody>
              {craftsmen.map((c) => (
                <tr key={c.id}>
                  <td><input type="radio" name="craftsmanId" value={c.id} id={`c${c.id}`} required /></td>
                  <td><label htmlFor={`c${c.id}`}>{c.name} – {c.trade}</label></td>
                  {CATEGORIES.map((k) => <td key={k}>{c[k] ? LEVEL_LABELS[c[k]] : "–"}</td>)}
                  <td><small>{conditions(c.pricing)}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
          <textarea name="description" placeholder="Was ist zu tun?" required cols={50} />
          <br />
          Wie dringend ist es wirklich?{" "}
          <select name="urgency" defaultValue={urgency ?? ""} required>
            <option value="" disabled>bitte wählen</option>
            {CATEGORIES.map((k) => (
              <option key={k} value={k} disabled={myStanding?.locked && RESTRICTED.includes(k)}>{CATEGORY_LABELS[k]}</option>
            ))}
          </select>
          <br />
          <button>Anfrage senden</button>
        </form>
      )}

      {!isKunde && (
        <form action={a.availabilityAction}>
          <h2>Mein Inserat: Verfügbarkeit</h2>
          {CATEGORIES.map((k) => (
            <label key={k} style={{ display: "block" }}>
              {CATEGORY_LABELS[k]}:{" "}
              <select name={k} defaultValue={user[k] ?? ""}>
                <option value="">keine Angabe</option>
                {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
              </select>
            </label>
          ))}
          <button>Speichern</button>
        </form>
      )}

      {!isKunde && (
        <form action={a.pricingAction}>
          <h2>Mein Inserat: Rabatte & Aufschläge</h2>
          <small>Bezogen auf den Grundpreis je Auftrag. Positiv = Aufschlag, negativ = Rabatt, leer = keine Regel.</small>
          {PRICE_KINDS.map((k) => {
            const r = user.pricing?.[k];
            return (
              <label key={k} style={{ display: "block" }}>
                {KIND_LABELS[k]}:{" "}
                <input
                  name={`${k}_value`}
                  size={6}
                  placeholder={k === "app" || k === "erstkunde" ? "-10" : "+50"}
                  defaultValue={r ? (r.mode === "absolut" ? r.value / 100 : r.value) : ""}
                />{" "}
                <select name={`${k}_mode`} defaultValue={r?.mode ?? "prozent"}>
                  <option value="prozent">%</option>
                  <option value="absolut">€</option>
                </select>
              </label>
            );
          })}
          <button>Speichern</button>
        </form>
      )}

      <h2>{isKunde ? "Meine Anfragen" : "Eingegangene Anfragen"}</h2>
      {list.map((r) => {
        const open = !r.chosenOptionId;
        const fromOther = r.options.some((o) => !o.rejected && o.proposedById !== user.id);
        return (
          <article key={r.id} style={{ borderTop: "1px solid #ccc", padding: "0.5rem 0" }}>
            <b>{isKunde ? r.craftsman.name : r.customer.name}</b> · {statusOf(r)} · {CATEGORY_LABELS[r.urgency]}
            {r.urgencyRating && <> · Einschätzung bewertet: {RATING_LABELS[r.urgencyRating]}</>}
            {!isKunde && <><br /><small>Kunde bisher: {standingText(r.customerId)}</small></>}
            <p>{r.description}</p>
            {r.quote ? <QuoteView q={r.quote} /> : <p>💶 noch kein Preisangebot</p>}
            {!isKunde && open && (
              <form action={a.quoteAction}>
                <input type="hidden" name="requestId" value={r.id} />
                Grundpreis €: <input name="basePrice" size={8} required defaultValue={r.quote ? r.quote.base / 100 : ""} />{" "}
                <button>{r.quote ? "Preis aktualisieren" : "Preis anbieten"}</button>
              </form>
            )}
            <ul>
              {r.options.map((o) => (
                <li key={o.id} style={o.rejected ? { textDecoration: "line-through", opacity: 0.5 } : undefined}>
                  {o.kind === "termin" ? "Termin" : "Zeitfenster"} {time(o.start)} – {time(o.end)}
                  <small> (von {o.proposedById === user.id ? "dir" : isKunde ? "Handwerker" : "Kunde"})</small>{" "}
                  {o.id === r.chosenOptionId && "✅"}
                  {open && !o.rejected && o.proposedById !== user.id && (
                    <form action={a.chooseAction} style={inline}>
                      <button name="optionId" value={o.id}>Annehmen</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
            {!isKunde && !open && !r.urgencyRating && (
              <form action={a.rateAction}>
                <input type="hidden" name="requestId" value={r.id} />
                War „{CATEGORY_LABELS[r.urgency]}“ passend?{" "}
                {RATINGS.map((x) => <button key={x} name="rating" value={x}>{RATING_LABELS[x]}</button>)}
              </form>
            )}
            {open && fromOther && (
              <form action={a.rejectAction}>
                <button name="requestId" value={r.id}>Alle Vorschläge ablehnen</button>
              </form>
            )}
            {open && (
              <form action={a.proposeAction}>
                <input type="hidden" name="requestId" value={r.id} />
                {isKunde ? "Gegenvorschlag: " : "Vorschlag: "}
                <select name="kind">
                  <option value="termin">Fester Termin</option>
                  <option value="zeitfenster">Zeitfenster</option>
                </select>{" "}
                <input type="datetime-local" name="start" required /> bis{" "}
                <input type="datetime-local" name="end" required /> <button>Vorschlagen</button>
              </form>
            )}
          </article>
        );
      })}
    </>
  );
}
