import { z } from "zod";

z.config(z.locales.de()); // deutsche Standard-Fehlermeldungen für alle Validierungen

/** Erwarteter Fachfehler – nur dessen Text darf der Nutzer sehen. */
export class UserError extends Error {}

/** Fehler → Text für den Nutzer. Alles Unerwartete (DB, SMTP …) wird nur geloggt. */
export function userMessage(e: unknown) {
  if (e instanceof UserError) return e.message;
  if (e instanceof z.ZodError) return e.issues[0].message;
  console.error(e);
  return "Unerwarteter Fehler – bitte später erneut versuchen";
}
