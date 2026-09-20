import { resolveStrokes, netScore, type PlayerStrokes } from "../handicap";
import { sumCents } from "../money";
import type {
  BetConfig,
  HoleInfo,
  PlayerId,
  Round,
  ScoreBasis,
  Side,
  TeeSet,
} from "../types";
import { imbalance, ledgerTotals, normalizeAmounts, zeroAmounts } from "./ledger";
import { labelledSides } from "./sides";
import { evaluateNassau, type HoleResult, type NassauOutcome } from "./nassau";
import { evaluateBanker, type BankerOutcome } from "./banker";
import { evaluateOneDown, marginsByHole, type OneDownOutcome } from "./onedown";
import { settle, settlementResidual, type Transfer } from "./settle";
import { evaluateSkins, type SkinsOutcome } from "./skins";

export * from "./ledger";
export * from "./nassau";
export * from "./onedown";
export * from "./banker";
export * from "./skins";
export * from "./settle";

/** A playable card when no course data is loaded: par 4s, stroke index in order. */
export function defaultHoles(holeCount: number): HoleInfo[] {
  return Array.from({ length: holeCount }, (_, index) => ({
    number: index + 1,
    par: 4,
    yardage: null,
    strokeIndex: index + 1,
  }));
}

export function activeTee(round: Round): TeeSet | null {
  if (!round.course) return null;
  return (
    round.course.tees.find((tee) => tee.id === round.teeId) ??
    round.course.tees[0] ??
    null
  );
}

export function roundHoles(round: Round): HoleInfo[] {
  const tee = activeTee(round);
  if (!tee || tee.holes.length === 0) return defaultHoles(round.holeCount);
  const holes = tee.holes
    .filter((hole) => hole.number <= round.holeCount)
    .sort((a, b) => a.number - b.number);
  return holes.length > 0 ? holes : defaultHoles(round.holeCount);
}

export interface ScoreCell {
  gross: number | null;
  strokes: number;
  net: number | null;
}

export type BetResult =
  | { kind: "nassau"; config: Extract<BetConfig, { kind: "nassau" }>; outcome: NassauOutcome }
  | {
      kind: "onedown";
      config: Extract<BetConfig, { kind: "onedown" }>;
      outcome: OneDownOutcome;
      /** The stack's margins after each finished hole, for the card. */
      byHole: Record<number, number[] | null>;
    }
  | {
      kind: "banker";
      config: Extract<BetConfig, { kind: "banker" }>;
      outcome: BankerOutcome;
    }
  | { kind: "skins"; config: Extract<BetConfig, { kind: "skins" }>; outcome: SkinsOutcome };

/**
 * Money by nine, everything included: hand-entered holes and every game.
 * `overall` is what belongs to the round as a whole rather than either nine —
 * the 18-hole one-down bet, a nassau's Total 18, a one-down stack run over all
 * eighteen. Front, back and overall add up to the grand total.
 */
export interface NineTotals {
  front: Record<PlayerId, number>;
  back: Record<PlayerId, number>;
  overall: Record<PlayerId, number>;
  /** Whether any game in the round has a whole-round piece worth a column. */
  hasOverall: boolean;
}

export interface RoundComputation {
  holes: HoleInfo[];
  tee: TeeSet | null;
  strokes: Record<PlayerId, PlayerStrokes>;
  cells: Record<PlayerId, Record<number, ScoreCell>>;
  /** Gross and net subtotals per player. */
  totalsByPlayer: Record<
    PlayerId,
    { grossOut: number; grossIn: number; gross: number; net: number; holesPosted: number }
  >;
  betResults: BetResult[];
  manualTotals: Record<PlayerId, number>;
  betTotals: Record<PlayerId, number>;
  grandTotals: Record<PlayerId, number>;
  nineTotals: NineTotals;
  transfers: Transfer[];
  /** Non-zero means some hole was left out of balance. */
  residual: number;
  unbalancedHoles: number[];
}

