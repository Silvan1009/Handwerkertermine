// Hintergrund-Job (läuft in der einen Server-Instanz, ohne externen Zeitplaner): Mail bei abgelaufener Einspruchsfrist.
// Einmal kurz nach dem Start (holt Abläufe aus Ausfallzeiten nach), danach alle 10 Minuten. Doppelt versendet wird nie
// (notifyExpiredAppeals markiert jeden Einspruch atomar).
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as { fristenJob?: true };
  if (g.fristenJob) return; // Dev-Server: register kann mehrfach laufen
  g.fristenJob = true;

  const run = async () => {
    try {
      const [{ ctx }, { notifyExpiredAppeals }] = await Promise.all([import("./context"), import("./requests")]);
      const n = await notifyExpiredAppeals(ctx);
      if (n) console.log(`Einspruchsfristen abgelaufen: ${n} Benachrichtigung(en) verschickt`);
    } catch (e) {
      console.error("Fristen-Job fehlgeschlagen", e);
    }
  };
  setTimeout(run, 5_000).unref();
  setInterval(run, 10 * 60_000).unref();
}
