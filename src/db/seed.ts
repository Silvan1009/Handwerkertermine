import { db } from "./index";
import { users } from "./schema";

await db.insert(users).values([
  { name: "Erika Kundin", role: "kunde" },
  { name: "Müller Sanitär", role: "handwerker", trade: "Sanitär" },
  { name: "Schmidt Elektro", role: "handwerker", trade: "Elektriker" },
  { name: "Weber Malerbetrieb", role: "handwerker", trade: "Maler" },
]);
console.log("Seed fertig");
