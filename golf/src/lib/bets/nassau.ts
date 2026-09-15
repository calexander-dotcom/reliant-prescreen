import { distributeCents } from "../money";
import type { NassauConfig, PlayerId, Side } from "../types";

/** 1 = side A won the hole, -1 = side B, 0 = halved, null = not played yet. */
export type HoleResult = 1 | -1 | 0 | null;

export interface Segment {
  id: string;
  label: string;
  startHole: number;
  endHole: number;
}

export interface NassauMatch {
  id: string;
  label: string;
  segmentId: string;
  startHole: number;
  endHole: number;
  amount: number;
  /** 0 for the original bet, 1 for its press, 2 for the press on the press. */
  depth: number;
  parentId: string | null;
  /** Hole after which this press opened. */
  triggeredAfterHole: number | null;
  /** Side A holes won minus side B holes won, across played holes. */
  diff: number;
  holesPlayed: number;
  holesRemaining: number;
  status: "in-progress" | "won-a" | "won-b" | "halved";
}

/**
 * Front / back / total. A nine-hole round collapses to a single segment, since
 * "front", "back" and "total" would otherwise be the same nine holes.
 */
export function buildSegments(holeCount: number, includeTotal: boolean): Segment[] {
  if (holeCount <= 9) {
    return [{ id: "front", label: "Nine", startHole: 1, endHole: holeCount }];
  }
  const segments: Segment[] = [
    { id: "front", label: "Front 9", startHole: 1, endHole: 9 },
    { id: "back", label: "Back 9", startHole: 10, endHole: holeCount },
  ];
  if (includeTotal) {
    segments.push({ id: "total", label: "Total 18", startHole: 1, endHole: holeCount });
  }
  return segments;
}

/**
 * Work out one segment and every press hanging off it.
 *
 * An automatic press is simply a brand new bet over the remaining holes of the
 * segment, opened the moment a side falls `autoPressAt` holes behind. The
 * original bet keeps running. A press can itself be pressed, which is why this
 * walks a queue instead of a single pass: each match may spawn one child, and
 * the chain is capped by `maxPresses` per segment.
 */
export function evaluateSegment(
  segment: Segment,
  config: Pick<NassauConfig, "amount" | "autoPressAt" | "maxPresses">,
  results: Record<number, HoleResult>,
): NassauMatch[] {
  const out: NassauMatch[] = [];
  let pressesSpawned = 0;

  type Pending = Omit<
    NassauMatch,
    "diff" | "holesPlayed" | "holesRemaining" | "status" | "amount"
  >;

  const queue: Pending[] = [
    {
      id: segment.id,
      label: segment.label,
      segmentId: segment.id,
      startHole: segment.startHole,
      endHole: segment.endHole,
      depth: 0,
      parentId: null,
      triggeredAfterHole: null,
    },
  ];

  while (queue.length > 0) {
    const match = queue.shift() as Pending;

    let diff = 0;
    let holesPlayed = 0;
    let pressHole: number | null = null;

    for (let hole = match.startHole; hole <= match.endHole; hole += 1) {
      const result = results[hole];
      if (result === null || result === undefined) continue;
      holesPlayed += 1;
      diff += result;

      const canPress =
        pressHole === null &&
        config.autoPressAt > 0 &&
        Math.abs(diff) >= config.autoPressAt &&
        hole < match.endHole;
      if (canPress) pressHole = hole;
    }

    const holesInMatch = match.endHole - match.startHole + 1;
    const holesRemaining = holesInMatch - holesPlayed;

    let status: NassauMatch["status"];
    if (holesRemaining === 0) {
      status = diff > 0 ? "won-a" : diff < 0 ? "won-b" : "halved";
    } else if (Math.abs(diff) > holesRemaining) {
      // Closed out: the lead is bigger than the holes left to play.
      status = diff > 0 ? "won-a" : "won-b";
    } else {
      status = "in-progress";
    }

    out.push({
      ...match,
      amount: config.amount,
      diff,
      holesPlayed,
      holesRemaining,
      status,
    });

    if (pressHole !== null && pressesSpawned < config.maxPresses) {
      pressesSpawned += 1;
      queue.push({
        id: `${match.id}-press${pressesSpawned}`,
        label: `${segment.label} press ${pressesSpawned}`,
        segmentId: segment.id,
        startHole: pressHole + 1,
        endHole: match.endHole,
        depth: match.depth + 1,
        parentId: match.id,
        triggeredAfterHole: pressHole,
      });
    }
  }

  return out;
}

