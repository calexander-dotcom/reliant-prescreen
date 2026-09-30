import type { Round } from "../types";
import type { GgFoursome } from "./normalize";

/**
 * Folding a fresh Golf Genius read back into a round.
 *
 * The round keeps the feed under `round.gg.scores`, by the hole numbers Golf
 * Genius counts (1..18 on the card). This takes a foursome just read from the
 * poll and returns the round with that snapshot in place — but only when it
 * actually changed, so a quiet minute of polling does not churn local storage
 * or republish the shared round. It never touches the hand-entered scores;
 * those are reconciled against this feed at read time.
 */

/** True when two score maps hold the same numbers for the same players/holes. */
export function sameScores(
  a: Record<string, Record<number, number | null>>,
  b: Record<string, Record<number, number | null>>,
): boolean {
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of ids) {
    const rowA = a[id] ?? {};
    const rowB = b[id] ?? {};
    const holes = new Set([...Object.keys(rowA), ...Object.keys(rowB)]);
    for (const hole of holes) {
      const h = Number(hole);
      if ((rowA[h] ?? null) !== (rowB[h] ?? null)) return false;
    }
  }
  return true;
}

/**
 * Merge a freshly read foursome's scores into the round.
 *
 * The feed mirrors Golf Genius: a poll reflects exactly what is there, so a
 * score added, changed or removed in Golf Genius all carry through. A failed
 * poll never reaches here — the caller skips it — so this only ever sees a real
 * reading. Returns the same round reference when nothing changed, so the caller
 * can skip a needless save. The round must already carry a `gg` tie-in (its ids
 * are how the foursome was polled); without one it is untouched.
 */
export function mergeGgFeed(round: Round, foursome: GgFoursome, now: Date = new Date()): Round {
  if (!round.gg) return round;
  if (sameScores(round.gg.scores, foursome.scores)) return round;
  return {
    ...round,
    gg: {
      ...round.gg,
      scores: foursome.scores,
      updatedAt: now.toISOString(),
    },
  };
}
