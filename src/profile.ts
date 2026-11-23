import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Ctx } from "./context";
import { users } from "./db/schema";
import { UserError } from "./errors";
import type { User } from "./requests";

// "" bzw. fehlendes Feld = keine Angabe. Unbekannte Felder (z. B. email, role) verwirft Zod – sie sind nicht änderbar.
const Optional = z.string().trim().max(100).optional().transform((v) => v || null);
const ProfileInput = z.object({
  name: z.string().trim().min(1, "Name fehlt").max(100),
  trade: Optional,
  plz: z.string().trim().regex(/^(\d{5})?$/, "PLZ muss aus 5 Ziffern bestehen").optional().transform((v) => v || null),
  ort: Optional,
});

/** Eigenes Profil: Name, PLZ, Ort; Gewerk nur für Handwerker (dort Pflicht). E-Mail und Rolle bleiben unverändert. */
export async function updateProfile(ctx: Ctx, user: User, input: unknown) {
  const { name, trade, plz, ort } = ProfileInput.parse(input);
  const isCraftsman = user.role === "handwerker";
  if (isCraftsman && !trade) throw new UserError("Gewerk fehlt");
  await ctx.db.update(users).set({ name, trade: isCraftsman ? trade : null, plz, ort }).where(eq(users.id, user.id));
}
