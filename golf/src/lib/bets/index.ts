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
import { imbalance, ledgerTotals, normalizeAmounts } from "./ledger";
import { evaluateNassau, type HoleResult, type NassauOutcome } from "./nassau";
import { evaluateBanker, type BankerOutcome } from "./banker";
import { evaluateOneDown, type OneDownOutcome } from "./onedown";
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
    }
  | {
      kind: "banker";
      config: Extract<BetConfig, { kind: "banker" }>;
      outcome: BankerOutcome;
    }
  | { kind: "skins"; config: Extract<BetConfig, { kind: "skins" }>; outcome: SkinsOutcome };

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
    const results: Record<number, HoleResult> = {};
    for (const hole of holes) {
      results[hole.number] = holeResultFor(bet.sides, hole.number, score);
    }
    return results;
  };

  for (const bet of round.bets) {
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
      const outcome = evaluateOneDown(bet, round.holeCount, sideResults(bet), playerIds);
      betResults.push({ kind: "onedown", config: bet, outcome });
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
    transfers: settle(grandTotals),
    residual: settlementResidual(grandTotals),
    unbalancedHoles,
  };
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

/** Sanity check used by the UI: every engine must move money zero-sum. */
export function totalsAreZeroSum(totals: Record<PlayerId, number>): boolean {
  return sumCents(Object.values(totals)) === 0;
}
