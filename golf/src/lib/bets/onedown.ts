import type { OneDownConfig, PlayerId, Side } from "../types";
import { matchPayout, type HoleResult } from "./nassau";

/**
 * The "one down" game.
 *
 * One bet is running at the start of a nine. After every hole the NEWEST bet is
 * checked: if either side is down in it, a fresh bet opens covering the next
 * hole to the end of that nine. So a side that keeps losing keeps handing over
 * new bets. A hole that leaves the newest bet all square opens nothing — which
 * is the moment a side presses by hand instead. At most one new bet opens per
 * hole, which is what makes the standing read as one number per hole played:
 *
 *     3-2-1-1-0        four bets to side A, one just opened at level
 *     2-1-0-0-(-1)-0   side B leads the fifth bet
 *
 * Each bet pays its stake to whoever leads it right now — ahead by one pays the
 * same as ahead by five, and a square bet pays nothing. So the second standing
 * above, at $10 a bet, is two bets to A and one to B: A up $10.
 *
 * The stack ends at the turn and a new one starts on the 10th. Alongside the
 * two stacks sits a single bet over all 18 at a multiple of the stake, which
 * never presses.
 */

export interface OneDownBet {
  /** 1-based order in which this bet opened, within its stack. */
  index: number;
  startHole: number;
  endHole: number;
  amount: number;
  /** Side A holes won minus side B holes won, within this bet's range. */
  margin: number;
  holesPlayed: number;
  holesRemaining: number;
  /**
   * Display only — whether this bet can still change hands. The money follows
   * `margin`, because a bet pays whoever leads it as the round goes along.
   */
  status: "in-progress" | "won-a" | "won-b" | "halved";
  openedBy: "start" | "auto" | "manual" | "overall";
}

export interface OneDownStack {
  label: string;
  startHole: number;
  endHole: number;
  bets: OneDownBet[];
  /** Margins oldest-first, as the standing is written on the card. */
  standing: string;
  led: { a: number; b: number; square: number };
  /** What each side is up within this stack, in cents. */
  sideTotals: [number, number];
  /** The same money per player, so a nine can be reported on its own. */
  playerTotals: Record<PlayerId, number>;
}

export interface OneDownOutcome {
  stacks: OneDownStack[];
  /** The 18-hole bet at a multiple of the stake. Never presses. */
  overall: OneDownBet | null;
  overallSideTotals: [number, number];
  /** Per-player money from the 18-hole bet alone; zeros without one. */
  overallTotals: Record<PlayerId, number>;
  /** Every stack bet, flattened. Excludes the overall bet. */
  bets: OneDownBet[];
  /** The stack currently being played — what you want on screen. */
  current: OneDownStack | null;
  /** Shorthand for `current.standing`. */
  standing: string;
  /** Shorthand for `current.led`. */
  led: { a: number; b: number; square: number };
  /** Every stack together, excluding the overall bet. */
  stackSideTotals: [number, number];
  /** Everything, stacks and the overall bet. Sums to zero. */
  sideTotals: [number, number];
  totals: Record<PlayerId, number>;
}

/**
 * Hole ranges the stacks run over. The bet ends at the turn, so the front and
 * back are separate games; a nine-hole round is just the one.
 */
function stackRanges(
  holeCount: number,
  reset: OneDownConfig["reset"],
): Array<{ label: string; startHole: number; endHole: number }> {
  if (holeCount <= 9) {
    return [{ label: "Nine", startHole: 1, endHole: holeCount }];
  }
  if (reset === "round") {
    return [{ label: "Round", startHole: 1, endHole: holeCount }];
  }
  return [
    { label: "Front 9", startHole: 1, endHole: 9 },
    { label: "Back 9", startHole: 10, endHole: holeCount },
  ];
}

function statusFor(margin: number, holesRemaining: number): OneDownBet["status"] {
  if (holesRemaining === 0) {
    return margin > 0 ? "won-a" : margin < 0 ? "won-b" : "halved";
  }
  // Closed out: the lead is bigger than the holes left in this bet.
  if (Math.abs(margin) > holesRemaining) return margin > 0 ? "won-a" : "won-b";
  return "in-progress";
}

