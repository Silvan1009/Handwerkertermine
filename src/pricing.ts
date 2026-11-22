import { eq } from "drizzle-orm";
import type { Ctx } from "./context";
import { CATEGORIES, users } from "./db/schema";
import { CATEGORY_LABELS } from "./availability";
import type { User } from "./requests";

export const PRICE_KINDS = [...CATEGORIES, "app", "erstkunde"] as const;
export type Kind = (typeof PRICE_KINDS)[number];
const DISCOUNT_ONLY: Kind[] = ["app", "erstkunde"]; // „Rabatt“ darf keine versteckte Gebühr sein

export const KIND_LABELS: Record<Kind, string> = { ...CATEGORY_LABELS, app: "Buchung über die App", erstkunde: "Erstkunde" };

/** value: Prozent bzw. Cent. Positiv = Aufschlag, negativ = Rabatt. */
export type Rule = { mode: "prozent" | "absolut"; value: number };
export type Pricing = Partial<Record<Kind, Rule>>;
export type Condition = { kind: Kind; rule: Rule };

const eur = (cents: number) =>
  (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" }).replace(/\s/g, " ");
export const formatRule = (r: Rule) =>
  `${r.value > 0 ? "+" : ""}${r.mode === "prozent" ? `${r.value.toLocaleString("de-DE")} %` : eur(r.value)}`;
export const formatConditions = (cs: Condition[]) => cs.map((c) => `${KIND_LABELS[c.kind]} ${formatRule(c.rule)}`).join(" · ");

/** Formular → Regeln. Felder: `<kind>_value` (leer = keine Regel), `<kind>_mode`. */
export function parsePricing(input: Record<string, unknown>): Pricing {
  const out: Pricing = {};
  for (const k of PRICE_KINDS) {
    const raw = String(input[`${k}_value`] ?? "").trim();
    if (!raw) continue;
    const n = Number(raw.replace(",", "."));
    const mode = input[`${k}_mode`] === "absolut" ? "absolut" : "prozent";
    if (!Number.isFinite(n)) throw new Error(`${KIND_LABELS[k]}: keine gültige Zahl`);
    if (DISCOUNT_ONLY.includes(k) && n > 0) throw new Error(`${KIND_LABELS[k]}: nur Rabatte (negative Werte) erlaubt`);
    if (mode === "prozent" && n < -100) throw new Error(`${KIND_LABELS[k]}: mehr als 100 % Rabatt geht nicht`);
    out[k] = { mode, value: mode === "absolut" ? Math.round(n * 100) : n };
  }
  return out;
}

/** Reine Funktion: welche Regeln gelten für diese Buchung? */
export function conditionsFor(pricing: Pricing, o: { urgency: Kind; firstCustomer: boolean }): Condition[] {
  const kinds: Kind[] = [o.urgency, "app", ...(o.firstCustomer ? (["erstkunde"] as const) : [])];
  return kinds.flatMap((kind) => (pricing[kind] ? [{ kind, rule: pricing[kind] }] : []));
}

export async function setPricing(ctx: Ctx, user: User, input: Record<string, unknown>) {
  if (user.role !== "handwerker") throw new Error("Nicht erlaubt");
  await ctx.db.update(users).set({ pricing: parsePricing(input) }).where(eq(users.id, user.id));
}
