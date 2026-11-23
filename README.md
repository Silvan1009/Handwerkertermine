# Handwerkertermine

Kunde stellt Anfrage (optional mit bis zu 5 Fotos) → Handwerker schlägt feste Termine und/oder Zeitfenster vor → Kunde nimmt an,
lehnt ab oder macht einen Gegenvorschlag (den dann der Handwerker annimmt). Jeder Schritt benachrichtigt die Gegenseite per Mail.
Kunden können Anfragen stornieren (bestätigte Termine bis 24 h vorher). Handwerker pflegen einen Kalender mit
externen Terminen, Blockern (ganzer Tag, Vormittag, Nachmittag, eigene Stunden) und max. Terminen pro Tag.

Next.js (App Router, Server Actions) · Drizzle + SQLite/libSQL · Zod · Nodemailer · Vitest.

```bash
npm i
npm run db:setup # DB neu anlegen + Testdaten (db:reset: zusätzlich Migration aus dem Schema neu erzeugen)
npm run dev      # http://localhost:3000
npm test         # Unit-Tests (Vitest, < 2 s)
npm run e2e      # Smoke-Test im echten Browser (Playwright, startet die App selbst)
```

**Login in der Entwicklung:** E-Mail eingeben (z. B. `erika@example.com` oder `mueller@example.com` aus dem Seed) –
ohne `SMTP_URL` erscheinen alle Mails samt Login-Link im Terminal von `npm run dev`. Konfiguration: siehe `.env.example`.

## Auf dem Handy testen (GitHub Codespaces)

Läuft komplett im Handy-Browser – keine IDE, keine Installation.

1. Im Handy-Browser bei GitHub angemeldet diesen Link öffnen und **„Create codespace“** tippen:
   <https://codespaces.new/silvan1009/handwerkertermine/tree/ccr-301f6937-hcwqpf?quickstart=1>
2. Beim ersten Mal 2–3 Minuten warten: Pakete, Datenbank und Testdaten werden eingerichtet, die App startet automatisch.
3. App öffnen: im Codespace unten den Tab **„Ports“** → Zeile **„App (3000)“** → 🌐 „Im Browser öffnen“.
   Alternativ direkt die Adresse aufrufen: In der Codespace-Adresse `https://<name>.github.dev` das
   `.github.dev` durch **`-3000.app.github.dev`** ersetzen.
4. Anmelden: z. B. `erika@example.com` (Kundin) oder `mueller@example.com` (Handwerker) eingeben →
   **„📬 Test-Postfach öffnen“** → **„👉 Link öffnen“**. Im Postfach landen auch alle Benachrichtigungen.
5. Zweite Rolle gleichzeitig testen: zweiten Tab im Inkognito-Modus öffnen.

Gut zu wissen: Der Codespace stoppt nach 30 Min. ohne Nutzung und startet die App beim Fortsetzen von selbst.
Neuen Stand holen: im Codespace-Terminal `git pull && npm i && npm run db:setup` (die App lädt sich selbst neu).
Das Postfach zeigt die letzten 50 Mails und leert sich bei jedem Neustart der App.

## Aufbau

