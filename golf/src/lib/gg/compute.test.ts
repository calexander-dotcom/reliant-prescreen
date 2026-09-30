import { describe, expect, it } from "vitest";
import { computeRound } from "../bets";
import type { Player, Round } from "../types";

/** A bare two-player round; the bet math is exercised elsewhere. */
function baseRound(overrides: Partial<Round> = {}): Round {
  const players: Player[] = [
    { id: "p1", name: "One", handicapIndex: null, source: "gg" },
    { id: "p2", name: "Two", handicapIndex: null, source: "gg" },
  ];
  const now = "2026-09-30T00:00:00.000Z";
  return {
    id: "r1",
    date: "2026-09-30",
    courseName: "Test",
    course: null,
    teeId: null,
    players,
    handicapMode: "none",
    holeCount: 18,
    scores: {},
    manual: {},
    bets: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("computeRound with a Golf Genius tie-in", () => {
  it("keeps a hand-entered score, fills the blanks from the feed, and flags a clash", () => {
    const round = baseRound({
      scores: { p1: { 1: 5 } }, // you typed a 5 on the 1st
      gg: {
        ggid: "abc",
        eventId: "e1",
        roundId: "rd1",
        scores: { p1: { 1: 4, 2: 6 }, p2: { 1: 3 } },
        updatedAt: "2026-09-30T00:00:00.000Z",
      },
    });
    const comp = computeRound(round);

    // Your entry stands and plays the bets, even though the feed says 4.
    expect(comp.cells.p1[1].gross).toBe(5);
    // A hole you never typed is filled from the feed.
    expect(comp.cells.p1[2].gross).toBe(6);
    expect(comp.cells.p2[1].gross).toBe(3);

    // The clash is surfaced, with both numbers.
    expect(comp.reconcile.p1[1].status).toBe("mismatch");
    expect(comp.mismatches).toContainEqual({ playerId: "p1", hole: 1, manual: 5, gg: 4 });
    expect(comp.reconcile.p1[2].status).toBe("from-gg");
  });

  it("is untouched by Golf Genius when there is no tie-in", () => {
    const round = baseRound({ scores: { p1: { 1: 5 } } });
    const comp = computeRound(round);
    expect(comp.cells.p1[1].gross).toBe(5);
    expect(comp.mismatches).toHaveLength(0);
  });

  it("lines the feed up with the play order on a shotgun start", () => {
    const round = baseRound({
      startHole: 7,
      // Golf Genius counts the 7th as hole 7; here it is the first hole played.
      gg: {
        ggid: "abc",
        eventId: "e1",
        roundId: "rd1",
        scores: { p1: { 7: 4 } },
        updatedAt: "2026-09-30T00:00:00.000Z",
      },
    });
    const comp = computeRound(round);
    // Position 1 is the 7th on the marker.
    expect(comp.cells.p1[1].gross).toBe(4);
    expect(comp.holes[0].onCourse).toBe(7);
  });
});
