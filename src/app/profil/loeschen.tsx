import type { User } from "../../requests";
import { deleteAccountAction } from "./loeschen-actions";

/** Abschnitt „Konto löschen“: Bestätigung durch Eintippen von LÖSCHEN – ohne Client-Komponente. */
export function LoeschenSection({ user }: { user: User }) {
  return (
    <form action={deleteAccountAction} aria-label="Konto löschen">
      <h3>🗑️ Konto löschen</h3>
      <p>
        <small>
          Dein Name, deine Kontaktdaten{user.role === "handwerker" ? ", dein Inserat und dein Kalender" : ", deine Anfragetexte und Fotos"} werden
          gelöscht. Offene und künftige Termine werden storniert, die Gegenseite bekommt eine Mail. Vergangene Termine bleiben
          beim Gegenüber als „Gelöschtes Konto“ sichtbar. Das kann nicht rückgängig gemacht werden.
        </small>
      </p>
      <label>Zur Bestätigung <b>LÖSCHEN</b> eintippen<br /><input name="confirm" required autoComplete="off" /></label>{" "}
      <button>Konto endgültig löschen</button>
    </form>
  );
}
