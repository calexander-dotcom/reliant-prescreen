import { describe, expect, it } from "vitest";
import { sumCents } from "../money";
import type { OneDownConfig, Side } from "../types";
import { sideUp, type HoleResult } from "./nassau";
import { betStanding, evaluateOneDown, formatStanding } from "./onedown";

const sideA: Side = { id: "a", name: "Team A", playerIds: ["a1", "a2"] };
const sideB: Side = { id: "b", name: "Team B", playerIds: ["b1", "b2"] };
const ids = ["a1", "a2", "b1", "b2"];

function config(overrides: Partial<OneDownConfig> = {}): OneDownConfig {
  return {
    kind: "onedown",
    id: "od1",
    label: "One downs",
    amount: 1000,
    sides: [sideA, sideB],
    basis: "net",
    autoPressAt: 1,
    manualPresses: {},
    // Most cases here exercise the stack; the 18-hole bet gets its own tests.
    reset: "round",
    overallMultiplier: 0,
    stakeMode: "per-side",
    ...overrides,
  };
}

/** Results for holes 1..n only; the rest of the card is unplayed. */
function through(...holes: HoleResult[]): Record<number, HoleResult> {
  const out: Record<number, HoleResult> = {};
  for (let hole = 1; hole <= 18; hole += 1) {
    out[hole] = holes[hole - 1] ?? null;
  }
  return out;
}

/**
 * The house rules, exactly as described:
 *
 *   Team A wins 1 and 2, ties 3 — Team B adds a press — then A wins 4.
 *
 *   after 1  1-0
 *   after 2  2-1-0
 *   after 3  2-1-0-0
 *   after 4  3-2-1-1-0
 */
describe("the house one-down rules", () => {
  const pressedAfter3 = config({ manualPresses: { 3: 1 } });

  it("after hole 1 reads 1-0", () => {
    expect(evaluateOneDown(pressedAfter3, 18, through(1), ids).standing).toBe("1-0");
  });

  it("after hole 2 reads 2-1-0", () => {
    expect(evaluateOneDown(pressedAfter3, 18, through(1, 1), ids).standing).toBe(
      "2-1-0",
    );
  });

  it("after hole 3 reads 2-1-0-0", () => {
    // The tie opens nothing on its own, so the fourth bet is Team B's press.
    const outcome = evaluateOneDown(pressedAfter3, 18, through(1, 1, 0), ids);
    expect(outcome.standing).toBe("2-1-0-0");
    expect(outcome.bets).toHaveLength(4);
    expect(outcome.bets[3]).toMatchObject({ startHole: 4, openedBy: "manual" });
  });

  it("after hole 4 reads 3-2-1-1-0", () => {
    const outcome = evaluateOneDown(pressedAfter3, 18, through(1, 1, 0, 1), ids);
    expect(outcome.standing).toBe("3-2-1-1-0");
    expect(outcome.bets).toHaveLength(5);
    expect(outcome.bets.map((bet) => bet.startHole)).toEqual([1, 2, 3, 4, 5]);
    expect(outcome.bets.map((bet) => bet.margin)).toEqual([3, 2, 1, 1, 0]);
  });

  it("after hole 5, with team B winning it, reads 2-1-0-0-(-1)-0", () => {
    const outcome = evaluateOneDown(pressedAfter3, 18, through(1, 1, 0, 1, -1), ids);
    expect(outcome.standing).toBe("2-1-0-0-(-1)-0");
    expect(outcome.bets).toHaveLength(6);
    expect(outcome.bets.map((bet) => bet.margin)).toEqual([2, 1, 0, 0, -1, 0]);
    // Team B losing hole 5 in its own new bet opens the next one.
    expect(outcome.bets[5]).toMatchObject({ startHole: 6, openedBy: "auto" });
  });

  it("puts team A up $10 after hole 5, at $10 a bet", () => {
    const outcome = evaluateOneDown(pressedAfter3, 18, through(1, 1, 0, 1, -1), ids);
    // Two bets to A, one to B, three square: A is up one bet.
    expect(outcome.led).toEqual({ a: 2, b: 1, square: 3 });
    expect(outcome.stackSideTotals).toEqual([1000, -1000]);
    // Split across the two players on each side.
    expect(outcome.totals).toEqual({ a1: 500, a2: 500, b1: -500, b2: -500 });
    expect(sumCents(Object.values(outcome.totals))).toBe(0);
  });

  it("puts team A up $40 after hole 4", () => {
    const outcome = evaluateOneDown(pressedAfter3, 18, through(1, 1, 0, 1), ids);
    // 3-2-1-1-0: four bets led by A, one square.
    expect(outcome.led).toEqual({ a: 4, b: 0, square: 1 });
    expect(outcome.stackSideTotals).toEqual([4000, -4000]);
  });

  it("opens nothing extra without the press, giving 3-2-1-0", () => {
    // Same golf, no press after the tied hole: one fewer bet.
    expect(evaluateOneDown(config(), 18, through(1, 1, 0, 1), ids).standing).toBe(
      "3-2-1-0",
    );
  });
});

