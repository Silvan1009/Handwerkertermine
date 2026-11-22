# Handwerkertermine

Kunde stellt Anfrage → Handwerker schlägt feste Termine und/oder Zeitfenster vor → Kunde nimmt an,
lehnt ab oder macht einen Gegenvorschlag (den dann der Handwerker annimmt). Jeder Schritt benachrichtigt die Gegenseite per Mail.

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
| `src/availability.ts` | Inserat-Verfügbarkeit je Dringlichkeit (Notfall / 1–3 / 4–10 / ab 11 Tagen): frei, eingeschränkt, ausgebucht. |
| `src/urgency.ts` | Scoring der Dringlichkeits-Selbsteinschätzung (siehe unten). |
| `src/pricing.ts` | Rabatte/Aufschläge (je Dringlichkeit, App-Buchung, Erstkunde; % oder €) und welche bei einer Buchung gelten. |
| `src/accounts.ts` | Registrierung, Login-Link, signierte Tokens (HMAC, stateless). |
| `src/context.ts` | `Ctx` = alle Abhängigkeiten (DB, Mailer, Ratelimit, URL, Secret). Fachlogik bekommt ihn als Parameter. |
| `src/errors.ts` | `UserError` = Fehler, deren Text der Nutzer sehen darf. Alles andere wird nur geloggt. |
| `src/time.ts` | Termine sind immer Europe/Berlin – unabhängig von der Zeitzone des Servers. |
| `src/ratelimit.ts` | Spam-Bremse (In-Memory, pro Instanz). |
| `src/auth.ts` / `src/app/login/route.ts` | Session-Cookie und Link-Einlösung – die einzigen Stellen mit Next-spezifischem Auth-Code. |
| `src/*.test.ts` | Tests gegen echte In-Memory-SQLite + Mail-Postfach (`src/test-ctx.ts`) – keine Mocks. |
| `e2e/*.e2e.ts` | Browser-Smoke-Test; scheitert auch bei jedem Fehler in der Browser-Konsole. |
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

Kunden geben bei jeder Anfrage an, wie dringend sie ist. Nach der Bestätigung bewertet der Handwerker diese Einschätzung einmalig mit 👍, 👎 oder ❌ (Katastrophe).

- Startguthaben **3**, je Bewertung 👍 **+1**, 👎 **−2**, ❌ **−5**
- Es zählen nur die **letzten 10** Bewertungen, eine Sperre ist also immer vorübergehend
- Score **< 0** → keine Notfall- oder kurzfristigen Anfragen. Normale und spätere Termine bleiben möglich und heben die Sperre mit 👍 wieder auf (nach einem ❌ reichen zwei 👍)
- Handwerker sehen bei jeder Anfrage die bisherigen Bewertungen des Kunden

Stellschrauben: `RATING_POINTS`, `START`, `WINDOW` in `src/urgency.ts`, Beispiele als Tabelle in `src/urgency.test.ts`.

### Rabatte & Aufschläge (ohne Auftragspreise)

Handwerker hinterlegen im Inserat Regeln – je Dringlichkeit (Aufschlag oder Rabatt), „Buchung über die App“ und „Erstkunde“
(nur Rabatte), jeweils in % oder €. Auftragspreise gibt es in der App bewusst nicht; abgerechnet wird außerhalb.

- Bei jeder Buchung werden die geltenden Regeln als **Snapshot** in der Buchung gespeichert (`requests.conditions`)
- Kunde und Handwerker sehen sie nur in der jeweiligen Buchung
- **Erstkunde** = noch kein bestätigter Auftrag dieses Kunden bei diesem Handwerker zum Zeitpunkt der Anfrage

Schema ändern: `src/db/schema.ts` anpassen → `npm run db:reset`. Die App ist nicht produktiv: Es gibt genau eine
Migration, die bei jeder Schemaänderung komplett neu erzeugt wird – keine Rücksicht auf Bestandsdaten.

## Noch nicht umgesetzt

- Listen sind begrenzt (50 Anfragen, 100 Handwerker), es gibt noch kein Blättern.
- Keine Profilbearbeitung, keine Suche/Filter nach Gewerk oder Ort.
