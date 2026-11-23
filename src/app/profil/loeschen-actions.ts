"use server";
import { currentUser, endSession } from "../../auth";
import { ctx } from "../../context";
import { deleteAccount } from "../../deletion";
import { userMessage } from "../../errors";
import { back } from "../run";

export async function deleteAccountAction(form: FormData) {
  const user = await currentUser();
  if (!user) return back();
  try {
    await deleteAccount(ctx, user, Object.fromEntries(form)); // beendet auch alle Sitzungen
  } catch (e) {
    back({ kind: "error", text: userMessage(e) }, "/profil");
  }
  await endSession();
  back({ kind: "info", text: "Dein Konto wurde gelöscht." });
}
