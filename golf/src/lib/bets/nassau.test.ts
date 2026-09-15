import { describe, expect, it } from "vitest";
import { sumCents } from "../money";
import type { NassauConfig, Side } from "../types";
import {
  buildSegments,
  evaluateNassau,
  matchPayout,
  matchStanding,
  type HoleResult,
} from "./nassau";

const sideA: Side = { id: "a", name: "Team A", playerIds: ["p1"] };
const sideB: Side = { id: "b", name: "Team B", playerIds: ["p2"] };
const ids = ["p1", "p2"];

function config(overrides: Partial<NassauConfig> = {}): NassauConfig {
  return {
    kind: "nassau",
    id: "n1",
    label: "Nassau",
    amount: 2000,
    sides: [sideA, sideB],
    basis: "net",
    autoPressAt: 0,
    maxPresses: 4,
    includeTotal: true,
    stakeMode: "per-side",
    ...overrides,
  };
}

/** Build a results map from a sparse list, e.g. { 1: 1, 2: -1 }. */
function results(map: Record<number, HoleResult>): Record<number, HoleResult> {
  const out: Record<number, HoleResult> = {};
  for (let hole = 1; hole <= 18; hole += 1) out[hole] = map[hole] ?? null;
  return out;
}

describe("buildSegments", () => {
  it("splits an 18-hole round into front, back and total", () => {
    expect(buildSegments(18, true).map((s) => s.id)).toEqual([
      "front",
      "back",
      "total",
    ]);
  });

  it("drops the total bet when it is not wanted", () => {
    expect(buildSegments(18, false).map((s) => s.id)).toEqual(["front", "back"]);
  });

  it("collapses a nine-hole round to one segment", () => {
    const segments = buildSegments(9, true);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ startHole: 1, endHole: 9, label: "Nine" });
  });
});

describe("nassau without presses", () => {
  const holes = results({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: -1, 7: -1, 8: -1, 9: -1 });

  it("settles the front and leaves the back and total open", () => {
    const outcome = evaluateNassau(config(), 18, holes, ids);
    const front = outcome.matches.find((m) => m.id === "front");
    const back = outcome.matches.find((m) => m.id === "back");
    const total = outcome.matches.find((m) => m.id === "total");

    expect(front).toMatchObject({ diff: 1, holesPlayed: 9, status: "won-a" });
    expect(back).toMatchObject({ holesPlayed: 0, status: "in-progress" });
    expect(total).toMatchObject({ diff: 1, holesRemaining: 9, status: "in-progress" });
    expect(outcome.totals).toEqual({ p1: 2000, p2: -2000 });
  });

  it("locks a match in once the lead exceeds the holes left", () => {
    const outcome = evaluateNassau(
      config(),
      18,
      results({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 }),
      ids,
    );
    const front = outcome.matches.find((m) => m.id === "front");
    expect(front).toMatchObject({ diff: 6, holesRemaining: 3, status: "won-a" });
    expect(outcome.totals.p1).toBe(2000);
  });

  it("pays nobody on a halved segment", () => {
    const outcome = evaluateNassau(
      config(),
      18,
      results({ 1: 1, 2: -1, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 }),
      ids,
    );
    expect(outcome.matches.find((m) => m.id === "front")?.status).toBe("halved");
    expect(outcome.totals).toEqual({ p1: 0, p2: 0 });
  });
});

describe("automatic one-down presses", () => {
  it("opens a press over the rest of the segment the hole a side goes 1 down", () => {
    const outcome = evaluateNassau(
      config({ autoPressAt: 1, maxPresses: 1 }),
      18,
      results({ 1: -1, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 }),
      ids,
    );

    const press = outcome.matches.find((m) => m.id === "front-press1");
    expect(press).toMatchObject({
      startHole: 2,
      endHole: 9,
      depth: 1,
      parentId: "front",
      triggeredAfterHole: 1,
      status: "halved",
    });
    // Front lost, press halved: only the original bet pays.
    expect(outcome.totals).toEqual({ p1: -2000, p2: 2000 });
  });

  it("presses the press, up to the cap", () => {
    const outcome = evaluateNassau(
      config({ autoPressAt: 1, maxPresses: 3 }),
      18,
      results({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1 }),
      ids,
    );

    const frontMatches = outcome.matches.filter((m) => m.segmentId === "front");
    expect(frontMatches).toHaveLength(4); // original + 3 presses
    expect(frontMatches.map((m) => m.startHole)).toEqual([1, 2, 3, 4]);
    expect(frontMatches.every((m) => m.status === "won-a")).toBe(true);
    // Four separate $20 bets, all won by A.
    expect(outcome.totals).toEqual({ p1: 8000, p2: -8000 });
  });

  it("does not press with no holes left to play on", () => {
    const outcome = evaluateNassau(
      config({ autoPressAt: 1, maxPresses: 4 }),
      18,
      results({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: -1 }),
      ids,
    );
    expect(outcome.matches.filter((m) => m.segmentId === "front")).toHaveLength(1);
  });

  it("honours a two-down press trigger", () => {
    const outcome = evaluateNassau(
      config({ autoPressAt: 2, maxPresses: 1 }),
      18,
      results({ 1: -1, 2: 0, 3: -1, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 }),
      ids,
    );
    const press = outcome.matches.find((m) => m.id === "front-press1");
    expect(press?.triggeredAfterHole).toBe(3);
    expect(press?.startHole).toBe(4);
  });

  it("never moves money it did not take from someone", () => {
    const outcome = evaluateNassau(
      config({ autoPressAt: 1, maxPresses: 4 }),
      18,
      results({ 1: -1, 2: 1, 3: -1, 4: 1, 5: -1, 6: 1, 7: -1, 8: 1, 9: -1, 10: 1, 11: -1, 12: 1, 13: -1, 14: 1, 15: -1, 16: 1, 17: -1, 18: 1 }),
      ids,
    );
    expect(sumCents(Object.values(outcome.totals))).toBe(0);
  });
});

