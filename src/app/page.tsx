import { eq } from "drizzle-orm";
import { currentUser } from "../auth";
import { db } from "../db";
import { users } from "../db/schema";
import { listRequests, statusOf } from "../requests";
import { chooseAction, createRequestAction, login, logout, proposeAction } from "./actions";

export const dynamic = "force-dynamic";

const time = (d: Date) => d.toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const inline = { display: "inline" };

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await currentUser();
  const { error } = await searchParams;

  if (!user) {
    const all = await db.select().from(users);
    return (
      <form action={login}>
        <p>Dev-Login als:</p>
        {all.map((u) => (
          <button key={u.id} name="userId" value={u.id}>{u.name} ({u.role})</button>
        ))}
      </form>
    );
  }

  const isKunde = user.role === "kunde";
  const list = await listRequests(db, user);
  const craftsmen = isKunde ? await db.select().from(users).where(eq(users.role, "handwerker")) : [];

  return (
    <>
      <p>
        Angemeldet als <b>{user.name}</b>{" "}
        <form action={logout} style={inline}><button>Abmelden</button></form>
      </p>
      {error && <p>❌ {error}</p>}

      {isKunde && (
        <form action={createRequestAction}>
          <h2>Neue Anfrage</h2>
          <select name="craftsmanId">
            {craftsmen.map((c) => <option key={c.id} value={c.id}>{c.name} – {c.trade}</option>)}
          </select>
          <br />
          <textarea name="description" placeholder="Was ist zu tun?" required cols={50} />
          <br />
          <button>Anfrage senden</button>
        </form>
      )}

      <h2>{isKunde ? "Meine Anfragen" : "Eingegangene Anfragen"}</h2>
      {list.map((r) => (
        <article key={r.id} style={{ borderTop: "1px solid #ccc", padding: "0.5rem 0" }}>
          <b>{isKunde ? r.craftsman.name : r.customer.name}</b> · {statusOf(r)}
          <p>{r.description}</p>
          <ul>
            {r.options.map((o) => (
              <li key={o.id}>
                {o.kind === "termin" ? "Termin" : "Zeitfenster"} {time(o.start)} – {time(o.end)}{" "}
                {o.id === r.chosenOptionId && "✅"}
                {isKunde && !r.chosenOptionId && (
                  <form action={chooseAction} style={inline}>
                    <button name="optionId" value={o.id}>Wählen</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {!isKunde && !r.chosenOptionId && (
            <form action={proposeAction}>
              <input type="hidden" name="requestId" value={r.id} />
              <select name="kind">
                <option value="termin">Fester Termin</option>
                <option value="zeitfenster">Zeitfenster</option>
              </select>{" "}
              <input type="datetime-local" name="start" required /> bis{" "}
              <input type="datetime-local" name="end" required /> <button>Vorschlagen</button>
            </form>
          )}
        </article>
      ))}
    </>
  );
}