describe("opening new bets", () => {
  it("adds a hand press on top of the automatic bet", () => {
    const outcome = evaluateOneDown(
      config({ manualPresses: { 1: 1 } }),
      18,
      through(1, 1),
      ids,
    );
    // Hole 1 opens one automatically and one by hand: two bets from hole 2.
    expect(outcome.bets.map((bet) => bet.startHole)).toEqual([1, 2, 2, 3]);
    expect(outcome.bets[1].openedBy).toBe("auto");
    expect(outcome.bets[2].openedBy).toBe("manual");
  });

  it("takes two or three presses on the same hole", () => {
    const outcome = evaluateOneDown(
      config({ autoPressAt: 0, manualPresses: { 2: 3 } }),
      18,
      through(1, 1, 1),
      ids,
    );
    // Three presses after the 2nd: three separate bets from hole 3.
    expect(outcome.bets.map((bet) => bet.startHole)).toEqual([1, 3, 3, 3]);
    // Same golf, so identical margins — and triple the money.
    expect(outcome.standing).toBe("3-1-1-1");
    expect(outcome.stackSideTotals).toEqual([4000, -4000]);
  });

  it("reads the older list-of-holes shape too", () => {
    const outcome = evaluateOneDown(
      // A round saved before presses could be stacked.
      config({ manualPresses: [3] as unknown as Record<number, number> }),
      18,
      through(1, 1, 0, 1),
      ids,
    );
    expect(outcome.standing).toBe("3-2-1-1-0");
  });

  it("stacks a bet every hole while one side keeps losing", () => {
    const outcome = evaluateOneDown(config(), 18, through(1, 1, 1, 1, 1, 1), ids);
    expect(outcome.bets).toHaveLength(7);
    expect(outcome.standing).toBe("6-5-4-3-2-1-0");
  });

  it("stops opening bets when a halve keeps the newest one square", () => {
    const outcome = evaluateOneDown(config(), 18, through(0, 0, 0), ids);
    expect(outcome.bets).toHaveLength(1);
    expect(outcome.standing).toBe("0");
  });

  it("reopens the stack once someone falls behind again", () => {
    // Halved, halved, then B loses one.
    const outcome = evaluateOneDown(config(), 18, through(0, 0, 1), ids);
    expect(outcome.bets.map((bet) => bet.startHole)).toEqual([1, 4]);
  });

  it("works the same when side B is the one ahead", () => {
    const outcome = evaluateOneDown(config(), 18, through(-1, -1), ids);
    // Signed from side A, so B being up two reads as (-2).
    expect(outcome.standing).toBe("(-2)-(-1)-0");
    expect(outcome.bets[0].margin).toBe(-2);
  });

  it("honours manual-only presses", () => {
    const outcome = evaluateOneDown(
      config({ autoPressAt: 0, manualPresses: { 2: 1, 5: 1 } }),
      18,
      through(1, 1, 1, 1, 1, 1),
      ids,
    );
    expect(outcome.bets.map((bet) => bet.startHole)).toEqual([1, 3, 6]);
  });

  it("does not open a bet on the last hole", () => {
    const outcome = evaluateOneDown(
      config(),
      18,
      through(...Array.from({ length: 18 }, () => 1 as HoleResult)),
      ids,
    );
    expect(outcome.bets[outcome.bets.length - 1].startHole).toBe(18);
  });

  it("restarts the stack at the turn when set to nines", () => {
    const outcome = evaluateOneDown(
      config({ reset: "nines" }),
      18,
      through(...Array.from({ length: 12 }, () => 1 as HoleResult)),
      ids,
    );
    const front = outcome.bets.filter((bet) => bet.endHole === 9);
    const back = outcome.bets.filter((bet) => bet.endHole === 18);
    expect(front[0]).toMatchObject({ startHole: 1, endHole: 9 });
    expect(back[0]).toMatchObject({ startHole: 10, endHole: 18 });
    expect(back.map((bet) => bet.startHole)).toEqual([10, 11, 12, 13]);
  });
});

