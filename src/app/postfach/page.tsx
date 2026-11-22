import { notFound } from "next/navigation";
import { devMailbox, devMailboxEnabled } from "../../mail";
import { formatLocal } from "../../time";

export const dynamic = "force-dynamic";

/** Test-Postfach: alle Mails der App inkl. klickbarer Login-Links – nur ohne SMTP in der Entwicklung. */
export default function Postfach() {
  if (!devMailboxEnabled) notFound();
  return (
    <>
      <h2>📬 Test-Postfach</h2>
      <p><a href="/postfach">Aktualisieren</a> · <a href="/">Zur App</a></p>
      {devMailbox.length === 0 && <p>Noch keine Mails.</p>}
      {devMailbox.map((m, i) => (
        <article key={i} style={{ borderTop: "1px solid #ccc", padding: "0.5rem 0" }}>
          <small>{formatLocal(m.at)} · an {m.to}</small>
          <br />
          <b>{m.subject}</b>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {m.text.split(/(https?:\/\/\S+)/).map((part, j) => (j % 2 ? <a key={j} href={part}>👉 Link öffnen</a> : part))}
          </p>
        </article>
      ))}
    </>
  );
}
