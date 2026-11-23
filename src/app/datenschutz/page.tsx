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
        <li><b>Handynummer</b> (freiwillig, nötig für Notfall- und kurzfristige Anfragen): Wir speichern sie <b>nicht im
          Klartext</b>, sondern nur einen nicht umkehrbaren Hash und die letzten zwei Ziffern zur Anzeige. Die Nummer selbst
          verwenden wir nur, um den Bestätigungscode per SMS zu schicken.</li>
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
        mit Begründung einlegen. Solange der Handwerker nicht entschieden hat, zählt die Bewertung nicht – höchstens aber
        <b>7 Tage</b> ab dem Einspruch; danach zählt sie wieder. Er kann auch später noch entscheiden: Nimmt er die Bewertung zurück,
        zählt sie nie; bestätigt er sie, zählt sie. Beide Seiten werden per Mail informiert – auch dann, wenn die Frist abläuft. Den Zeitpunkt deines Einspruchs
        speichern wir, um die Frist zu berechnen.</p>
      <p><b>Bewertungen hängen an der Handynummer:</b> Hast du eine Nummer bestätigt, werden Bewertungen aller Konten mit derselben
        Nummer zusammengezählt – auch die eines früher gelöschten Kontos. So lässt sich eine Sperre nicht mit einem neuen Konto
        umgehen. Eine Nummer kann immer nur bei einem aktiven Konto hinterlegt sein.</p>

      <h3>E-Mails</h3>
      <p>Per SMS schicken wir nur den Bestätigungscode für deine Handynummer (10 Minuten gültig; höchstens 3 Codes und 5
        Eingabeversuche pro Stunde). Für den Versand erhält der SMS-Anbieter die Nummer.</p>
      <p>Wir schicken Login-Links und Benachrichtigungen (neue Anfrage, Vorschläge, Bestätigung, Absage, Stornierung, Bewertung,
        Einspruch, Ablauf der Einspruchsfrist) an deine E-Mail-Adresse. Benachrichtigungen enthalten die Beschreibung der Anfrage. Newsletter oder Werbung
        verschicken wir nicht.</p>

      <h3>Wie lange wir speichern – Konto löschen</h3>
      <p>Deine Daten bleiben gespeichert, bis du dein Konto löschst. Das geht jederzeit unter <a href="/profil">Profil</a>
        (Bestätigung durch Eintippen von LÖSCHEN) und wirkt sofort:</p>
      <ul>
        <li>Name, E-Mail-Adresse, PLZ und Ort werden gelöscht; bei Handwerkern auch Gewerk, Inserat (Verfügbarkeit, Rabatte und
          Aufschläge, Termine pro Tag) und Kalender; bei Kunden alle Fotos, Anfragetexte und Einspruchsbegründungen.</li>
        <li>Offene und künftige Termine werden storniert, die Gegenseite bekommt eine Mail. Vergangene Termine bleiben beim
          Gegenüber als „Gelöschtes Konto“ sichtbar.</li>
        <li>Alle Sitzungen werden beendet; die E-Mail-Adresse kann danach neu registriert werden.</li>
        <li>Ist eine Handynummer bestätigt, bleiben ihr Hash, die letzten zwei Ziffern und die Dringlichkeitsbewertungen gespeichert
          (siehe oben – sonst ließe sich eine Sperre durch Löschen umgehen).</li>
      </ul>

      <p><a href="/">Zurück zur App</a></p>
    </>
  );
}
