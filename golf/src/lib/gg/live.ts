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
 * Fold a fresh feed into the one held, letting it add or correct a hole but
 * never blank one out. Golf Genius scores only ever firm up during a round, so
 * a poll that comes back thin or empty — a dummy round, a momentary blip — must
 * not erase a score that was already showing. A real new number (including a
 * correction) always wins; only a drop to nothing is ignored.
 */
export function stickyMerge(
  held: Record<string, Record<number, number | null>>,
  fresh: Record<string, Record<number, number | null>>,
): Record<string, Record<number, number | null>> {
  const ids = new Set([...Object.keys(held), ...Object.keys(fresh)]);
  const out: Record<string, Record<number, number | null>> = {};
  for (const id of ids) {
    const heldRow = held[id] ?? {};
    const freshRow = fresh[id] ?? {};
    const row: Record<number, number | null> = {};
    const holes = new Set([...Object.keys(heldRow), ...Object.keys(freshRow)]);
    for (const hole of holes) {
      const h = Number(hole);
      const next = freshRow[h] ?? null;
      const prev = heldRow[h] ?? null;
      const value = next !== null ? next : prev;
      if (value !== null) row[h] = value;
    }
    out[id] = row;
  }
  return out;
}

/**
 * Merge a freshly read foursome's scores into the round.
 *
 * Returns the same round reference when nothing changed, so the caller can skip
 * a needless save. The feed can add or correct a score but never erase one it
 * had already shown (see `stickyMerge`). The round must already carry a `gg`
 * tie-in (its ids are how the foursome was polled); without one it is untouched.
 */
export function mergeGgFeed(round: Round, foursome: GgFoursome, now: Date = new Date()): Round {
  if (!round.gg) return round;
  const merged = stickyMerge(round.gg.scores, foursome.scores);
  if (sameScores(round.gg.scores, merged)) return round;
  return {
    ...round,
    gg: {
      ...round.gg,
      scores: merged,
      updatedAt: now.toISOString(),
    },
  };
}