describe("matchPayout", () => {
  const teamIds = ["p1", "p2", "p3", "p4"];
  const teamA: Side = { id: "a", name: "A", playerIds: ["p1", "p2"] };
  const teamB: Side = { id: "b", name: "B", playerIds: ["p3", "p4"] };
  const won = {
    id: "front",
    label: "Front 9",
    segmentId: "front",
    startHole: 1,
    endHole: 9,
    amount: 2000,
    depth: 0,
    parentId: null,
    triggeredAfterHole: null,
    diff: 2,
    holesPlayed: 9,
    holesRemaining: 0,
    status: "won-a" as const,
  };

  it("splits one stake across each side in per-side mode", () => {
    expect(matchPayout(won, [teamA, teamB], "per-side", teamIds)).toEqual({
      p1: 1000,
      p2: 1000,
      p3: -1000,
      p4: -1000,
    });
  });

  it("charges every loser the full stake in per-player mode", () => {
    expect(matchPayout(won, [teamA, teamB], "per-player", teamIds)).toEqual({
      p1: 4000,
      p2: 4000,
      p3: -4000,
      p4: -4000,
    });
  });

  it("splits an odd stake to the cent", () => {
    const threeA: Side = { id: "a", name: "A", playerIds: ["p1", "p2", "p3"] };
    const oneB: Side = { id: "b", name: "B", playerIds: ["p4"] };
    const payout = matchPayout(
      { ...won, amount: 2500 },
      [threeA, oneB],
      "per-side",
      teamIds,
    );
    expect(payout).toEqual({ p1: 834, p2: 833, p3: 833, p4: -2500 });
    expect(sumCents(Object.values(payout))).toBe(0);
  });

  it("pays nothing while a match is live or halved", () => {
    const zero = { p1: 0, p2: 0, p3: 0, p4: 0 };
    expect(
      matchPayout({ ...won, status: "in-progress" }, [teamA, teamB], "per-side", teamIds),
    ).toEqual(zero);
    expect(
      matchPayout({ ...won, status: "halved" }, [teamA, teamB], "per-side", teamIds),
    ).toEqual(zero);
  });
});

describe("matchStanding", () => {
  const base = {
    id: "front",
    label: "Front 9",
    segmentId: "front",
    startHole: 1,
    endHole: 9,
    amount: 2000,
    depth: 0,
    parentId: null,
    triggeredAfterHole: null,
    holesRemaining: 2,
    status: "in-progress" as const,
  };

  it("describes a live match", () => {
    expect(matchStanding({ ...base, diff: 2, holesPlayed: 7 }, [sideA, sideB])).toBe(
      "Team A 2 up thru 7",
    );
    expect(matchStanding({ ...base, diff: -1, holesPlayed: 7 }, [sideA, sideB])).toBe(
      "Team B 1 up thru 7",
    );
    expect(matchStanding({ ...base, diff: 0, holesPlayed: 7 }, [sideA, sideB])).toBe(
      "All square thru 7",
    );
    expect(matchStanding({ ...base, diff: 0, holesPlayed: 0 }, [sideA, sideB])).toBe(
      "Not started",
    );
  });

  it("describes a finished match", () => {
    expect(
      matchStanding({ ...base, diff: 3, holesPlayed: 9, status: "won-a" }, [sideA, sideB]),
    ).toBe("Team A wins");
    expect(
      matchStanding({ ...base, diff: 0, holesPlayed: 9, status: "halved" }, [sideA, sideB]),
    ).toBe("Halved");
  });
});

describe("money by segment", () => {
  const card = results(
    Object.fromEntries(
      Array.from({ length: 18 }, (_, index) => [index + 1, index < 9 ? 1 : -1]),
    ),
  );

  it("lands each match's money in its own segment", () => {
    // A takes the front, B the back, the 18 is halved.
    const outcome = evaluateNassau(config(), 18, card, ids);
    expect(outcome.segmentTotals.front).toEqual({ p1: 2000, p2: -2000 });
    expect(outcome.segmentTotals.back).toEqual({ p1: -2000, p2: 2000 });
    expect(outcome.segmentTotals.total).toEqual({ p1: 0, p2: 0 });
    expect(outcome.totals).toEqual({ p1: 0, p2: 0 });
  });

  it("keeps a press with the nine it was pressed on", () => {
    const outcome = evaluateNassau(config({ autoPressAt: 2 }), 18, card, ids);
    // Presses only add to what A already won on the front and B on the back.
    expect(outcome.segmentTotals.front.p1).toBeGreaterThan(2000);
    expect(outcome.segmentTotals.back.p2).toBeGreaterThan(2000);
    // The 18 itself is halved, so whatever sits in its segment is its own
    // presses — which belong to the round, not to either nine.
    const eighteen = outcome.matches.find(
      (match) => match.segmentId === "total" && match.depth === 0,
    );
    expect(eighteen?.status).toBe("halved");
    expect(outcome.segmentTotals.total.p2).toBeGreaterThan(0);
    for (const segment of Object.values(outcome.segmentTotals)) {
      expect(sumCents(Object.values(segment))).toBe(0);
    }
    for (const id of ids) {
      const added = Object.values(outcome.segmentTotals).reduce(
        (sum, segment) => sum + segment[id],
        0,
      );
      expect(added).toBe(outcome.totals[id]);
    }
  });

  it("has just the one segment on a nine-hole card", () => {
    const outcome = evaluateNassau(config(), 9, card, ids);
    expect(Object.keys(outcome.segmentTotals)).toEqual(["front"]);
  });
});
