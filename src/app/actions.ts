"use server";
import { redirect } from "next/navigation";
import { endAllSessions, register, sealFlash, sendLoginLink, type Flash } from "../accounts";
import { setAvailability } from "../availability";
import { currentUser, endSession } from "../auth";
import { ctx } from "../context";
import { userMessage } from "../errors";
import { setPricing } from "../pricing";
import { chooseOption, createRequest, proposeOption, rateUrgency, rejectOptions, type User } from "../requests";

const back = (f?: Flash): never => redirect(f ? `/?flash=${sealFlash(ctx, f)}` : "/");

/** Führt eine Aktion aus und zeigt Erfolg/Fehler über eine signierte Meldung an – kein Client-State nötig. */
async function run(fn: () => Promise<unknown>, info?: string) {
  let flash: Flash | undefined = info ? { kind: "info", text: info } : undefined;
  try {
    await fn();
  } catch (e) {
    flash = { kind: "error", text: userMessage(e) };
  }
  back(flash);
}

async function asUser(fn: (user: User) => Promise<unknown>) {
  const user = await currentUser();
  if (!user) return back();
  await run(() => fn(user));
}

const LINK_SENT = "Falls alles passt, ist ein Link an deine Adresse unterwegs.";

export async function loginAction(form: FormData) {
  await run(() => sendLoginLink(ctx, form.get("email")), LINK_SENT);
}

export async function registerAction(form: FormData) {
  await run(() => register(ctx, Object.fromEntries(form)), LINK_SENT);
}

export async function logoutAction() {
  const user = await currentUser();
  if (user) await endAllSessions(ctx, user.id);
  await endSession();
  back();
}

export async function createRequestAction(form: FormData) {
  await asUser((u) => createRequest(ctx, u, Object.fromEntries(form)));
}

export async function proposeAction(form: FormData) {
  await asUser((u) => proposeOption(ctx, u, Object.fromEntries(form)));
}

export async function chooseAction(form: FormData) {
  await asUser((u) => chooseOption(ctx, u, Number(form.get("optionId"))));
}

export async function rejectAction(form: FormData) {
  await asUser((u) => rejectOptions(ctx, u, Number(form.get("requestId"))));
}

export async function availabilityAction(form: FormData) {
  await asUser((u) => setAvailability(ctx, u, Object.fromEntries(form)));
}

export async function rateAction(form: FormData) {
  await asUser((u) => rateUrgency(ctx, u, Number(form.get("requestId")), form.get("rating")));
}

export async function pricingAction(form: FormData) {
  await asUser((u) => setPricing(ctx, u, Object.fromEntries(form)));
}