export function computeRound(round: Round): RoundComputation {
  const holes = roundHoles(round);
  const tee = activeTee(round);
  const playerIds = round.players.map((player) => player.id);

  const teeFor = (player: { teeId?: string | null }): TeeSet | null => {
    if (!round.course) return tee;
    if (player.teeId) {
      return round.course.tees.find((t) => t.id === player.teeId) ?? tee;
    }
    return tee;
  };

  const strokes = resolveStrokes(round.players, teeFor, holes, round.handicapMode);

  const cells: Record<PlayerId, Record<number, ScoreCell>> = {};
  const totalsByPlayer: RoundComputation["totalsByPlayer"] = {};

  for (const player of round.players) {
    const playerCells: Record<number, ScoreCell> = {};
    let grossOut = 0;
    let grossIn = 0;
    let net = 0;
    let holesPosted = 0;

    for (const hole of holes) {
      const gross = round.scores[player.id]?.[hole.number] ?? null;
      const holeStrokes = strokes[player.id]?.byHole[hole.number] ?? 0;
      const cellNet = netScore(gross, holeStrokes);
      playerCells[hole.number] = { gross, strokes: holeStrokes, net: cellNet };

      if (gross !== null) {
        holesPosted += 1;
        if (hole.number <= 9) grossOut += gross;
        else grossIn += gross;
        net += cellNet ?? 0;
      }
    }

    cells[player.id] = playerCells;
    totalsByPlayer[player.id] = {
      grossOut,
      grossIn,
      gross: grossOut + grossIn,
      net,
      holesPosted,
    };
  }

  const scoreFor = (basis: ScoreBasis) => (playerId: PlayerId, hole: number) => {
    const cell = cells[playerId]?.[hole];
    if (!cell) return null;
    return basis === "gross" ? cell.gross : cell.net;
  };

  const parFor = (hole: number) =>
    holes.find((entry) => entry.number === hole)?.par ?? null;

  const betResults: BetResult[] = [];
  const betTotals: Record<PlayerId, number> = Object.fromEntries(
    playerIds.map((id) => [id, 0]),
  );

  /** Hole-by-hole side-vs-side outcomes, shared by the match-play games. */
  const sideResults = (bet: Extract<BetConfig, { kind: "nassau" | "onedown" }>) => {
    const score = scoreFor(bet.basis);
    // One downs can play the first and last hole of each nine on aggregate.
    const aggregate =
      bet.kind === "onedown" && bet.aggregateBookends
        ? new Set(bookendHoles(round.holeCount))
        : null;
    const results: Record<number, HoleResult> = {};
    for (const hole of holes) {
      results[hole.number] = aggregate?.has(hole.number)
        ? holeResultAggregate(bet.sides, hole.number, score)
        : holeResultFor(bet.sides, hole.number, score);
    }
    return results;
  };

  for (const stored of round.bets) {
    // Side labels follow the players, so every screen reads the same sides
    // the money is going to.
    const bet =
      stored.kind === "nassau" || stored.kind === "onedown"
        ? { ...stored, sides: labelledSides(stored.sides, round.players) }
        : stored;
    if (bet.kind === "nassau") {
      const outcome = evaluateNassau(bet, round.holeCount, sideResults(bet), playerIds);
      betResults.push({ kind: "nassau", config: bet, outcome });
      for (const id of playerIds) betTotals[id] += outcome.totals[id] ?? 0;
    } else if (bet.kind === "banker") {
      const outcome = evaluateBanker(
        bet,
        round.holeCount,
        scoreFor(bet.basis),
        (hole) => round.manual[hole]?.amounts ?? {},
      );
      betResults.push({ kind: "banker", config: bet, outcome });
      for (const id of playerIds) betTotals[id] += outcome.totals[id] ?? 0;
    } else if (bet.kind === "onedown") {
      const results = sideResults(bet);
      const outcome = evaluateOneDown(bet, round.holeCount, results, playerIds, parFor);
      betResults.push({
        kind: "onedown",
        config: bet,
        outcome,
        byHole: marginsByHole(bet, round.holeCount, results, playerIds),
      });
      for (const id of playerIds) betTotals[id] += outcome.totals[id] ?? 0;
    } else {
      const outcome = evaluateSkins(bet, round.holeCount, scoreFor(bet.basis), parFor);
      betResults.push({ kind: "skins", config: bet, outcome });
      for (const id of playerIds) betTotals[id] += outcome.totals[id] ?? 0;
    }
  }

  const manualTotals = ledgerTotals(round.manual, playerIds, round.holeCount);

  const grandTotals: Record<PlayerId, number> = Object.fromEntries(
    playerIds.map((id) => [id, (manualTotals[id] ?? 0) + (betTotals[id] ?? 0)]),
  );

  const unbalancedHoles: number[] = [];
  for (let hole = 1; hole <= round.holeCount; hole += 1) {
    const entry = round.manual[hole];
    if (!entry) continue;
    const amounts = normalizeAmounts(entry.amounts, playerIds);
    const entered = playerIds.some((id) => amounts[id] !== 0);
    if (entered && imbalance(amounts, playerIds) !== 0) unbalancedHoles.push(hole);
  }

  return {
    holes,
    tee,
    strokes,
    cells,
    totalsByPlayer,
    betResults,
    manualTotals,
    betTotals,
    grandTotals,
    nineTotals: splitByNine(round, playerIds, betResults),
    transfers: settle(grandTotals),
    residual: settlementResidual(grandTotals),
    unbalancedHoles,
  };
}

