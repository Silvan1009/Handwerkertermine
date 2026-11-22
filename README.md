# Handwerkertermine

Kunde stellt Anfrage → Handwerker schlägt feste Termine und/oder Zeitfenster vor → Kunde nimmt an,
lehnt ab oder macht einen Gegenvorschlag (den dann der Handwerker annimmt). Jeder Schritt benachrichtigt die Gegenseite per Mail.

Next.js (App Router, Server Actions) · Drizzle + SQLite/libSQL · Zod · Nodemailer · Vitest.

```bash
npm i
npm run db:migrate && npm run db:seed
npm run dev      # http://localhost:3000
npm test
```

**Login in der Entwicklung:** E-Mail eingeben (z. B. `erika@example.com` oder `mueller@example.com` aus dem Seed) –
ohne `SMTP_URL` erscheinen alle Mails samt Login-Link im Terminal von `npm run dev`. Konfiguration: siehe `.env.example`.

## Aufbau

| Datei | Zweck |
|---|---|
| `src/requests.ts` | Fachlogik: Anfragen, Vorschläge, Annehmen, Ablehnen, Berechtigungen, Benachrichtigungen. |
| `src/availability.ts` | Inserat-Verfügbarkeit je Dringlichkeit (Notfall / 1–3 / 4–10 / ab 11 Tagen): frei, eingeschränkt, ausgebucht. |
| `src/accounts.ts` | Registrierung, Login-Link, signierte Tokens (HMAC, stateless). |
| `src/context.ts` | `Ctx` = alle Abhängigkeiten (DB, Mailer, URL, Secret). Fachlogik bekommt ihn als Parameter. |
| `src/auth.ts` / `src/app/login/route.ts` | Session-Cookie und Link-Einlösung – die einzigen Stellen mit Next-spezifischem Auth-Code. |
| `src/*.test.ts` | Tests gegen echte In-Memory-SQLite + Mail-Postfach (`src/test-ctx.ts`) – keine Mocks. |
| `src/app/**` | Dünne UI: eine Seite, Server Actions rufen nur die Fachlogik auf. |

Designentscheidungen:
- **Vorschläge sind symmetrisch:** jede Seite kann vorschlagen, annehmen kann nur die Gegenseite. Gegenvorschlag ist damit kein Sonderfall.
- **Status wird abgeleitet**, nicht gespeichert (`statusOf`).
- **Login-Links** sind 15 Min. gültig und bis dahin mehrfach nutzbar – damit machen Link-Vorschauen von Mailprogrammen sie nicht kaputt.
- **Mailfehler** werden geloggt, kippen aber keine bereits gespeicherte Aktion.

Schema ändern: `src/db/schema.ts` anpassen → `npm run db:generate` → `npm run db:migrate`.

## Bewusste Vereinfachungen

- Kein Rate-Limit auf „Login-Link senden“ – vor Go-Live z. B. per Reverse Proxy.
- Keine Profilbearbeitung, keine Suche/Filter nach Gewerk oder Ort.
- Zeitzone fest `Europe/Berlin` (`next.config.ts`).
