import type { PlayerId, SkinsConfig } from "../types";

export interface SkinHole {
  hole: number;
  /** True once every player in the game has a score posted for the hole. */
  settled: boolean;
  /** How many holes of value are riding on this hole (1 = no carryover). */
  holesAtStake: number;
  /** What each losing player owes if the skin is won here, in cents. */
  valuePerLoser: number;
  winnerId: PlayerId | null;
  /** Low score was shared, so nobody claimed it. */
  tied: boolean;
  /** Low score was unique but failed the birdie requirement. */
  notValidated: boolean;
  lowScore: number | null;
}

export interface SkinsOutcome {
  holes: SkinHole[];
  totals: Record<PlayerId, number>;
  /** Holes of value still riding after the last settled hole. */
  carryingHoles: number;
}

/**
 * Skins: low score on the hole takes the skin. Ties carry the value forward.
 *
 * A hole only settles once every player in the game has a score posted, so a
 * round in progress never charges someone for a hole they have not played. If a
 * player picks up, enter their max score rather than leaving the cell blank.
 */
export function evaluateSkins(
  config: SkinsConfig,
  holeCount: number,
  scoreFor: (playerId: PlayerId, hole: number) => number | null,
  parFor: (hole: number) => number | null,
): SkinsOutcome {
  const playerIds = config.playerIds;
  const totals: Record<PlayerId, number> = Object.fromEntries(
    playerIds.map((id) => [id, 0]),
  );
  const holes: SkinHole[] = [];

  let holesAtStake = 1;

  for (let hole = 1; hole <= holeCount; hole += 1) {
    const scores = playerIds.map((id) => ({ id, score: scoreFor(id, hole) }));
    const allPosted =
      playerIds.length >= 2 && scores.every((entry) => entry.score !== null);

    if (!allPosted) {
      holes.push({
        hole,
        settled: false,
        holesAtStake,
        valuePerLoser: holesAtStake * config.amount,
        winnerId: null,
        tied: false,
        notValidated: false,
        lowScore: null,
      });
      continue;
    }

    const lowScore = Math.min(...scores.map((entry) => entry.score as number));
    const leaders = scores.filter((entry) => entry.score === lowScore);
    const tied = leaders.length > 1;

    const par = parFor(hole);
    const validated =
      !config.requireBirdie || (par !== null && lowScore < par);
    const notValidated = !tied && !validated;

    let winnerId: PlayerId | null = null;
    const stakeHoles = holesAtStake;
    const valuePerLoser = stakeHoles * config.amount;

    if (!tied && validated) {
      winnerId = leaders[0].id;
      const losers = playerIds.filter((id) => id !== winnerId);
      totals[winnerId] += valuePerLoser * losers.length;
      for (const id of losers) totals[id] -= valuePerLoser;
      holesAtStake = 1;
    } else if (config.carryOver) {
      holesAtStake += 1;
    } else {
      holesAtStake = 1;
    }

    holes.push({
      hole,
      settled: true,
      holesAtStake: stakeHoles,
      valuePerLoser,
      winnerId,
      tied,
      notValidated,
      lowScore,
    });
  }

  return { holes, totals, carryingHoles: holesAtStake };
}
