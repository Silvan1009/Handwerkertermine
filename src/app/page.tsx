import Link from "next/link";
import { db } from "../db";
import { craftsmen } from "../db/schema";

export const dynamic = "force-dynamic";

export default async function Home() {
  const list = await db.select().from(craftsmen);
  return (
    <ul>
      {list.map((c) => (
        <li key={c.id}>
          <Link href={`/handwerker/${c.id}`}>{c.name}</Link> – {c.trade}
        </li>
      ))}
    </ul>
  );
}
