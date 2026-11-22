import { redirect } from "next/navigation";
import { sealFlash, type Flash } from "../accounts";
import { currentUser } from "../auth";
import { ctx } from "../context";
import { userMessage } from "../errors";
import type { User } from "../requests";

// Gemeinsame Helfer für Server Actions (Startseite und Kalender).

/** Zurück zu `path` (Standard "/"), optional mit signierter Statusmeldung. */
export function back(f?: Flash, path = "/"): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(f ? `${path}${sep}flash=${sealFlash(ctx, f)}` : path);
}

/** Führt eine Aktion aus und zeigt Erfolg/Fehler über eine signierte Meldung an – kein Client-State nötig. */
export async function run(fn: () => Promise<unknown>, info?: string, path = "/") {
  let flash: Flash | undefined = info ? { kind: "info", text: info } : undefined;
  try {
    await fn();
  } catch (e) {
    flash = { kind: "error", text: userMessage(e) };
  }
  back(flash, path);
}

export async function asUser(fn: (user: User) => Promise<unknown>, path = "/") {
  const user = await currentUser();
  if (!user) return back();
  await run(() => fn(user), undefined, path);
}
