import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./db";
import { options, requests, users } from "./db/schema";

export type User = typeof users.$inferSelect;

function deny(): never {
  throw new Error("Nicht erlaubt");
}

export function statusOf(r: { chosenOptionId: number | null; options: unknown[] }) {
  if (r.chosenOptionId) return "bestätigt";
  return r.options.length ? "Vorschläge liegen vor" : "wartet auf Handwerker";
}

const RequestInput = z.object({
  craftsmanId: z.coerce.number().int(),
  description: z.string().trim().min(1, "Beschreibung fehlt"),
});

export async function createRequest(db: Db, user: User, input: unknown) {
  if (user.role !== "kunde") deny();
  const data = RequestInput.parse(input);
  const craftsman = await db.query.users.findFirst({
    where: and(eq(users.id, data.craftsmanId), eq(users.role, "handwerker")),
  });
  if (!craftsman) throw new Error("Handwerker unbekannt");
  const [row] = await db.insert(requests).values({ ...data, customerId: user.id }).returning();
  return row;
}

const OptionInput = z
  .object({
    requestId: z.coerce.number().int(),
    kind: z.enum(["termin", "zeitfenster"]),
    start: z.coerce.date(),
    end: z.coerce.date(),
  })
  .refine((o) => o.end > o.start, "Ende muss nach Beginn liegen");

export async function proposeOption(db: Db, user: User, input: unknown, now = new Date()) {
  const data = OptionInput.parse(input);
  if (data.start <= now) throw new Error("Vorschlag liegt in der Vergangenheit");
  const req = await db.query.requests.findFirst({ where: eq(requests.id, data.requestId) });
  if (!req || req.craftsmanId !== user.id) deny();
  if (req.chosenOptionId) throw new Error("Anfrage ist bereits bestätigt");
  const [row] = await db.insert(options).values(data).returning();
  return row;
}

export async function chooseOption(db: Db, user: User, optionId: number) {
  const opt = await db.query.options.findFirst({ where: eq(options.id, optionId), with: { request: true } });
  if (!opt || opt.request.customerId !== user.id) deny();
  // Bedingtes Update = atomar, auch bei Doppelklick/parallelen Requests.
  const [row] = await db
    .update(requests)
    .set({ chosenOptionId: opt.id })
    .where(and(eq(requests.id, opt.requestId), isNull(requests.chosenOptionId)))
    .returning();
  if (!row) throw new Error("Es wurde bereits ein Vorschlag gewählt");
  return row;
}

export function listRequests(db: Db, user: User) {
  return db.query.requests.findMany({
    where: eq(user.role === "kunde" ? requests.customerId : requests.craftsmanId, user.id),
    with: { customer: true, craftsman: true, options: { orderBy: options.start } },
    orderBy: desc(requests.id),
  });
}