/**
 * Write the standing the way it gets said out loud: one margin per open bet,
 * oldest first, signed from side A. A bet that side B leads is parenthesised,
 * both because that is the convention and because `0--1` is unreadable.
 */
/**
 * How many bets were opened by hand after each hole.
 *
 * Tolerates the older shape, a bare list of holes, so rounds saved before
 * presses could be stacked still load.
 */
export function pressCounts(
  presses: Record<number, number> | number[] | null | undefined,
): Map<number, number> {
  const counts = new Map<number, number>();
  if (!presses) return counts;

  if (Array.isArray(presses)) {
    for (const hole of presses) {
      counts.set(hole, (counts.get(hole) ?? 0) + 1);
    }
    return counts;
  }

  for (const [hole, count] of Object.entries(presses)) {
    const holeNumber = Number(hole);
    const value = Number(count);
    if (Number.isFinite(holeNumber) && Number.isFinite(value) && value > 0) {
      counts.set(holeNumber, Math.floor(value));
    }
  }
  return counts;
}

export function formatStanding(margins: number[]): string {
  return margins
    .map((margin) => (margin < 0 ? `(${margin})` : String(margin)))
    .join("-");
}

export function evaluateOneDown(
  config: OneDownConfig,
  holeCount: number,
  results: Record<number, HoleResult>,
  playerIds: PlayerId[],
): OneDownOutcome {
  const manual = pressCounts(config.manualPresses);

  const marginFrom = (from: number, to: number) => {
    let total = 0;
    for (let hole = from; hole <= to; hole += 1) {
      const result = results[hole];
      if (result === null || result === undefined) continue;
      total += result;
    }
    return total;
  };

  const holesPlayedIn = (from: number, to: number) => {
    let played = 0;
    for (let hole = from; hole <= to; hole += 1) {
      const result = results[hole];
      if (result !== null && result !== undefined) played += 1;
    }
    return played;
  };

  const totals: Record<PlayerId, number> = Object.fromEntries(
    playerIds.map((id) => [id, 0]),
  );

  /** A bet pays its stake to whoever is ahead in it right now. */
  const applyPayout = (bet: OneDownBet) => {
    if (bet.margin === 0) return;
    const payout = matchPayout(
      { status: bet.margin > 0 ? "won-a" : "won-b", amount: bet.amount },
      config.sides,
      config.stakeMode,
      playerIds,
    );
    for (const id of playerIds) totals[id] += payout[id] ?? 0;
  };

  const sideSum = (side: Side, source: Record<PlayerId, number>) =>
    side.playerIds.reduce((sum, id) => sum + (source[id] ?? 0), 0);

  /** Money from just these bets, per player, so a stack can be reported on its own. */
  const payoutsFor = (bets: OneDownBet[]): Record<PlayerId, number> => {
    const scratch: Record<PlayerId, number> = Object.fromEntries(
      playerIds.map((id) => [id, 0]),
    );
    for (const bet of bets) {
      if (bet.margin === 0) continue;
      const payout = matchPayout(
        { status: bet.margin > 0 ? "won-a" : "won-b", amount: bet.amount },
        config.sides,
        config.stakeMode,
        playerIds,
      );
      for (const id of playerIds) scratch[id] += payout[id] ?? 0;
    }
    return scratch;
  };

  const sideTotalsOf = (source: Record<PlayerId, number>): [number, number] => [
    sideSum(config.sides[0], source),
    sideSum(config.sides[1], source),
  ];

  const stacks: OneDownStack[] = [];

  for (const range of stackRanges(holeCount, config.reset)) {
    const opened: Array<{ startHole: number; openedBy: OneDownBet["openedBy"] }> = [
      { startHole: range.startHole, openedBy: "start" },
    ];

    for (let hole = range.startHole; hole <= range.endHole; hole += 1) {
      const result = results[hole];
      // Stop opening bets once the card runs out; the round is not there yet.
      if (result === null || result === undefined) break;
      // Nothing left for a new bet to cover.
      if (hole >= range.endHole) break;

      const newest = opened[opened.length - 1];
      const newestMargin = marginFrom(newest.startHole, hole);

      const autoPress =
        config.autoPressAt > 0 && Math.abs(newestMargin) >= config.autoPressAt;
      const handPresses = manual.get(hole) ?? 0;

      /*
       * The automatic bet and any presses called by hand all open here, each a
       * separate bet over the same remaining holes. Two presses on one hole is
       * two bets riding on the same golf, which is the point of calling them.
       */
      const opening = (autoPress ? 1 : 0) + handPresses;
      for (let i = 0; i < opening; i += 1) {
        opened.push({
          startHole: hole + 1,
          openedBy: i === 0 && autoPress ? "auto" : "manual",
        });
      }
    }

    const bets: OneDownBet[] = opened.map((entry, index) => {
      const holesInBet = range.endHole - entry.startHole + 1;
      const holesPlayed = holesPlayedIn(entry.startHole, range.endHole);
      const margin = marginFrom(entry.startHole, range.endHole);
      return {
        index: index + 1,
        startHole: entry.startHole,
        endHole: range.endHole,
        amount: config.amount,
        margin,
        holesPlayed,
        holesRemaining: holesInBet - holesPlayed,
        status: statusFor(margin, holesInBet - holesPlayed),
        openedBy: entry.openedBy,
      };
    });

    for (const bet of bets) applyPayout(bet);

    const led = { a: 0, b: 0, square: 0 };
    for (const bet of bets) {
      if (bet.margin === 0) led.square += 1;
      else if (bet.margin > 0) led.a += 1;
      else led.b += 1;
    }

    const playerTotals = payoutsFor(bets);
    stacks.push({
      label: range.label,
      startHole: range.startHole,
      endHole: range.endHole,
      bets,
      standing: formatStanding(bets.map((bet) => bet.margin)),
      led,
      sideTotals: sideTotalsOf(playerTotals),
      playerTotals,
    });
  }

  // The 18-hole bet: one match, no presses, at a multiple of the stake.
  let overall: OneDownBet | null = null;
  if (config.overallMultiplier > 0 && holeCount > 9) {
    const holesPlayed = holesPlayedIn(1, holeCount);
    const margin = marginFrom(1, holeCount);
    overall = {
      index: 1,
      startHole: 1,
      endHole: holeCount,
      amount: config.amount * config.overallMultiplier,
      margin,
      holesPlayed,
      holesRemaining: holeCount - holesPlayed,
      status: statusFor(margin, holeCount - holesPlayed),
      openedBy: "overall",
    };
    applyPayout(overall);
  }

  const overallTotals = payoutsFor(overall ? [overall] : []);
  const allStackBets = stacks.flatMap((stack) => stack.bets);
  // The stack being played now is the last one anybody has posted a score in.
  const current =
    [...stacks].reverse().find((stack) => stack.bets[0]?.holesPlayed > 0) ??
    stacks[0] ??
    null;

  return {
    stacks,
    overall,
    overallSideTotals: sideTotalsOf(overallTotals),
    overallTotals,
    bets: allStackBets,
    current,
    standing: current?.standing ?? "",
    led: current?.led ?? { a: 0, b: 0, square: 0 },
    stackSideTotals: sideTotalsOf(payoutsFor(allStackBets)),
    sideTotals: sideTotalsOf(totals),
    totals,
  };
}

/** Who is up in one bet, for the detail list. */
export function betStanding(bet: OneDownBet, sides: [Side, Side]): string {
  if (bet.status === "won-a") return `${sides[0].name} wins`;
  if (bet.status === "won-b") return `${sides[1].name} wins`;
  if (bet.status === "halved") return "Halved";
  if (bet.holesPlayed === 0) return `Opens on ${bet.startHole}`;
  if (bet.margin === 0) return `All square thru ${bet.holesPlayed}`;
  const leader = bet.margin > 0 ? sides[0].name : sides[1].name;
  return `${leader} ${Math.abs(bet.margin)} up`;
}
