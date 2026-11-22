"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { currentUser } from "../auth";
import { db } from "../db";
import { chooseOption, createRequest, proposeOption, type User } from "../requests";

export async function login(form: FormData) {
  (await cookies()).set("uid", String(form.get("userId")));
  redirect("/");
}

export async function logout() {
  (await cookies()).delete("uid");
  redirect("/");
}

async function run(fn: (user: User) => Promise<unknown>) {
  const user = await currentUser();
  if (!user) redirect("/");
  let error = "";
  try {
    await fn(user);
  } catch (e) {
    error = e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : "Fehler";
  }
  redirect(error ? `/?error=${encodeURIComponent(error)}` : "/");
}

export async function createRequestAction(form: FormData) {
  await run((u) => createRequest(db, u, Object.fromEntries(form)));
}

export async function proposeAction(form: FormData) {
  await run((u) => proposeOption(db, u, Object.fromEntries(form)));
}

export async function chooseAction(form: FormData) {
  await run((u) => chooseOption(db, u, Number(form.get("optionId"))));
}
