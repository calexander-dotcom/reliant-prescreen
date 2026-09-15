import type { BankerConfig, PlayerId } from "../types";

/**
 * Banker.
 *
 * One player holds the deal for a hole and plays a separate bet against each
 * other player in the game. Beat somebody and they pay the stake; lose to them
 * and the banker pays it. Ties are nothing. So the banker is in every bet on
 * the hole, which is what makes the deal worth having and worth losing.
 *
 * Any opponent can double their own bet for the hole, and the banker can double
 * back against that one player — the multiplier is per opponent, so one player
 * can be on for 4x while the rest are flat.
 *
 * The deal then passes to whoever won the most money on the hole. A banker who
 * is winning tends to keep it, since the banker is in every bet.
 */

export interface BankerBet {
  playerId: PlayerId;
  multiplier: number;
  /** Money to this player for this bet: positive means they collected. */
  delta: number;
  /** Their score on the hole under the chosen basis. */
  score: number | null;
}

export interface BankerHole {
  hole: number;
  bankerId: PlayerId | null;
  /** Every player in the game has a score, so the hole can be settled. */
  settled: boolean;
  bankerScore: number | null;
  bets: BankerBet[];
  /** Money for every player on this hole. Sums to zero. */
  amounts: Record<PlayerId, number>;
  /** Why this player holds the deal. */
  bankerFrom: "first" | "rotation" | "override";
}

export interface BankerOutcome {
  holes: BankerHole[];
  /**
   * Money this bet is responsible for.
   *
   * Zero throughout in "manual" mode: the amounts shown per hole came from the
   * hole ledger, which already counts them, so reporting them here as well
   * would pay everybody twice.
   */
  totals: Record<PlayerId, number>;
  /** False in "manual" mode, where this bet only tracks the deal. */
  tracksMoney: boolean;
  /** Who holds the deal on the next unplayed hole. */
  nextBankerId: PlayerId | null;
  /** How many holes each player banked. */
  bankedCount: Record<PlayerId, number>;
}

/** The stake multiplier in force for one opponent on one hole. */
export function multiplierFor(
  config: BankerConfig,
  hole: number,
  playerId: PlayerId,
): number {
  const raw = config.doubles?.[hole]?.[playerId];
  if (!Number.isFinite(raw) || !raw || raw < 1) return 1;
  // Doubling is a power of two: flat, doubled, doubled back.
  return Math.min(16, Math.max(1, Math.floor(raw)));
}

/**
 * Who takes the deal next.
 *
 * "most-money" is the house rule: the biggest winner on the hole banks the
 * next one. A banker still top of the pile keeps it, and a hole where nobody
 * won anything leaves the deal where it is — both of which fall out of
 * preferring the current banker when the lead is shared.
 */
function nextBanker(
  rotation: BankerConfig["rotation"],
  playerIds: PlayerId[],
  current: PlayerId,
  hole: BankerHole,
): PlayerId {
  if (rotation === "manual") return current;
  if (!hole.settled) return current;

  if (rotation === "order") {
    const index = playerIds.indexOf(current);
    return playerIds[(index + 1) % playerIds.length] ?? current;
  }

  if (rotation === "hole-winner") {
    const scored = playerIds
      .map((id) => ({ id, score: hole.bets.find((bet) => bet.playerId === id)?.score ?? hole.bankerScore }))
      .filter((entry): entry is { id: PlayerId; score: number } => entry.score !== null);
    if (scored.length === 0) return current;
    const low = Math.min(...scored.map((entry) => entry.score));
    const leaders = scored.filter((entry) => entry.score === low).map((entry) => entry.id);
    return leaders.includes(current) ? current : (leaders[0] ?? current);
  }

  const best = Math.max(...playerIds.map((id) => hole.amounts[id] ?? 0));
  const leaders = playerIds.filter((id) => (hole.amounts[id] ?? 0) === best);
  return leaders.includes(current) ? current : (leaders[0] ?? current);
}

export function evaluateBanker(
  config: BankerConfig,
  holeCount: number,
  scoreFor: (playerId: PlayerId, hole: number) => number | null,
  /** Hand-entered money for a hole, used when source is "manual". */
  manualFor: (hole: number) => Record<PlayerId, number> = () => ({}),
): BankerOutcome {
  const playerIds = config.playerIds;
  const totals: Record<PlayerId, number> = Object.fromEntries(
    playerIds.map((id) => [id, 0]),
  );
  const bankedCount: Record<PlayerId, number> = Object.fromEntries(
    playerIds.map((id) => [id, 0]),
  );
  const holes: BankerHole[] = [];

  const fromScores = config.source !== "manual";

  if (playerIds.length < 2) {
    return {
      holes,
      totals,
      tracksMoney: fromScores,
      nextBankerId: null,
      bankedCount,
    };
  }

  let banker = config.firstBankerId && playerIds.includes(config.firstBankerId)
    ? config.firstBankerId
    : playerIds[0];
  let bankerFrom: BankerHole["bankerFrom"] = "first";

  for (let hole = 1; hole <= holeCount; hole += 1) {
    const override = config.bankerByHole?.[hole];
    if (override && playerIds.includes(override)) {
      banker = override;
      bankerFrom = "override";
    }

    const opponents = playerIds.filter((id) => id !== banker);
    const bankerScore = scoreFor(banker, hole);
    const amounts: Record<PlayerId, number> = Object.fromEntries(
      playerIds.map((id) => [id, 0]),
    );

    const bets: BankerBet[] = opponents.map((playerId) => ({
      playerId,
      multiplier: multiplierFor(config, hole, playerId),
      delta: 0,
      score: scoreFor(playerId, hole),
    }));

    let settled = false;

    if (fromScores) {
      // Settle only once everybody has posted, so a hole in progress moves nothing.
      settled = bankerScore !== null && bets.every((bet) => bet.score !== null);

      if (settled) {
        for (const bet of bets) {
          const stake = config.amount * bet.multiplier;
          if (bet.score === null) continue;
          if (bet.score < (bankerScore as number)) {
            bet.delta = stake;
            amounts[bet.playerId] += stake;
            amounts[banker] -= stake;
          } else if (bet.score > (bankerScore as number)) {
            bet.delta = -stake;
            amounts[bet.playerId] -= stake;
            amounts[banker] += stake;
          }
        }
        bankedCount[banker] += 1;
        for (const id of playerIds) totals[id] += amounts[id];
      }
    } else {
      /*
       * Manual mode: the hole's money was typed into the ledger. Read it for
       * display and to pass the deal, but leave `totals` alone — the ledger
       * already accounts for it.
       */
      const entered = manualFor(hole);
      let anyEntered = false;
      let sum = 0;
      for (const id of playerIds) {
        const value = entered[id] ?? 0;
        amounts[id] = value;
        if (value !== 0) anyEntered = true;
        sum += value;
      }
      // An out-of-balance hole is not a result yet, so the deal stays put.
      settled = anyEntered && sum === 0;
      if (settled) bankedCount[banker] += 1;
      for (const bet of bets) bet.delta = amounts[bet.playerId] ?? 0;
    }

    const record: BankerHole = {
      hole,
      bankerId: banker,
      settled,
      bankerScore,
      bets,
      amounts,
      bankerFrom,
    };
    holes.push(record);

    banker = nextBanker(config.rotation, playerIds, banker, record);
    bankerFrom = "rotation";
  }

  // The deal on the first hole nobody has finished yet.
  const nextHole = holes.find((hole) => !hole.settled);

  return {
    holes,
    totals,
    tracksMoney: fromScores,
    nextBankerId: nextHole?.bankerId ?? banker,
    bankedCount,
  };
}
