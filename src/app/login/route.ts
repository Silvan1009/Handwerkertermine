import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { verify } from "../../accounts";
import { startSession } from "../../auth";
import { ctx } from "../../context";

export async function GET(req: NextRequest) {
  const id = verify(req.nextUrl.searchParams.get("token") ?? "", "login", ctx.secret);
  if (!id) redirect(`/?error=${encodeURIComponent("Login-Link ungültig oder abgelaufen")}`);
  await startSession(id);
  redirect("/");
}
