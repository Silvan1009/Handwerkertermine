import { currentUser } from "../../../auth";
import { ctx } from "../../../context";
import { loadImage } from "../../../requests";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Nicht angemeldet", { status: 401 });
  const img = await loadImage(ctx, user, Number((await params).id)).catch(() => null);
  if (!img) return new Response("Nicht gefunden", { status: 404 });
  return new Response(new Uint8Array(img.data), {
    headers: { "Content-Type": img.mime, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
