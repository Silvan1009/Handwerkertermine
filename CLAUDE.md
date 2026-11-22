# Projektregeln

- **Nicht produktiv:** Keine Rücksicht auf Bestandsdaten, angemeldete User, Abwärtskompatibilität oder Produktionsbetrieb.
  Bestehenden Code und das Schema frei umbauen.
- **Datenbank:** genau eine Migration. Nach Schemaänderungen `npm run db:reset` (erzeugt `drizzle/` neu) – keine
  zusätzlichen Migrationen, keine Defaults nur für Altdaten.
- **Pragmatik:** so wenig Code wie möglich; Fachlogik in `src/*.ts` mit `Ctx` als Parameter, testbar ohne Mocks.
- **Prüfen:** `npm test`, `npx tsc --noEmit`, `npm run e2e`.
