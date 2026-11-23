import { ctx } from "../context";
import { users } from "./schema";

await ctx.db.insert(users).values([
  { name: "Erika Kundin", email: "erika@example.com", role: "kunde", plz: "80331", ort: "München" },
  { name: "Müller Sanitär", email: "mueller@example.com", role: "handwerker", trade: "Sanitär", plz: "80335", ort: "München" },
  { name: "Schmidt Elektro", email: "schmidt@example.com", role: "handwerker", trade: "Elektriker", plz: "85221", ort: "Dachau" },
  { name: "Weber Malerbetrieb", email: "weber@example.com", role: "handwerker", trade: "Maler", plz: "10115", ort: "Berlin" },
]);
console.log("Seed fertig");
