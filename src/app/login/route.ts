import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { redeem, sealFlash } from "../../accounts";
import { startSession } from "../../auth";
import { ctx } from "../../context";

export async function GET(req: NextRequest) {
  const user = await redeem(ctx, req.nextUrl.searchParams.get("token") ?? "");
  if (!user) redirect(`/?flash=${sealFlash(ctx, { kind: "error", text: "Login-Link ungültig oder abgelaufen" })}`);
  await startSession(user);
  redirect("/");
}
