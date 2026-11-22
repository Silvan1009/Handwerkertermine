import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "./db";
import { users } from "./db/schema";

// ⚠️ DEV-LOGIN: ungesichertes Cookie mit User-ID. Vor Go-Live durch echte Auth
// (z. B. Magic Link) ersetzen – nur diese Datei und login/logout in actions.ts sind betroffen.
export async function currentUser() {
  const id = Number((await cookies()).get("uid")?.value);
  return id ? db.query.users.findFirst({ where: eq(users.id, id) }) : undefined;
}
