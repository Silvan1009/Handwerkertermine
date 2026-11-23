import { RATING_LABELS } from "../../urgency";

export const metadata = { title: "Datenschutz – Handwerkertermine" };

/** Verständliche Datenschutz-Hinweise – statisch, ohne Login. */
export default function Datenschutz() {
  return (
    <>
      <h2>🔒 Datenschutz</h2>
      <p><b>Entwurf:</b> Diese Seite erklärt in einfachen Worten, was die App mit deinen Daten macht. Sie ist keine Rechtsberatung und
        ersetzt keine geprüfte Datenschutzerklärung.</p>

      <h3>Welche Daten wir speichern</h3>
      <ul>
        <li><b>Konto:</b> Name, E-Mail-Adresse, Rolle (Kunde oder Handwerker), optional PLZ und Ort; bei Handwerkern zusätzlich Gewerk,
          Verfügbarkeit, Preisregeln und die maximale Zahl an Terminen pro Tag.</li>
        <li><b>Anfragen:</b> Beschreibung, deine Dringlichkeitsangabe, Terminvorschläge, der bestätigte Termin, Stornierungen und die
          bei der Buchung geltenden Rabatte und Aufschläge.</li>
        <li><b>Fotos</b>, die du einer Anfrage anhängst (höchstens 5, im Browser vorher verkleinert).</li>
        <li><b>Kalender</b> der Handwerker: externe Termine und Blocker mit optionalem Titel.</li>
        <li><b>Anmeldung:</b> ein Sitzungs-Cookie, damit du angemeldet bleibst. Wir setzen keine Werbe- oder Tracking-Cookies.</li>
      </ul>

      <h3>Wer was sieht</h3>
      <ul>
        <li>Eine Anfrage samt Fotos sehen nur der Kunde und der angefragte Handwerker – sonst niemand.</li>
        <li>Kunden sehen bei der Suche Name, Gewerk, PLZ/Ort und Verfügbarkeit der Handwerker.</li>
        <li>Handwerker sehen bei jeder Anfrage die bisherige <b>Bewertungsbilanz</b> des anfragenden Kunden (wie gut seine
          Dringlichkeitsangaben bisher gepasst haben).</li>
        <li>Externe Termine und Blocker im Kalender sieht nur der Handwerker selbst.</li>
      </ul>

      <h3>Bewertung der Dringlichkeit und automatische Sperre</h3>
      <p>Bei jeder Anfrage gibst du an, wie dringend sie ist. Der Handwerker kann diese Angabe einmal bewerten – jederzeit, auch vor
        der Bestätigung oder nach einer Stornierung:</p>
      <ul>
        <li>{RATING_LABELS.gut}: +1 Punkt</li>
        <li>{RATING_LABELS.schlecht}: −2 Punkte</li>
        <li>{RATING_LABELS.katastrophe}: −5 Punkte</li>
        <li>{RATING_LABELS.unterschaetzt}: 0 Punkte – nur Übertreibung wird bestraft</li>
      </ul>
      <p>Jeder startet mit 3 Punkten, es zählen nur die letzten 10 Bewertungen. Fällt der Stand unter 0, sperrt die App
        <b> automatisch</b> Notfall- und kurzfristige Anfragen. Normale und spätere Termine bleiben möglich; gut bewertete heben die
        Sperre wieder auf. Über jede Bewertung bekommst du eine Mail.</p>
      <p><b>Einspruch:</b> Gegen eine Bewertung als übertrieben oder stark übertrieben kannst du bei der Anfrage einmal Einspruch
        mit Begründung einlegen. Solange der Einspruch offen ist, zählt die Bewertung nicht. Der Handwerker nimmt die Bewertung dann
        zurück (sie zählt nie mehr) oder bestätigt sie (sie zählt wieder). Beide Seiten werden per Mail informiert.</p>

      <h3>E-Mails</h3>
      <p>Wir schicken Login-Links und Benachrichtigungen (neue Anfrage, Vorschläge, Bestätigung, Absage, Stornierung, Bewertung,
        Einspruch) an deine E-Mail-Adresse. Benachrichtigungen enthalten die Beschreibung der Anfrage. Newsletter oder Werbung
        verschicken wir nicht.</p>

      <h3>Wie lange wir speichern</h3>
      <p>Deine Daten bleiben gespeichert, bis dein Konto gelöscht wird. Eine Funktion zum Löschen des Kontos gibt es noch nicht –
        sie ist geplant. Bis dahin bitte beim Betreiber der App melden.</p>

      <p><a href="/">Zurück zur App</a></p>
    </>
  );
}