describe("settling one downs", () => {
  const full = (result: HoleResult) =>
    through(...Array.from({ length: 18 }, () => result));

  it("pays out every bet in the stack", () => {
    const outcome = evaluateOneDown(config(), 18, full(1), ids);
    // 18 bets: holes 1..18 each opened one, and A won all of them.
    expect(outcome.bets).toHaveLength(18);
    expect(outcome.bets.every((bet) => bet.status === "won-a")).toBe(true);
    // $10 a bet, split across each two-player side.
    expect(outcome.totals).toEqual({ a1: 9000, a2: 9000, b1: -9000, b2: -9000 });
    expect(sumCents(Object.values(outcome.totals))).toBe(0);
  });

  it("pays the leader of a bet whether or not it is mathematically decided", () => {
    // One hole in: nothing is settled, but A leads the first bet.
    const outcome = evaluateOneDown(config(), 18, through(1), ids);
    expect(outcome.bets[0].status).toBe("in-progress");
    expect(outcome.stackSideTotals).toEqual([1000, -1000]);
  });

  it("pays nothing for a bet that is all square", () => {
    const outcome = evaluateOneDown(config(), 18, through(1, -1), ids);
    // The opening bet is level again, and the second is one down to B.
    expect(outcome.bets[0].margin).toBe(0);
    expect(outcome.led.square).toBeGreaterThan(0);
  });

  it("closes a bet out once the lead exceeds the holes left", () => {
    const outcome = evaluateOneDown(
      config(),
      18,
      through(1, 1, 1, 1, 1, 1, 1, 1, 1, 1),
      ids,
    );
    expect(outcome.bets[0]).toMatchObject({ margin: 10, status: "won-a" });
    // A later bet is still live: its margin has not outrun its remaining holes.
    expect(outcome.bets[outcome.bets.length - 2].status).toBe("in-progress");
  });

  it("pays nothing on a stack that halves out", () => {
    const outcome = evaluateOneDown(config(), 18, full(0), ids);
    expect(outcome.bets).toHaveLength(1);
    expect(outcome.bets[0].status).toBe("halved");
    expect(outcome.totals).toEqual({ a1: 0, a2: 0, b1: 0, b2: 0 });
  });

  it("has each player in for the stake per player, and splitting it per side", () => {
    // One bet, A one up after the 1st: it pays A now.
    const perPlayer = evaluateOneDown(
      config({ stakeMode: "per-player", autoPressAt: 0 }),
      18,
      through(1),
      ids,
    );
    expect(perPlayer.totals).toEqual({ a1: 1000, a2: 1000, b1: -1000, b2: -1000 });
    const perSide = evaluateOneDown(
      config({ stakeMode: "per-side", autoPressAt: 0 }),
      18,
      through(1),
      ids,
    );
    expect(perSide.totals).toEqual({ a1: 500, a2: 500, b1: -500, b2: -500 });
    expect(sumCents(Object.values(perPlayer.totals))).toBe(0);
  });

  it("reads a pair's money out per head", () => {
    // Seven bets up between two players is $70 each, not $140.
    expect(sideUp(14000, sideA, "per-player")).toEqual({ cents: 7000, each: true });
    expect(sideUp(14000, sideA, "per-side")).toEqual({ cents: 14000, each: false });
    const single: Side = { id: "s", name: "Solo", playerIds: ["s1"] };
    expect(sideUp(2000, single, "per-player")).toEqual({ cents: 2000, each: false });
  });
});

describe("betStanding", () => {
  const bet = {
    index: 1,
    startHole: 1,
    endHole: 18,
    amount: 1000,
    holesRemaining: 14,
    openedBy: "start" as const,
  };

  it("describes each state", () => {
    expect(
      betStanding({ ...bet, margin: 2, holesPlayed: 4, status: "in-progress" }, [sideA, sideB]),
    ).toBe("Team A 2 up");
    expect(
      betStanding({ ...bet, margin: -1, holesPlayed: 4, status: "in-progress" }, [sideA, sideB]),
    ).toBe("Team B 1 up");
    expect(
      betStanding({ ...bet, margin: 0, holesPlayed: 4, status: "in-progress" }, [sideA, sideB]),
    ).toBe("All square thru 4");
    expect(
      betStanding({ ...bet, startHole: 7, margin: 0, holesPlayed: 0, status: "in-progress" }, [sideA, sideB]),
    ).toBe("Opens on 7");
    expect(
      betStanding({ ...bet, margin: 3, holesPlayed: 18, status: "won-a" }, [sideA, sideB]),
    ).toBe("Team A wins");
  });
});

describe("formatStanding", () => {
  it("writes the house notation", () => {
    expect(formatStanding([3, 2, 1, 1, 0])).toBe("3-2-1-1-0");
    expect(formatStanding([2, 1, 0, 0, -1, 0])).toBe("2-1-0-0-(-1)-0");
    expect(formatStanding([0])).toBe("0");
    expect(formatStanding([-2, -1, 0])).toBe("(-2)-(-1)-0");
  });
});

