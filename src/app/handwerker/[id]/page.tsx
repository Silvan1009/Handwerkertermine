import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { book, freeSlots } from "../../../booking";
import { db } from "../../../db";
import { craftsmen } from "../../../db/schema";

export const dynamic = "force-dynamic";

async function bookAction(form: FormData) {
  "use server";
  const id = form.get("craftsmanId");
  try {
    await book(db, Object.fromEntries(form));
  } catch (e) {
    redirect(`/handwerker/${id}?error=${encodeURIComponent(e instanceof Error ? e.message : "Fehler")}`);
  }
  redirect(`/handwerker/${id}?ok=1`);
}

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> };

export default async function CraftsmanPage({ params, searchParams }: Props) {
  const id = Number((await params).id);
  const { ok, error } = await searchParams;
  const [craftsman] = await db.select().from(craftsmen).where(eq(craftsmen.id, id));
  if (!craftsman) notFound();

  const today = new Date();
  const days = Array.from({ length: 14 }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + i));
  const slots = (await Promise.all(days.map((d) => freeSlots(db, id, d)))).flat();

  return (
    <>
      <h2>{craftsman.name} ({craftsman.trade})</h2>
      {ok && <p>✅ Termin gebucht.</p>}
      {error && <p>❌ {error}</p>}
      <form action={bookAction}>
        <input type="hidden" name="craftsmanId" value={id} />
        <select name="start" required>
          {slots.map((s) => (
            <option key={s.toISOString()} value={s.toISOString()}>
              {s.toLocaleString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </option>
          ))}
        </select>{" "}
        <input name="customerName" placeholder="Name" required />{" "}
        <input name="customerEmail" type="email" placeholder="E-Mail" required />{" "}
        <button>Buchen</button>
      </form>
    </>
  );
}
