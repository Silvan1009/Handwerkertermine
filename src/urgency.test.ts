import { expect, it } from "vitest";
import type { Rating } from "./db/schema";
import { scoreOf } from "./urgency";

const n = (r: Rating, k: number): Rating[] => Array(k).fill(r);

it.each<[string, Rating[], number, boolean]>([
  ["Neukunde", [], 3, false],
  ["ein 👎 wird verziehen", ["schlecht"], 1, false],
  ["zwei 👎 sperren", n("schlecht", 2), -1, true],
  ["ein ❌ sperrt", ["katastrophe"], -2, true],
  ["❌ nach zwei 👍 wieder frei", ["gut", "gut", "katastrophe"], 0, false],
  ["gute Historie fängt ein ❌ ab", ["katastrophe", ...n("gut", 5)], 3, false],
  ["nur die letzten 10 zählen", [...n("gut", 10), "katastrophe"], 13, false],
  ["Dauer-Übertreiber", ["gut", "schlecht", "gut", "schlecht", "gut", "schlecht", "gut", "schlecht"], -1, true],
])("%s", (_, ratings, score, locked) => {
  expect(scoreOf(ratings)).toEqual({ score, locked });
});
