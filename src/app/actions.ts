"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { register, sendLoginLink } from "../accounts";
import { setAvailability } from "../availability";
import { currentUser, endSession } from "../auth";
import { ctx } from "../context";
import { chooseOption, createRequest, proposeOption, rejectOptions, type User } from "../requests";

const message = (e: unknown) =>
  e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : "Fehler";

/** Führt eine Aktion aus und zeigt Erfolg/Fehler über die URL an – kein Client-State nötig. */
async function run(fn: () => Promise<unknown>, info?: string) {
  let error = "";
  try {
    await fn();
  } catch (e) {
    error = message(e);
  }
  redirect(error ? `/?error=${encodeURIComponent(error)}` : info ? `/?info=${encodeURIComponent(info)}` : "/");
}

async function asUser(fn: (user: User) => Promise<unknown>) {
  const user = await currentUser();
  if (!user) redirect("/");
  await run(() => fn(user));
}

const LINK_SENT = "Falls die Adresse registriert ist, ist ein Login-Link unterwegs.";

export async function loginAction(form: FormData) {
  await run(() => sendLoginLink(ctx, form.get("email")), LINK_SENT);
}

export async function registerAction(form: FormData) {
  await run(() => register(ctx, Object.fromEntries(form)), LINK_SENT);
}

export async function logoutAction() {
  await endSession();
  redirect("/");
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
