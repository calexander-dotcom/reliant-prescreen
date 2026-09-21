import { describe, expect, it } from "vitest";
import { sumCents } from "../money";
import type { OneDownConfig, Side } from "../types";
import { sideUp, type HoleResult } from "./nassau";
import {
  MAX_PRESSES_PER_HOLE,
  betStanding,
  evaluateOneDown,
  formatStanding,
  marginsByHole,
  pressCounts,
  pressesBefore,
  standingFor,
  teeFlipSide,
} from "./onedown";

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
    expect(evaluateOneDown(pressedAfter3, 18, through(1), ids).standing).toBe("+1/0");
  });

  it("after hole 2 reads 2-1-0", () => {
    expect(evaluateOneDown(pressedAfter3, 18, through(1, 1), ids).standing).toBe(
      "+2/+1/0",
    );
  });

  it("after hole 3 reads 2-1-0-0", () => {
    // The tie opens nothing on its own, so the fourth bet is Team B's press.
    const outcome = evaluateOneDown(pressedAfter3, 18, through(1, 1, 0), ids);
    expect(outcome.standing).toBe("+2/+1/0/0");
    expect(outcome.bets).toHaveLength(4);
    expect(outcome.bets[3]).toMatchObject({ startHole: 4, openedBy: "manual" });
  });

  it("after hole 4 reads 3-2-1-1-0", () => {
    const outcome = evaluateOneDown(pressedAfter3, 18, through(1, 1, 0, 1), ids);
    expect(outcome.standing).toBe("+3/+2/+1/+1/0");
    expect(outcome.bets).toHaveLength(5);
    expect(outcome.bets.map((bet) => bet.startHole)).toEqual([1, 2, 3, 4, 5]);
    expect(outcome.bets.map((bet) => bet.margin)).toEqual([3, 2, 1, 1, 0]);
  });

  it("after hole 5, with team B winning it, reads 2-1-0-0-(-1)-0", () => {
    const outcome = evaluateOneDown(pressedAfter3, 18, through(1, 1, 0, 1, -1), ids);
    expect(outcome.standing).toBe("+2/+1/0/0/-1/0");
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
      "+3/+2/+1/0",
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
    expect(outcome.standing).toBe("+3/+1/+1/+1");
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
    expect(outcome.standing).toBe("+3/+2/+1/+1/0");
  });

  it("stacks a bet every hole while one side keeps losing", () => {
    const outcome = evaluateOneDown(config(), 18, through(1, 1, 1, 1, 1, 1), ids);
    expect(outcome.bets).toHaveLength(7);
    expect(outcome.standing).toBe("+6/+5/+4/+3/+2/+1/0");
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
    expect(outcome.standing).toBe("-2/-1/0");
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
    expect(formatStanding([3, 2, 1, 1, 0])).toBe("+3/+2/+1/+1/0");
    expect(formatStanding([2, 1, 0, 0, -1, 0])).toBe("+2/+1/0/0/-1/0");
    expect(formatStanding([0])).toBe("0");
    expect(formatStanding([-2, -1, 0])).toBe("-2/-1/0");
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
    expect(outcome.standing).toBe("+2/+1/0/0/-1/0");
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

describe("standingFor", () => {
  // A wins 1 and 2, B presses on 3 and wins 4: A reads 2-1-0-(-1), and B
  // reads the same bets the other way up.
  const outcome = evaluateOneDown(
    config({ manualPresses: { 3: 1 } }),
    18,
    through(1, 1, 0, -1),
    ids,
  );
  const stack = outcome.stacks[0];

  it("reads the same stack from either side", () => {
    expect(standingFor(stack, 1)).toBe(stack.standing);
    expect(stack.standing).toBe("+1/0/-1/-1/0");
    // Every non-zero number changes sign; every zero stays a plain 0.
    expect(standingFor(stack, -1)).toBe("-1/0/+1/+1/0");
    const a = stack.bets.map((bet) => bet.margin);
    expect(standingFor(stack, -1)).toBe(formatStanding(a.map((m) => -m)));
  });

  it("puts the leading side's numbers in the open", () => {
    const aLeads = evaluateOneDown(config(), 18, through(1, 1), ids).stacks[0];
    expect(standingFor(aLeads, 1)).toBe("+2/+1/0");
    expect(standingFor(aLeads, -1)).toBe("-2/-1/0");
  });
});

describe("marginsByHole", () => {
  // The house example, hole by hole: A wins 1 and 2, ties 3 with a press
  // called after it, wins 4.
  const byHole = marginsByHole(
    config({ manualPresses: { 3: 1 } }),
    18,
    through(1, 1, 0, -1),
    ids,
  );

  it("reads the standing beside each finished hole", () => {
    expect(formatStanding(byHole[1] ?? [])).toBe("+1/0");
    expect(formatStanding(byHole[2] ?? [])).toBe("+2/+1/0");
    expect(formatStanding(byHole[3] ?? [])).toBe("+2/+1/0/0");
    expect(formatStanding(byHole[4] ?? [])).toBe("+1/0/-1/-1/0");
  });

  it("shows nothing beside a hole not played yet", () => {
    expect(byHole[5]).toBeNull();
    expect(byHole[18]).toBeNull();
  });

  it("waits for the holes before it in the same nine", () => {
    const gappy = marginsByHole(config(), 18, { ...through(), 1: 1, 3: 1 }, ids);
    // One up after the 1st opens the automatic press: two bets, the new one square.
    expect(gappy[1]).toEqual([1, 0]);
    expect(gappy[2]).toBeNull();
    expect(gappy[3]).toBeNull();
  });

  it("starts the back nine over on the 10th when the stack resets", () => {
    const nines = marginsByHole(
      config({ reset: "nines" }),
      18,
      through(1, 1, 1, 1, 1, 1, 1, 1, 1, -1),
      ids,
    );
    expect((nines[9] ?? []).length).toBeGreaterThan(1);
    expect(nines[10]).toEqual([-1, 0]);
  });
});

describe("greenies", () => {
  // Par 3s at 3, 7, 12 and 16, like most cards.
  const par = (hole: number) => ([3, 7, 12, 16].includes(hole) ? 3 : 4);
  const withGreenies = (winners: Record<number, string | null>) =>
    evaluateOneDown(
      // $10 a man, as the house plays it; the test config's default is per side.
      config({
        reset: "nines",
        autoPressAt: 0,
        stakeMode: "per-player",
        greenies: true,
        greenieWinners: winners,
      }),
      18,
      through(),
      ids,
      par,
    );

  it("nets three to one as two greenies' worth", () => {
    const outcome = withGreenies({ 3: "a1", 7: "a2", 12: "b1", 16: "a1" });
    expect(outcome.greenies.counts).toEqual([3, 1]);
    expect(outcome.greenies.sweptBy).toBeNull();
    // $10 a man per greenie: +30 -10 = +20 each for A.
    expect(outcome.greenies.totals).toEqual({ a1: 2000, a2: 2000, b1: -2000, b2: -2000 });
    expect(outcome.totals).toEqual(outcome.greenies.totals);
  });

  it("doubles a sweep: four for four is $80 each, not $40", () => {
    const outcome = withGreenies({ 3: "a1", 7: "a2", 12: "a1", 16: "a2" });
    expect(outcome.greenies.sweptBy).toBe(0);
    expect(outcome.greenies.sweepBonus).toEqual({ a1: 4000, a2: 4000, b1: -4000, b2: -4000 });
    expect(outcome.greenies.totals).toEqual({ a1: 8000, a2: 8000, b1: -8000, b2: -8000 });
  });

  it("does not sweep past a greenie nobody won, or one not yet asked", () => {
    const nobody = withGreenies({ 3: "a1", 7: "a2", 12: null, 16: "a1" });
    expect(nobody.greenies.sweptBy).toBeNull();
    expect(nobody.greenies.totals.a1).toBe(3000);
    const pending = withGreenies({ 3: "a1", 7: "a2", 12: "a1" });
    expect(pending.greenies.unanswered).toEqual([16]);
    expect(pending.greenies.sweptBy).toBeNull();
    expect(pending.greenies.totals.a1).toBe(3000);
  });

  it("pays two or three to none as just that", () => {
    expect(withGreenies({ 3: "b1", 7: "b2" }).greenies.totals.b1).toBe(2000);
    expect(withGreenies({ 3: "b1", 7: "b2", 16: "b1" }).greenies.totals.b1).toBe(3000);
  });

  it("puts each greenie on its hole and only the bonus on the round", () => {
    const outcome = withGreenies({ 3: "a1", 7: "a2", 12: "a1", 16: "a2" });
    const holes = outcome.greenies.holes;
    expect(holes.map((h) => h.hole)).toEqual([3, 7, 12, 16]);
    for (const hole of holes) expect(hole.amounts.a1).toBe(1000);
    const fromHoles = holes.reduce((sum, h) => sum + h.amounts.a1, 0);
    expect(fromHoles + outcome.greenies.sweepBonus.a1).toBe(outcome.greenies.totals.a1);
  });

  it("stays out of it when turned off, and without par 3s", () => {
    const off = evaluateOneDown(
      config({ greenies: false, greenieWinners: { 3: "a1" } }),
      18,
      through(),
      ids,
      par,
    );
    expect(off.greenies.enabled).toBe(false);
    expect(off.greenies.holes).toEqual([]);
    expect(sumCents(Object.values(off.totals))).toBe(0);
    const flat = evaluateOneDown(config({ greenieWinners: { 3: "a1" } }), 18, through(), ids);
    expect(flat.greenies.holes).toEqual([]);
  });

  it("splits a greenie per side when the stake is per side", () => {
    const outcome = evaluateOneDown(
      config({ stakeMode: "per-side", autoPressAt: 0, greenieWinners: { 3: "a1" } }),
      18,
      through(),
      ids,
      par,
    );
    expect(outcome.greenies.totals).toEqual({ a1: 500, a2: 500, b1: -500, b2: -500 });
  });
});

describe("presses called before a hole, ahead of time", () => {
  // A press before the 1st is stored against hole 0, the hole "before" it.
  const pressedOnTheFirstTee = config({ manualPresses: { 0: 1 } });

  it("rides alongside the opening bet from the start", () => {
    const outcome = evaluateOneDown(pressedOnTheFirstTee, 18, through(), ids);
    const stack = outcome.stacks[0];
    expect(stack.standing).toBe("0/0");
    expect(stack.bets.map((bet) => [bet.startHole, bet.openedBy])).toEqual([
      [1, "start"],
      [1, "manual"],
    ]);
    expect(betStanding(stack.bets[1], [sideA, sideB])).toBe("Opens on 1");
    expect(outcome.totals).toEqual({ a1: 0, a2: 0, b1: 0, b2: 0 });
  });

  it("wins both bets on the 1st, and the automatic press still opens", () => {
    const outcome = evaluateOneDown(pressedOnTheFirstTee, 18, through(1), ids);
    expect(outcome.standing).toBe("+1/+1/0");
    // Two bets to A at $10 a side: A up $20.
    expect(outcome.sideTotals).toEqual([2000, -2000]);
  });

  it("takes up to four on the 1st tee", () => {
    const outcome = evaluateOneDown(
      config({ manualPresses: { 0: MAX_PRESSES_PER_HOLE } }),
      18,
      through(1),
      ids,
    );
    expect(outcome.standing).toBe("+1/+1/+1/+1/+1/0");
  });

  it("opens with the back nine when called before the 10th", () => {
    const outcome = evaluateOneDown(
      config({ reset: "nines", manualPresses: { 9: 2 } }),
      18,
      through(1, 1, 1, 1, 1, 1, 1, 1, 1),
      ids,
    );
    const [front, back] = outcome.stacks;
    // The front nine never sees them: nothing opens after its last hole.
    expect(front.bets.every((bet) => bet.openedBy !== "manual")).toBe(true);
    expect(back.bets.map((bet) => [bet.startHole, bet.openedBy])).toEqual([
      [10, "start"],
      [10, "manual"],
      [10, "manual"],
    ]);
    expect(back.standing).toBe("0/0/0");
  });

  it("waits for the hole before it, so the standing only shows live bets", () => {
    // Called before the 4th while the group is on the 2nd: not a bet yet.
    const early = evaluateOneDown(config({ manualPresses: { 3: 1 } }), 18, through(1), ids);
    expect(early.standing).toBe("+1/0");
    expect(early.bets.some((bet) => bet.openedBy === "manual")).toBe(false);
    // Once the 3rd is in, it opens on the 4th like any press.
    const due = evaluateOneDown(config({ manualPresses: { 3: 1 } }), 18, through(1, 1, 0), ids);
    expect(due.standing).toBe("+2/+1/0/0");
    expect(due.bets[3]).toMatchObject({ startHole: 4, openedBy: "manual" });
  });

  it("shows on the card beside the 1st", () => {
    const byHole = marginsByHole(pressedOnTheFirstTee, 18, through(1, -1), ids);
    expect(formatStanding(byHole[1] ?? [])).toBe("+1/+1/0");
    expect(formatStanding(byHole[2] ?? [])).toBe("0/0/-1/0");
  });

  it("reads the count for a hole from the stored shape", () => {
    const cfg = config({ manualPresses: { 0: 2, 3: 1 } });
    expect(pressesBefore(cfg, 1)).toBe(2);
    expect(pressesBefore(cfg, 4)).toBe(1);
    expect(pressesBefore(cfg, 2)).toBe(0);
    // The old list shape still reads.
    expect(pressesBefore(config({ manualPresses: [3] as unknown as Record<number, number> }), 4)).toBe(1);
    expect(pressCounts({ 0: 1 }).get(0)).toBe(1);
  });
});

describe("the tee flip", () => {
  // Team A wins the flip on the 1st tee: stored as a player on their side.
  const flipToA = config({ teeFlipWinnerId: "a2" });

  it("puts the winners one up before a ball is hit, which opens the first press", () => {
    const outcome = evaluateOneDown(flipToA, 18, through(), ids);
    expect(outcome.teeFlip).toBe(0);
    expect(outcome.standing).toBe("+1/0");
    expect(outcome.stacks[0].bets.map((bet) => [bet.startHole, bet.openedBy, bet.margin])).toEqual([
      [1, "start", 1],
      [1, "auto", 0],
    ]);
    // One bet to A already, at $10 a side.
    expect(outcome.sideTotals).toEqual([1000, -1000]);
    expect(betStanding(outcome.stacks[0].bets[0], [sideA, sideB])).toBe("Team A 1 up");
    expect(betStanding(outcome.stacks[0].bets[1], [sideA, sideB])).toBe("Opens on 1");
  });

  it("reads -1/0 from the losers' side", () => {
    const outcome = evaluateOneDown(config({ teeFlipWinnerId: "b1" }), 18, through(), ids);
    expect(outcome.teeFlip).toBe(1);
    expect(outcome.standing).toBe("-1/0");
    expect(standingFor(outcome.stacks[0], -1)).toBe("+1/0");
  });

  it("then plays on like any hole won: A takes the 1st for +2/+1/0", () => {
    expect(evaluateOneDown(flipToA, 18, through(1), ids).standing).toBe("+2/+1/0");
    // B takes the 1st back instead: the opening bet is square, B leads the
    // press, and B being up opens the next.
    expect(evaluateOneDown(flipToA, 18, through(-1), ids).standing).toBe("0/-1/0");
  });

  it("opens nothing on its own when the game presses at 2 down", () => {
    const cfg = config({ teeFlipWinnerId: "a1", autoPressAt: 2 });
    expect(evaluateOneDown(cfg, 18, through(), ids).standing).toBe("+1");
    expect(evaluateOneDown(cfg, 18, through(1), ids).standing).toBe("+2/0");
  });

  it("is a hole of the front nine's game only", () => {
    const outcome = evaluateOneDown(
      config({ teeFlipWinnerId: "a1", reset: "nines", overallMultiplier: 2 }),
      18,
      through(),
      ids,
    );
    expect(outcome.stacks[0].standing).toBe("+1/0");
    expect(outcome.stacks[1].standing).toBe("0");
    // The 18-hole bet starts square; the flip is not one of its holes.
    expect(outcome.overall?.margin).toBe(0);
    expect(outcome.overallTotals).toEqual({ a1: 0, a2: 0, b1: 0, b2: 0 });
  });

  it("starts a press called on the tee square, after the flip", () => {
    const outcome = evaluateOneDown(config({ teeFlipWinnerId: "a1", manualPresses: { 0: 1 } }), 18, through(), ids);
    expect(outcome.standing).toBe("+1/0/0");
    expect(outcome.stacks[0].bets.map((bet) => bet.openedBy)).toEqual(["start", "auto", "manual"]);
  });

  it("shows beside the 1st on the card", () => {
    const byHole = marginsByHole(flipToA, 18, through(1, 0), ids);
    expect(formatStanding(byHole[1] ?? [])).toBe("+2/+1/0");
    expect(formatStanding(byHole[2] ?? [])).toBe("+2/+1/0");
  });

  it("is nobody's when the winner has left the game", () => {
    const cfg = config({ teeFlipWinnerId: "gone" });
    expect(teeFlipSide(cfg)).toBeNull();
    expect(evaluateOneDown(cfg, 18, through(), ids).standing).toBe("0");
    expect(teeFlipSide(config({ teeFlipWinnerId: null }))).toBeNull();
    expect(teeFlipSide(config())).toBeNull();
  });
});
