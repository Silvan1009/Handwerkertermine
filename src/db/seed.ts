import { db } from "./index";
import { users } from "./schema";

await db.insert(users).values([
  { name: "Erika Kundin", email: "erika@example.com", role: "kunde" },
  { name: "Müller Sanitär", email: "mueller@example.com", role: "handwerker", trade: "Sanitär" },
  { name: "Schmidt Elektro", email: "schmidt@example.com", role: "handwerker", trade: "Elektriker" },
  { name: "Weber Malerbetrieb", email: "weber@example.com", role: "handwerker", trade: "Maler" },
]);
console.log("Seed fertig");
