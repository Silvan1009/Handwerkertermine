# Handwerkertermine

Termine bei Handwerkern buchen. Next.js (App Router, Server Actions) · Drizzle + SQLite/libSQL · Zod · Vitest.

```bash
npm i
npm run db:migrate && npm run db:seed
npm run dev      # http://localhost:3000
npm test
```

## Aufbau

| Datei | Zweck |
|---|---|
| `src/booking.ts` | Gesamte Fachlogik: Slots, Validierung, Buchen. Bekommt die DB als Parameter. |
| `src/booking.test.ts` | Tests gegen echte In-Memory-SQLite – keine Mocks. |
| `src/db/schema.ts` | Datenmodell. Unique-Index verhindert Doppelbuchungen auf DB-Ebene. |
| `src/app/**` | Dünne UI-Schicht, ruft nur `booking.ts` auf. |

Schema ändern: `src/db/schema.ts` anpassen → `npm run db:generate` → `npm run db:migrate`.

## Bewusste Vereinfachungen (später ersetzen)

- Arbeitszeiten fest im Code (Mo–Fr, 1h-Slots, Mittagspause) → später pro Handwerker in der DB.
- Zeitzone fest `Europe/Berlin` (`next.config.ts`).
- Kein Login, keine E-Mail-Bestätigung.
- Produktion: `DATABASE_URL` auf Turso/libSQL zeigen lassen – kein Codewechsel nötig.