| Datei | Zweck |
|---|---|
| `src/requests.ts` | Fachlogik: Anfragen, Vorschläge, Annehmen, Ablehnen, Berechtigungen, Benachrichtigungen. |
| `src/availability.ts` | Inserat-Verfügbarkeit je Dringlichkeit; Suche nach Dringlichkeit, Gewerk, PLZ/Ort; Blättern (`paged`, 20 pro Seite). |
| `src/profile.ts` + `src/app/profil/` | Profil bearbeiten: Name, Gewerk, PLZ, Ort (E-Mail und Rolle fest); Handynummer bestätigen; Konto löschen. |
| `src/instrumentation.ts` | Hintergrund-Job: Mail bei abgelaufener Einspruchsfrist (`notifyExpiredAppeals` in `src/requests.ts`). |
| `src/phone.ts` | Handynummer per SMS-Code bestätigen (stateless, nur HMAC-Hash gespeichert); Pflicht für Notfall/kurzfristig. |
| `src/deletion.ts` | Konto löschen: anonymisieren, offene/künftige Termine stornieren + Mail, Fotos/Kalender/Profil entfernen. |
| `src/urgency.ts` | Scoring der Dringlichkeits-Selbsteinschätzung (siehe unten). |
| `src/pricing.ts` | Rabatte/Aufschläge (je Dringlichkeit, App-Buchung, Erstkunde; % oder €) und welche bei einer Buchung gelten. |
| `src/calendar.ts` | Kalender: externe Termine, Blocker, Termine pro Tag, Buchbarkeitsprüfung bei jedem Vorschlag und jeder Annahme. |
| `src/app/kalender/` | Kalenderansicht für Handwerker (Monatsraster + Tagesdetail). |
| `src/app/datenschutz/` | Datenschutz-Hinweise (Entwurf) – Daten, Sichtbarkeit, Bewertung, Sperre, Einspruch. |
| `src/accounts.ts` | Registrierung, Login-Link, signierte Tokens (HMAC, stateless). |
| `src/context.ts` | `Ctx` = alle Abhängigkeiten (DB, Mailer, Ratelimit, URL, Secret). Fachlogik bekommt ihn als Parameter. |
| `src/errors.ts` | `UserError` = Fehler, deren Text der Nutzer sehen darf. Alles andere wird nur geloggt. |
| `src/time.ts` | Termine sind immer Europe/Berlin – unabhängig von der Zeitzone des Servers. |
| `src/ratelimit.ts` | Spam-Bremse (In-Memory, pro Instanz). |
| `src/auth.ts` / `src/app/login/route.ts` | Session-Cookie und Link-Einlösung – die einzigen Stellen mit Next-spezifischem Auth-Code. |
| `src/*.test.ts` | Tests gegen echte In-Memory-SQLite + Mail-Postfach (`src/test-ctx.ts`) – keine Mocks. |
| `e2e/*.e2e.ts` | Browser-Tests (parallel); scheitern auch bei Fehlern in der Browser-Konsole. Neue Tests legen über `registerAndLogin` (`e2e/helpers.ts`) eigene Nutzer an, statt Seed-Nutzer zu verändern. |
| `src/app/image-picker.tsx` | Einzige Client-Komponente: verkleinert Fotos vor dem Upload im Browser auf max. 1600 px. |
| `src/app/bild/[id]/route.ts` | Liefert Fotos aus (in der DB gespeichert) – nur an Kunde und Handwerker der Anfrage. |
| `src/app/**` | Dünne UI: eine Seite, Server Actions rufen nur die Fachlogik auf. |

Designentscheidungen:
- **Vorschläge sind symmetrisch:** jede Seite kann vorschlagen, annehmen kann nur die Gegenseite. Gegenvorschlag ist damit kein Sonderfall.
- **Status wird abgeleitet**, nicht gespeichert (`statusOf`).
- **Login-Links** sind 15 Min. gültig und bis dahin mehrfach nutzbar – damit machen Link-Vorschauen von Mailprogrammen sie nicht kaputt.
- **Registrierung:** Der Account entsteht erst beim Klick auf den Bestätigungslink – niemand kann fremde Adressen vorbelegen.
- **Abmelden** beendet alle Sitzungen des Users (auch auf anderen Geräten oder mit gestohlenem Cookie).
- **Statusmeldungen** in der URL sind signiert – manipulierte `?flash=`-Links zeigen nichts an.
- **Limits:** 5 Login-/Registrierungslinks pro Adresse und Stunde, 10 Anfragen pro Kunde und Tag.
- **Mailfehler** werden geloggt, kippen aber keine bereits gespeicherte Aktion.

### Dringlichkeits-Scoring

Kunden geben bei jeder Anfrage an, wie dringend sie ist. Der Handwerker bewertet diese Einschätzung einmalig – jederzeit,
auch ohne Annahme oder nach Storno (gerade übertriebene Notfälle sollen bewertbar sein):

| Bewertung | Punkte |
|---|---|
| 👍 passend | +1 |
| 👎 übertrieben | −2 |
| ❌ stark übertrieben | −5 |
| ⬇️ dringender als angegeben | 0 – nur Übertreibung wird bestraft |

