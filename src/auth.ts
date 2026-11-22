import { cookies } from "next/headers";
import { sessionToken, sessionUser } from "./accounts";
import { ctx } from "./context";

// Einzige Stelle mit Cookie-Handling; die Logik dahinter steckt testbar in accounts.ts.
export async function currentUser() {
  return sessionUser(ctx, (await cookies()).get("session")?.value ?? "");
}

export async function startSession(user: { id: number; sessionVersion: number }) {
  (await cookies()).set("session", sessionToken(ctx, user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 3600,
  });
}

export async function endSession() {
  (await cookies()).delete("session");
}