/**
 * The grand total again, but by nine. Each source already knows where its
 * money came from: the ledger by hole, skins and a scored banker by hole, a
 * nassau by segment, one downs by stack. Anything spanning both nines is the
 * round's, not either nine's.
 */
function splitByNine(
  round: Round,
  playerIds: PlayerId[],
  betResults: BetResult[],
): NineTotals {
  const holeCount = round.holeCount;
  const frontEnd = Math.min(9, holeCount);
  const front = ledgerTotals(round.manual, playerIds, holeCount, { to: frontEnd });
  const back = ledgerTotals(round.manual, playerIds, holeCount, { from: frontEnd + 1 });
  const overall = zeroAmounts(playerIds);
  let hasOverall = false;

  const add = (into: Record<PlayerId, number>, amounts: Record<PlayerId, number>) => {
    for (const id of playerIds) into[id] += amounts[id] ?? 0;
  };
  const bucketFor = (startHole: number, endHole: number) =>
    endHole <= frontEnd ? front : startHole > frontEnd ? back : overall;

  for (const result of betResults) {
    if (result.kind === "nassau") {
      for (const [segmentId, amounts] of Object.entries(result.outcome.segmentTotals)) {
        add(segmentId === "back" ? back : segmentId === "total" ? overall : front, amounts);
      }
      if (result.outcome.matches.some((match) => match.segmentId === "total")) {
        hasOverall = true;
      }
    } else if (result.kind === "onedown") {
      for (const stack of result.outcome.stacks) {
        add(bucketFor(stack.startHole, stack.endHole), stack.playerTotals);
        if (stack.startHole <= frontEnd && stack.endHole > frontEnd) hasOverall = true;
      }
      add(overall, result.outcome.overallTotals);
      if (result.outcome.overall) hasOverall = true;
      // A greenie belongs to its hole's nine; the sweep bonus to the round.
      for (const greenie of result.outcome.greenies.holes) {
        add(bucketFor(greenie.hole, greenie.hole), greenie.amounts);
      }
      add(overall, result.outcome.greenies.sweepBonus);
      if (result.outcome.greenies.sweptBy !== null) hasOverall = true;
    } else if (result.kind === "skins") {
      for (const hole of result.outcome.holes) {
        add(bucketFor(hole.hole, hole.hole), hole.amounts);
      }
    } else if (result.outcome.tracksMoney) {
      for (const hole of result.outcome.holes) {
        add(bucketFor(hole.hole, hole.hole), hole.amounts);
      }
    }
  }

  return { front, back, overall, hasOverall };
}

/** Best ball for the side, then compare. null when either side has no score. */
export function holeResultFor(
  sides: [Side, Side],
  hole: number,
  score: (playerId: PlayerId, hole: number) => number | null,
): HoleResult {
  const best = (side: Side): number | null => {
    const values = side.playerIds
      .map((id) => score(id, hole))
      .filter((value): value is number => value !== null);
    return values.length > 0 ? Math.min(...values) : null;
  };

  const a = best(sides[0]);
  const b = best(sides[1]);
  if (a === null || b === null) return null;
  if (a < b) return 1;
  if (b < a) return -1;
  return 0;
}

/** The first and last hole of each nine: 1, 9, 10 and 18 on a full card. */
export function bookendHoles(holeCount: number): number[] {
  if (holeCount <= 9) return [1, holeCount];
  return [1, 9, 10, holeCount];
}

/**
 * Aggregate: each side's scores added together, lower total wins. Needs every
 * score on both sides, since one missing partner is not a total. Sides of
 * different sizes fall back to best ball — two scores against one is not a
 * contest.
 */
export function holeResultAggregate(
  sides: [Side, Side],
  hole: number,
  score: (playerId: PlayerId, hole: number) => number | null,
): HoleResult {
  if (sides[0].playerIds.length !== sides[1].playerIds.length) {
    return holeResultFor(sides, hole, score);
  }
  const total = (side: Side): number | null => {
    if (side.playerIds.length === 0) return null;
    let sum = 0;
    for (const id of side.playerIds) {
      const value = score(id, hole);
      if (value === null) return null;
      sum += value;
    }
    return sum;
  };

  const a = total(sides[0]);
  const b = total(sides[1]);
  if (a === null || b === null) return null;
  if (a < b) return 1;
  if (b < a) return -1;
  return 0;
}

/** Sanity check used by the UI: every engine must move money zero-sum. */
export function totalsAreZeroSum(totals: Record<PlayerId, number>): boolean {
  return sumCents(Object.values(totals)) === 0;
}