- Startguthaben **3**, es zählen nur die **letzten 10** Bewertungen → eine Sperre ist immer vorübergehend
- Score **< 0** → keine Notfall- oder kurzfristigen Anfragen; normale/spätere Termine bleiben möglich und heben die Sperre mit 👍 wieder auf
- Der Kunde bekommt bei jeder Bewertung eine Mail, bei Sperre mit Hinweis, wie er sie wieder aufhebt
- **Einspruch** gegen 👎/❌ (einmal, mit Begründung): Bis der Handwerker entscheidet, zählt die Bewertung nicht – höchstens
  **7 Tage**, danach zählt sie wieder. Er kann sie (auch später) zurücknehmen (zählt nie) oder bestätigen (zählt). Beide Seiten bekommen Mails –
  auch bei **Fristablauf**: Ein Hintergrund-Job (`src/instrumentation.ts`: kurz nach dem Start, danach alle 10 Min.) verschickt sie genau einmal je Einspruch.
- **Bewertungen hängen an der Handynummer:** Notfall-/kurzfristige Anfragen nur mit per SMS bestätigter Nummer; eine Nummer
  gehört höchstens einem aktiven Konto; Bewertungen aller Konten mit derselben Nummer (auch gelöschter) werden zusammengezählt
  → eine Sperre lässt sich weder mit einem neuen Konto noch durch Löschen umgehen.
- Handwerker sehen bei jeder Anfrage die Bewertungsbilanz des Kunden; erklärt auf `/datenschutz`

Stellschrauben: `RATING_POINTS`, `START`, `WINDOW` in `src/urgency.ts`, Beispiele als Tabelle in `src/urgency.test.ts`.
Werden die Regeln geändert, auch den Text auf `src/app/datenschutz/page.tsx` anpassen.

### Rabatte & Aufschläge (ohne Auftragspreise)

Handwerker hinterlegen im Inserat Regeln – je Dringlichkeit (Aufschlag oder Rabatt), „Buchung über die App“ und „Erstkunde“
(nur Rabatte), jeweils in % oder €. Auftragspreise gibt es in der App bewusst nicht; abgerechnet wird außerhalb.

- Bei jeder Buchung werden die geltenden Regeln als **Snapshot** in der Buchung gespeichert (`requests.conditions`)
- Kunde und Handwerker sehen sie nur in der jeweiligen Buchung
- **Erstkunde** = noch kein bestätigter Auftrag dieses Kunden bei diesem Handwerker zum Zeitpunkt der Anfrage

### Storno & Kalender

- **Storno:** nur der Kunde; unbestätigte Anfragen jederzeit, bestätigte nur, wenn der Termin (bzw. Beginn des Zeitfensters)
  noch ≥ 24 h entfernt ist. Danach sind keine Aktionen mehr möglich, der Handwerker bekommt eine Mail.
- **Buchbarkeit:** Jeder Vorschlag (auch Gegenvorschläge des Kunden) und jede Annahme wird geprüft: blockiert? Überschneidung
  mit App- oder externem Termin? Tageslimit erreicht? Kunden sehen dabei keine privaten Details des Handwerkers.
- **Termine pro Tag** zählt App- und externe Termine am Berliner Kalendertag ihres Beginns; Stornierte zählen nicht.
- **Keine Doppelbuchung:** Die Annahme ist eine einzige bedingte SQL-Anweisung – auch bei gleichzeitigen Annahmen gewinnt nur eine.
- **Erstkundenrabatt** gilt genau einmal je Kunde und Handwerker (stornierte Aufträge zählen nicht; bei parallelen Anfragen
  verliert die später bestätigte den Rabatt – atomar in derselben Anweisung).

Schema ändern: `src/db/schema.ts` anpassen → `npm run db:reset`. Die App ist nicht produktiv: Es gibt genau eine
Migration, die bei jeder Schemaänderung komplett neu erzeugt wird – keine Rücksicht auf Bestandsdaten.

## Noch nicht umgesetzt

- Echter SMS-Versand: Es ist kein Anbieter angebunden – Codes landen (in der Entwicklung) im Test-Postfach.
- Der Fristen-Job läuft per Timer im Server-Prozess (eine langlebige Instanz). Für mehrere Instanzen oder Serverless bräuchte es einen externen
  Zeitplaner, der `notifyExpiredAppeals` aufruft – die Funktion ist idempotent und dafür bereit.
