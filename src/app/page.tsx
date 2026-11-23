import { openFlash } from "../accounts";
import { currentUser } from "../auth";
import { ctx } from "../context";
import { CATEGORY_LABELS, LEVEL_LABELS, findCraftsmen } from "../availability";
import { CATEGORIES, LEVELS, RATINGS, type Category } from "../db/schema";
import { canCancel, listRequests, statusOf } from "../requests";
import { APPEALABLE, LOCK_HINT, RATING_ICONS, RATING_LABELS, RESTRICTED, appealDeadline, standingsOf } from "../urgency";
import { formatLocal as time } from "../time";
import { devMailboxEnabled } from "../mail";
import { KIND_LABELS, PRICE_KINDS, formatConditions, type Condition } from "../pricing";
import * as a from "./actions";
import { ImagePicker } from "./image-picker";

export const dynamic = "force-dynamic";

const inline = { display: "inline" };
/** In der Buchung geltende Rabatte/Aufschläge – Abrechnung erfolgt außerhalb der App. */
const Conditions = ({ conditions }: { conditions: Condition[] }) =>
  conditions.length > 0 && <p>💶 Konditionen dieser Buchung: {formatConditions(conditions)}</p>;
/** Blättern – nur sichtbar, wenn es mehr als eine Seite gibt. */
const Pager = ({ page, more, href }: { page: number; more: boolean; href: (page: number) => string }) =>
  (page > 1 || more) && (
    <p>
      {page > 1 && <a href={href(page - 1)}>‹ Zurück</a>} Seite {page} {more && <a href={href(page + 1)}>Weiter ›</a>}
    </p>
  );
const pageNo = (s?: string) => Math.min(Math.max(1, parseInt(s ?? "") || 1), 10_000);

