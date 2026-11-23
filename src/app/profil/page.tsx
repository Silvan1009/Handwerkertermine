import { redirect } from "next/navigation";
import { openFlash } from "../../accounts";
import { currentUser } from "../../auth";
import { ctx } from "../../context";
import { profileAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function Profil({ searchParams }: { searchParams: Promise<{ flash?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/");
  const params = await searchParams;
  const f = params.flash ? openFlash(ctx, params.flash) : null; // nur von uns signierte Meldungen anzeigen
  const isCraftsman = user.role === "handwerker";

  return (
    <>
      <p><a href="/">‹ Zur Startseite</a></p>
      <h2>👤 Profil</h2>
      {f && <p>{f.kind === "error" ? "❌" : "✅"} {f.text}</p>}
      <p>
        E-Mail: <b>{user.email}</b> · Rolle: <b>{isCraftsman ? "Handwerker" : "Kunde"}</b>
        <br />
        <small>E-Mail und Rolle können nicht geändert werden.</small>
      </p>
      <form action={profileAction} aria-label="Profil">
        <label>Name / Firma<br /><input name="name" defaultValue={user.name} required maxLength={100} /></label>
        <br />
        {isCraftsman && (
          <>
            <label>Gewerk<br /><input name="trade" defaultValue={user.trade ?? ""} required maxLength={100} /></label>
            <br />
          </>
        )}
        <label>PLZ{!isCraftsman && " (optional)"}<br /><input name="plz" defaultValue={user.plz ?? ""} inputMode="numeric" maxLength={5} placeholder="z. B. 80331" /></label>
        <br />
        <label>Ort{!isCraftsman && " (optional)"}<br /><input name="ort" defaultValue={user.ort ?? ""} maxLength={100} /></label>
        <br />
        <button>Speichern</button>
      </form>
    </>
  );
}
