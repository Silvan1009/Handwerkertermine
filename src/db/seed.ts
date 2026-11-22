import { db } from "./index";
import { craftsmen } from "./schema";

await db.insert(craftsmen).values([
  { name: "Müller Sanitär", trade: "Sanitär" },
  { name: "Schmidt Elektro", trade: "Elektriker" },
  { name: "Weber Malerbetrieb", trade: "Maler" },
]);
console.log("Seed fertig");
