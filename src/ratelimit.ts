import { UserError } from "./errors";

export type Limit = (key: string, max: number, windowMs: number) => void;

/**
 * Einfaches In-Memory-Limit (gleitendes Fenster). Reicht für eine Instanz; bei mehreren
 * Instanzen durch Redis o. Ä. ersetzen – die Signatur bleibt gleich.
 */
export function createLimiter(now = () => Date.now()): Limit {
  const hits = new Map<string, number[]>();
  return (key, max, windowMs) => {
    const t = now();
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.every((x) => x <= t - windowMs)) hits.delete(k);
    const recent = (hits.get(key) ?? []).filter((x) => x > t - windowMs);
    if (recent.length >= max) throw new UserError("Zu viele Versuche – bitte später erneut");
    hits.set(key, [...recent, t]);
  };
}

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;
