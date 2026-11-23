"use server";
import { currentUser } from "../../auth";
import { ctx } from "../../context";
import { updateProfile } from "../../profile";
import { back, run } from "../run";

export async function profileAction(form: FormData) {
  const user = await currentUser();
  if (!user) return back();
  // email/role im Formular würden in updateProfile verworfen – sie sind nicht änderbar
  await run(() => updateProfile(ctx, user, Object.fromEntries(form)), "Profil gespeichert", "/profil");
}
