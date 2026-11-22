import { eq } from "drizzle-orm";
import { currentUser } from "../auth";
import { ctx } from "../context";
import { CATEGORY_LABELS, LEVEL_LABELS } from "../availability";
import { CATEGORIES, LEVELS, users } from "../db/schema";
import { listRequests, statusOf } from "../requests";
import * as a from "./actions";

export const dynamic = "force-dynamic";

const time = (d: Date) =>
  d.toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const inline = { display: "inline" };

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string; info?: string }> }) {
  const user = await currentUser();
  const { error, info } = await searchParams;
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
  const craftsmen = isKunde ? await ctx.db.select().from(users).where(eq(users.role, "handwerker")) : [];

  return (
    <>
      <p>
        Angemeldet als <b>{user.name}</b>{" "}
        <form action={a.logoutAction} style={inline}><button>Abmelden</button></form>
      </p>
      {flash}

      {isKunde && (
        <form action={a.createRequestAction}>
          <h2>Neue Anfrage</h2>
          <table>
            <thead>
              <tr>
                <th /><th align="left">Handwerker</th>
                {CATEGORIES.map((k) => <th key={k}>{CATEGORY_LABELS[k]}</th>)}
              </tr>
            </thead>
            <tbody>
              {craftsmen.map((c) => (
                <tr key={c.id}>
                  <td><input type="radio" name="craftsmanId" value={c.id} id={`c${c.id}`} required /></td>
                  <td><label htmlFor={`c${c.id}`}>{c.name} – {c.trade}</label></td>
                  {CATEGORIES.map((k) => <td key={k}>{c[k] ? LEVEL_LABELS[c[k]] : "–"}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <textarea name="description" placeholder="Was ist zu tun?" required cols={50} />
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

      <h2>{isKunde ? "Meine Anfragen" : "Eingegangene Anfragen"}</h2>
      {list.map((r) => {
        const open = !r.chosenOptionId;
        const fromOther = r.options.some((o) => !o.rejected && o.proposedById !== user.id);
        return (
          <article key={r.id} style={{ borderTop: "1px solid #ccc", padding: "0.5rem 0" }}>
            <b>{isKunde ? r.craftsman.name : r.customer.name}</b> · {statusOf(r)}
            <p>{r.description}</p>
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