/**
 * Money a single decided match moves, keyed by player.
 *
 * Takes just the outcome and the stake, so every bet type that resolves to
 * "one side beat the other for this much" shares the same payout rules.
 */
export function matchPayout(
  match: { status: NassauMatch["status"]; amount: number },
  sides: [Side, Side],
  stakeMode: NassauConfig["stakeMode"],
  playerIds: PlayerId[],
): Record<PlayerId, number> {
  const zero = Object.fromEntries(playerIds.map((id) => [id, 0]));
  if (match.status === "in-progress" || match.status === "halved") return zero;

  const [sideA, sideB] = sides;
  const winners = (match.status === "won-a" ? sideA : sideB).playerIds.filter((id) =>
    playerIds.includes(id),
  );
  const losers = (match.status === "won-a" ? sideB : sideA).playerIds.filter((id) =>
    playerIds.includes(id),
  );
  if (winners.length === 0 || losers.length === 0) return zero;

  // Per player, everyone on the losing side is in for the stake and everyone
  // on the winning side collects it: a team of two that is seven bets up is
  // up $70 each, which is how the group says it. Uneven sides settle on the
  // larger side's count, so a lone player against two is in for double — the
  // single is playing both of them. Per side, one stake changes hands and
  // each side splits its share.
  const pot =
    stakeMode === "per-player"
      ? match.amount * Math.max(winners.length, losers.length)
      : match.amount;

  const totals = { ...zero };
  const winnerShares = distributeCents(pot, winners.length);
  const loserShares = distributeCents(pot, losers.length);
  winners.forEach((id, index) => {
    totals[id] += winnerShares[index];
  });
  losers.forEach((id, index) => {
    totals[id] -= loserShares[index];
  });
  return totals;
}

/**
 * A side's money as it gets said: per player, a pair that is up $140 between
 * them is "up $70 each"; per side, or for a side of one, it is the figure.
 */
export function sideUp(
  sideCents: number,
  side: Side,
  stakeMode: NassauConfig["stakeMode"],
): { cents: number; each: boolean } {
  const heads = side.playerIds.length;
  if (stakeMode === "per-player" && heads > 1) {
    return { cents: Math.round(sideCents / heads), each: true };
  }
  return { cents: sideCents, each: false };
}

export interface NassauOutcome {
  matches: NassauMatch[];
  /** Per-player money from this bet, in cents. Sums to zero. */
  totals: Record<PlayerId, number>;
  /**
   * The same money by segment id — front, back, total — presses included in
   * the segment they hang off, so each nine can be reported on its own.
   */
  segmentTotals: Record<string, Record<PlayerId, number>>;
  results: Record<number, HoleResult>;
}

export function evaluateNassau(
  config: NassauConfig,
  holeCount: number,
  results: Record<number, HoleResult>,
  playerIds: PlayerId[],
): NassauOutcome {
  const segments = buildSegments(holeCount, config.includeTotal);
  const matches: NassauMatch[] = [];
  for (const segment of segments) {
    matches.push(...evaluateSegment(segment, config, results));
  }

  const totals = Object.fromEntries(playerIds.map((id) => [id, 0]));
  const segmentTotals: Record<string, Record<PlayerId, number>> = {};
  for (const segment of segments) {
    segmentTotals[segment.id] = Object.fromEntries(playerIds.map((id) => [id, 0]));
  }
  for (const match of matches) {
    const payout = matchPayout(match, config.sides, config.stakeMode, playerIds);
    for (const id of playerIds) {
      totals[id] += payout[id] ?? 0;
      segmentTotals[match.segmentId][id] += payout[id] ?? 0;
    }
  }

  return { matches, totals, segmentTotals, results };
}

/** Human-readable standing, e.g. "Team A 2 up thru 7" or "Team B wins". */
export function matchStanding(match: NassauMatch, sides: [Side, Side]): string {
  const [sideA, sideB] = sides;
  if (match.status === "won-a") return `${sideA.name} wins`;
  if (match.status === "won-b") return `${sideB.name} wins`;
  if (match.status === "halved") return "Halved";
  if (match.holesPlayed === 0) return "Not started";
  if (match.diff === 0) return `All square thru ${match.holesPlayed}`;
  const leader = match.diff > 0 ? sideA.name : sideB.name;
  return `${leader} ${Math.abs(match.diff)} up thru ${match.holesPlayed}`;
}