describe("the nines and the 18-hole bet", () => {
  const house = config({ reset: "nines", overallMultiplier: 2 });
  // The worked example, with team B's press after the tied 3rd.
  const housePressed = config({
    reset: "nines",
    overallMultiplier: 2,
    manualPresses: { 3: 1 },
  });

  it("ends the stack at the turn and starts a new one on the 10th", () => {
    const outcome = evaluateOneDown(
      house,
      18,
      through(...Array.from({ length: 12 }, () => 1 as HoleResult)),
      ids,
    );
    expect(outcome.stacks.map((stack) => stack.label)).toEqual(["Front 9", "Back 9"]);

    const [front, back] = outcome.stacks;
    // The front stack closed with nine bets and stops at the 9th.
    expect(front.bets.every((bet) => bet.endHole === 9)).toBe(true);
    expect(front.bets.map((bet) => bet.startHole)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // The back stack starts fresh on the 10th.
    expect(back.bets.map((bet) => bet.startHole)).toEqual([10, 11, 12, 13]);
    // And the standing on screen is the nine being played.
    expect(outcome.current?.label).toBe("Back 9");
    expect(outcome.standing).toBe(back.standing);
  });

  it("runs one 18-hole bet at double, with no presses on it", () => {
    const outcome = evaluateOneDown(housePressed, 18, through(1, 1, 0, 1, -1), ids);
    expect(outcome.overall).toMatchObject({
      startHole: 1,
      endHole: 18,
      amount: 2000,
      margin: 2,
      openedBy: "overall",
    });
    // Double the stake, and it is the only bet over the full round.
    expect(outcome.overallSideTotals).toEqual([2000, -2000]);
    // The standing stays the stack; the 18-hole bet is its own line.
    expect(outcome.standing).toBe("2-1-0-0-(-1)-0");
    expect(outcome.bets.some((bet) => bet.openedBy === "overall")).toBe(false);
  });

  it("adds the stacks and the 18-hole bet into one figure", () => {
    const outcome = evaluateOneDown(housePressed, 18, through(1, 1, 0, 1, -1), ids);
    // Stack has A up one bet ($10); the 18-hole bet is A's too ($20).
    expect(outcome.stackSideTotals).toEqual([1000, -1000]);
    expect(outcome.sideTotals).toEqual([3000, -3000]);
    expect(sumCents(Object.values(outcome.totals))).toBe(0);
  });

  it("leaves the 18-hole bet out on a nine-hole round", () => {
    const outcome = evaluateOneDown(house, 9, through(1, 1), ids);
    expect(outcome.overall).toBeNull();
    expect(outcome.stacks).toHaveLength(1);
    expect(outcome.stacks[0].endHole).toBe(9);
  });

  it("turns the 18-hole bet off when the multiplier is zero", () => {
    const outcome = evaluateOneDown(
      config({ reset: "nines", overallMultiplier: 0 }),
      18,
      through(1, 1),
      ids,
    );
    expect(outcome.overall).toBeNull();
  });
});

describe("money by stack", () => {
  // Nines, $10 a bet with the 18 at 2x, no auto press so each stack is one
  // bet. A takes the whole front; B takes the back bar a halved 18th, which
  // leaves A one up over the eighteen.
  const cfg = config({ reset: "nines", overallMultiplier: 2, autoPressAt: 0 });
  const outcome = evaluateOneDown(
    cfg,
    18,
    through(1, 1, 1, 1, 1, 1, 1, 1, 1, -1, -1, -1, -1, -1, -1, -1, -1, 0),
    ids,
  );
  const [front, back] = outcome.stacks;

  it("reports each stack per player, agreeing with its side totals", () => {
    expect(front.playerTotals).toEqual({ a1: 500, a2: 500, b1: -500, b2: -500 });
    expect(front.sideTotals).toEqual([1000, -1000]);
    expect(back.playerTotals).toEqual({ a1: -500, a2: -500, b1: 500, b2: 500 });
    expect(back.sideTotals).toEqual([-1000, 1000]);
  });

  it("keeps the 18-hole bet out of both nines", () => {
    expect(outcome.overallTotals).toEqual({ a1: 1000, a2: 1000, b1: -1000, b2: -1000 });
    expect(outcome.overallSideTotals).toEqual([2000, -2000]);
  });

  it("adds the stacks and the 18 up to the bet's money", () => {
    for (const id of ids) {
      expect(
        front.playerTotals[id] + back.playerTotals[id] + outcome.overallTotals[id],
      ).toBe(outcome.totals[id]);
    }
    expect(sumCents(Object.values(outcome.totals))).toBe(0);
  });

  it("is all zeros without an 18-hole bet", () => {
    const none = evaluateOneDown(config({ reset: "nines" }), 18, through(1, 1), ids);
    expect(none.overall).toBeNull();
    expect(none.overallTotals).toEqual({ a1: 0, a2: 0, b1: 0, b2: 0 });
  });
});
