# Handwerkertermine

Kunde stellt Anfrage → Handwerker schlägt feste Termine und/oder Zeitfenster vor → Kunde wählt eine Option.

Next.js (App Router, Server Actions) · Drizzle + SQLite/libSQL · Zod · Vitest.

```bash
npm i
npm run db:migrate && npm run db:seed
npm run dev      # http://localhost:3000 – Dev-Login per Klick
npm test
```

## Aufbau

| Datei | Zweck |
|---|---|
| `src/requests.ts` | Gesamte Fachlogik inkl. Berechtigungen. Bekommt DB und User als Parameter. |
| `src/requests.test.ts` | Tests gegen echte In-Memory-SQLite – keine Mocks. |
| `src/db/schema.ts` | `users` (Rolle kunde/handwerker), `requests`, `options` (termin/zeitfenster). |
| `src/auth.ts` | `currentUser()` – einzige Stelle, die Auth kennt. |
| `src/app/**` | Dünne UI: eine Seite, Server Actions rufen nur `requests.ts` auf. |

Status einer Anfrage wird abgeleitet, nicht gespeichert: keine Optionen → wartet, Optionen → Vorschläge liegen vor, gewählt → bestätigt.

Schema ändern: `src/db/schema.ts` anpassen → `npm run db:generate` → `npm run db:migrate`.

## Bewusste Vereinfachungen (später ersetzen)

- **Dev-Login ohne Passwort** (Cookie mit User-ID) – vor Go-Live echte Auth in `src/auth.ts`.
- Keine Benachrichtigungen (E-Mail) bei neuer Anfrage/Vorschlag/Auswahl.
- Kunde kann keine Gegenvorschläge machen oder alle Vorschläge ablehnen.
- Zeitzone fest `Europe/Berlin` (`next.config.ts`).
