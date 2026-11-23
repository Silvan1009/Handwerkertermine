"use server";
import { cookies } from "next/headers";
import { currentUser } from "../../auth";
import { ctx } from "../../context";
import { PHONE_COOKIE, confirmPhone, requestPhoneCode } from "../../phone";
import { back, run } from "../run";

export async function requestPhoneCodeAction(form: FormData) {
  const user = await currentUser();
  if (!user) return back();
  await run(async () => {
    const token = await requestPhoneCode(ctx, user, form.get("phone"));
    (await cookies()).set(PHONE_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600 });
  }, "Code per SMS gesendet", "/profil");
}

export async function confirmPhoneAction(form: FormData) {
  const user = await currentUser();
  if (!user) return back();
  await run(async () => {
    await confirmPhone(ctx, user, Object.fromEntries(form));
    (await cookies()).delete(PHONE_COOKIE);
  }, "Handynummer bestätigt", "/profil");
}
