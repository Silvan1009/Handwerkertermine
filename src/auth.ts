import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { sign, verify } from "./accounts";
import { ctx } from "./context";
import { users } from "./db/schema";

const THIRTY_DAYS = 30 * 24 * 3600_000;

export async function currentUser() {
  const id = verify((await cookies()).get("session")?.value ?? "", "session", ctx.secret);
  return id ? ctx.db.query.users.findFirst({ where: eq(users.id, id) }) : undefined;
}

export async function startSession(userId: number) {
  (await cookies()).set("session", sign("session", userId, ctx.secret, THIRTY_DAYS), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: THIRTY_DAYS / 1000,
  });
}

export async function endSession() {
  (await cookies()).delete("session");
}