export default async function Home({ searchParams }: { searchParams: Promise<Record<"flash" | "dringlichkeit" | "gewerk" | "ort" | "hseite" | "aseite", string | undefined>> }) {
  const user = await currentUser();
  const params = await searchParams;
  const f = params.flash ? openFlash(ctx, params.flash) : null; // nur von uns signierte Meldungen anzeigen
  const dringlichkeit = params.dringlichkeit;
  const urgency = CATEGORIES.find((c) => c === dringlichkeit) as Category | undefined;
  const search = { dringlichkeit: urgency ?? "", gewerk: params.gewerk?.trim() ?? "", ort: params.ort?.trim() ?? "" };
  const hseite = pageNo(params.hseite), aseite = pageNo(params.aseite);
  /** Link zu einer anderen Seite: Filter und die Seite der jeweils anderen Liste bleiben erhalten. */
  const href = (change: { hseite?: number; aseite?: number }) =>
    "/?" + new URLSearchParams(Object.entries({ ...search, hseite, aseite, ...change }).filter(([, v]) => v && v !== 1).map(([k, v]) => [k, `${v}`]));
  const flash = (
    <>
      {f && <p>{f.kind === "error" ? "❌" : "✉️"} {f.text}</p>}
      {devMailboxEnabled && <p><a href="/postfach">📬 Test-Postfach öffnen</a> (Login-Links & Benachrichtigungen)</p>}
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
  const list = await listRequests(ctx, user, aseite);
  const craftsmen = isKunde ? await findCraftsmen(ctx, { urgency, trade: search.gewerk, place: search.ort }, hseite) : undefined;
  // Kunde: eigenes Profil; Handwerker: Zuverlässigkeit jedes anfragenden Kunden
  const standings = await standingsOf(ctx, [...new Set(isKunde ? [user.id] : list.map((r) => r.customerId))]);
  const standingText = (id: number) => {
    const s = standings.get(id)!;
    const count = (r: (typeof RATINGS)[number]) => s.ratings.filter((x) => x === r).length;
    return `${RATINGS.map((r) => `${RATING_ICONS[r]} ${count(r)}`).join(" · ")} · Score ${s.score}${s.locked ? " ⛔" : ""}`;
  };
  const myStanding = isKunde ? standings.get(user.id)! : undefined;

  return (
    <>
      <div>
        Angemeldet als <b>{user.name}</b>{" "}
        <form action={a.logoutAction} style={inline}><button>Abmelden</button></form>
      </div>
      <p><a href="/profil">👤 Profil</a>{!isKunde && <> · <a href="/kalender">📅 Kalender</a></>}</p>
      {flash}

      {myStanding && (
        <p>
          Deine Dringlichkeits-Einschätzungen: {standingText(user.id)}
          {myStanding.locked && (
            <><br />⛔ {LOCK_HINT}</>
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
          <label>Gewerk: <input name="gewerk" defaultValue={search.gewerk} placeholder="z. B. Sanitär" size={12} /></label>{" "}
          <label>PLZ oder Ort: <input name="ort" defaultValue={search.ort} placeholder="z. B. 80 oder München" size={16} /></label>{" "}
          <button>Suchen</button>
        </form>
      )}

      {craftsmen && (
        <form action={a.createRequestAction}>
          <h2>Neue Anfrage</h2>
          {craftsmen.length === 0 && <p>Kein passender Handwerker gefunden.</p>}
          <div className="scroll">
          <table>
            <thead>
              <tr>
                <th /><th align="left">Handwerker</th><th align="left">PLZ / Ort</th>
                {CATEGORIES.map((k) => <th key={k}>{CATEGORY_LABELS[k]}</th>)}
              </tr>
            </thead>
            <tbody>
              {craftsmen.map((c) => (
                <tr key={c.id}>
                  <td><input type="radio" name="craftsmanId" value={c.id} id={`c${c.id}`} required /></td>
                  <td><label htmlFor={`c${c.id}`}>{c.name}<br /><small>{c.trade}</small></label></td>
                  <td>{[c.plz, c.ort].filter(Boolean).join(" ") || "–"}</td>
                  {CATEGORIES.map((k) => <td key={k}>{c[k] ? LEVEL_LABELS[c[k]] : "–"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <Pager page={hseite} more={craftsmen.more} href={(p) => href({ hseite: p })} />
          <textarea name="description" placeholder="Was ist zu tun?" required />
          <br />
          📷 Fotos (optional, max. 5): <ImagePicker />
          <br />
          Wie dringend ist es wirklich?{" "}
          <select name="urgency" defaultValue={urgency ?? ""} required>
            <option value="" disabled>bitte wählen</option>
            {CATEGORIES.map((k) => (
              <option key={k} value={k} disabled={myStanding?.locked && RESTRICTED.includes(k)}>{CATEGORY_LABELS[k]}</option>
            ))}
          </select>
          {!user.phoneHash && <><br /><small>📱 Notfall und kurzfristig nur mit bestätigter Handynummer – <a href="/profil">im Profil bestätigen</a></small></>}
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
          <small>
            Positiv = Aufschlag, negativ = Rabatt, leer = keine Regel. Die geltenden Regeln werden in der Buchung vermerkt.
          </small>
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
        const open = !r.chosenOptionId && !r.cancelledAt;
        const fromOther = r.options.some((o) => !o.rejected && o.proposedById !== user.id);
        return (
          <article key={r.id} style={{ borderTop: "1px solid #ccc", padding: "0.5rem 0" }}>
            <b>{isKunde ? r.craftsman.name : r.customer.name}</b> · {statusOf(r)} · {CATEGORY_LABELS[r.urgency]}
            {r.urgencyRating && (
              <> · Einschätzung bewertet:{" "}
                {r.appeal === "zurueckgenommen" ? <s>{RATING_LABELS[r.urgencyRating]}</s> : RATING_LABELS[r.urgencyRating]}
              </>
            )}
            {!isKunde && <><br /><small>Kunde bisher: {standingText(r.customerId)}</small></>}
            <p>{r.description}</p>
            {r.images.length > 0 && (
              <p>
                {r.images.map((img) => (
                  <a key={img.id} href={`/bild/${img.id}`}>
                    <img src={`/bild/${img.id}`} alt="Foto zur Anfrage" style={{ width: 96, height: 96, objectFit: "cover", marginRight: 4 }} />
                  </a>
                ))}
              </p>
            )}
            <Conditions conditions={r.conditions} />
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
            {!isKunde && !r.urgencyRating && (
              <form action={a.rateAction}>
                <input type="hidden" name="requestId" value={r.id} />
                War „{CATEGORY_LABELS[r.urgency]}“ passend?{" "}
                {RATINGS.map((x) => <button key={x} name="rating" value={x}>{RATING_LABELS[x]}</button>)}
              </form>
            )}
            {r.appeal && (
              <p>
                ⚖️ {r.appeal === "offen" ? "Einspruch offen" : r.appeal === "zurueckgenommen" ? "Einspruch erfolgreich – Bewertung zurückgenommen" : "Einspruch abgelehnt – Bewertung bleibt"}
                : „{r.appealReason}“
                {r.appeal === "offen" && r.appealedAt && (
                  <><br /><small>⏳ {appealDeadline(r.appealedAt).getTime() > Date.now()
                    ? `Frist bis ${time(appealDeadline(r.appealedAt))} (ohne Entscheidung zählt die Bewertung danach wieder)`
                    : "Einspruchsfrist abgelaufen – Bewertung zählt wieder (Entscheidung weiterhin möglich)"}</small></>
                )}
              </p>
            )}
            {!isKunde && r.appeal === "offen" && (
              <form action={a.decideAppealAction}>
                <input type="hidden" name="requestId" value={r.id} />
                <button name="decision" value="zurueckgenommen">Bewertung zurücknehmen</button>{" "}
                <button name="decision" value="bestaetigt">Bewertung bestätigen</button>
              </form>
            )}
            {isKunde && !r.appeal && r.urgencyRating && APPEALABLE.includes(r.urgencyRating) && (
              <form action={a.appealAction}>
                <input type="hidden" name="requestId" value={r.id} />
                Nicht einverstanden?{" "}
                <input name="reason" maxLength={500} required placeholder="Begründung" aria-label="Begründung für den Einspruch" />{" "}
                <button>Einspruch einlegen</button>
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
            {isKunde && !r.cancelledAt && (canCancel(r) ? (
              <form action={a.cancelAction}>
                <button name="requestId" value={r.id}>Stornieren</button>
              </form>
            ) : r.options.some((o) => o.id === r.chosenOptionId && o.start > new Date()) && (
              <p><small>Stornierung nur bis 24 h vor dem Termin möglich</small></p>
            ))}
          </article>
        );
      })}
      <Pager page={aseite} more={list.more} href={(p) => href({ aseite: p })} />
    </>
  );
}
