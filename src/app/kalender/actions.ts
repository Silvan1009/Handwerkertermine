"use server";
import { currentUser } from "../../auth";
import { addEntry, deleteEntry, setMaxPerDay } from "../../calendar";
import { ctx } from "../../context";
import { UserError } from "../../errors";
import type { User } from "../../requests";
import { dayKey, dayRange } from "../../time";
import { back, run } from "../run";

/** Gewählter Tag aus dem Formular (YYYY-MM-DD), sonst heute – landet auch im Rücksprung-Pfad. */
const tagOf = (form: FormData) => {
  const t = String(form.get("tag") ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : dayKey(new Date());
};

/** Wie asUser, aber mit Erfolgsmeldung und Rücksprung auf den gewählten Tag. */
async function kal(form: FormData, info: string, fn: (u: User, tag: string) => Promise<unknown>) {
  const user = await currentUser();
  if (!user) return back();
  const tag = tagOf(form);
  await run(() => fn(user, tag), info, `/kalender?tag=${tag}`);
}

/** Uhrzeit (HH:MM) am Tag → datetime-local-String; fehlende Uhrzeit ist ein Nutzerfehler. */
function at(tag: string, form: FormData, field: "von" | "bis") {
  const t = String(form.get(field) ?? "");
  if (!/^\d{2}:\d{2}$/.test(t)) throw new UserError("Bitte Uhrzeit von und bis angeben");
  return `${tag}T${t}`;
}

const title = (form: FormData) => String(form.get("title") ?? "").trim() || undefined;

/** Tagesabschnitte für Blocker (Berliner Zeit). */
const ABSCHNITTE: Record<string, [string, string]> = { vormittag: ["08:00", "12:00"], nachmittag: ["12:00", "18:00"] };

export async function externAction(form: FormData) {
  await kal(form, "Externer Termin eingetragen", (u, tag) =>
    addEntry(ctx, u, { kind: "extern", start: at(tag, form, "von"), end: at(tag, form, "bis"), title: title(form) }),
  );
}

export async function blockerAction(form: FormData) {
  await kal(form, "Blocker eingetragen", (u, tag) => {
    const art = String(form.get("art") ?? "");
    const abschnitt = ABSCHNITTE[art];
    const [start, end] =
      art === "ganz" ? dayRange(tag)
      : abschnitt ? abschnitt.map((t) => `${tag}T${t}`)
      : [at(tag, form, "von"), at(tag, form, "bis")];
    return addEntry(ctx, u, { kind: "blocker", start, end, title: title(form) });
  });
}

export async function deleteEntryAction(form: FormData) {
  await kal(form, "Eintrag gelöscht", (u) => deleteEntry(ctx, u, Number(form.get("entryId"))));
}

export async function maxPerDayAction(form: FormData) {
  await kal(form, "Termine pro Tag gespeichert", (u) => setMaxPerDay(ctx, u, { maxPerDay: form.get("maxPerDay") ?? "" }));
}
