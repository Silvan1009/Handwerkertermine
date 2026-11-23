import { cookies } from "next/headers";
import { ctx } from "../../context";
import { PHONE_COOKIE, pendingPhone } from "../../phone";
import type { User } from "../../requests";
import { confirmPhoneAction, requestPhoneCodeAction } from "./telefon-actions";

/** Abschnitt „Handynummer bestätigen“ (nur Kunden): Nummer → Code per SMS → Code eingeben. */
export async function TelefonSection({ user }: { user: User }) {
  if (user.role !== "kunde") return null;
  const token = (await cookies()).get(PHONE_COOKIE)?.value;
  const pending = token && pendingPhone(ctx, user, token);
  return (
    <>
      <h3>📱 Handynummer bestätigen</h3>
      <p>
        {user.phoneHash ? <>✅ Handynummer bestätigt (endet auf ••{user.phoneHint})</> : "Noch keine Handynummer bestätigt."}
        <br />
        <small>
          Nötig für Notfall- und kurzfristige Anfragen. Eine Nummer gehört zu höchstens einem Konto; die Bewertungen deiner
          Dringlichkeitsangaben hängen an der Nummer. Wir speichern sie nicht im Klartext, nur einen Fingerabdruck und die letzten 2 Ziffern.
        </small>
      </p>
      <form action={requestPhoneCodeAction} aria-label="Handynummer">
        <label>{user.phoneHash ? "Andere Nummer bestätigen" : "Handynummer"}<br /><input name="phone" type="tel" required maxLength={30} placeholder="z. B. 0151 23456789" autoComplete="tel" /></label>{" "}
        <button>Code per SMS senden</button>
      </form>
      {pending && (
        <form action={confirmPhoneAction} aria-label="Code bestätigen">
          <input type="hidden" name="token" value={token} />
          <label>Code aus der SMS an ••{pending.hint} (10 Min. gültig)<br /><input name="code" required inputMode="numeric" maxLength={6} autoComplete="one-time-code" /></label>{" "}
          <button>Nummer bestätigen</button>
        </form>
      )}
    </>
  );
}
