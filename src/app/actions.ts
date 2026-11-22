"use server";
import { endAllSessions, register, sendLoginLink } from "../accounts";
import { setAvailability } from "../availability";
import { currentUser, endSession } from "../auth";
import { ctx } from "../context";
import { setPricing } from "../pricing";
import { chooseOption, createRequest, proposeOption, rateUrgency, rejectOptions } from "../requests";
import { asUser, back, run } from "./run";

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
  const photos = form.getAll("images").filter((f) => f instanceof File && f.size > 0); // leeres Dateifeld ignorieren
  await asUser((u) => createRequest(ctx, u, Object.fromEntries(form), photos));
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
