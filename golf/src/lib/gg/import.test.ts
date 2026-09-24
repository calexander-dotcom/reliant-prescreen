import { describe, expect, it } from "vitest";
import type { Player, Round } from "../types";
import { applyGgScores, matchPlayers, parsePastedScores } from "./import";

const players: Player[] = [
  { id: "p1", name: "Chris Alexander", handicapIndex: 8, source: "manual" },
  { id: "p2", name: "Dale Murphy", handicapIndex: 14, source: "manual" },
  { id: "p3", name: "Pat Riley", handicapIndex: 3, source: "manual" },
  { id: "p4", name: "Sam Snead", handicapIndex: 20, source: "manual" },
];

function round(overrides: Partial<Round> = {}): Round {
  return {
    id: "r1", date: "2026-09-24", courseName: "Test", course: null, teeId: null,
    players, handicapMode: "none", holeCount: 18, scores: {}, manual: {}, bets: [],
    createdAt: "x", updatedAt: "x", ...overrides,
  };
}

describe("parsePastedScores", () => {
  it("reads a name then eighteen scores", () => {
    const f = parsePastedScores("Chris 4 5 3 4 4 5 4 3 4 4 5 4 4 3 5 4 4 4");
    expect(f.players).toHaveLength(1);
    expect(f.players[0].name).toBe("Chris");
    expect(f.players[0].holes).toHaveLength(18);
    expect(f.players[0].holes[0]).toEqual({ hole: 1, strokes: 4 });
    expect(f.players[0].holes[2]).toEqual({ hole: 3, strokes: 3 });
  });

  it("takes tabs, commas or wide spaces between cells", () => {
    const tab = parsePastedScores("Dale Murphy\t5\t4\t6");
    expect(tab.players[0].name).toBe("Dale Murphy");
    expect(tab.players[0].holes.map((h) => h.strokes)).toEqual([5, 4, 6]);
    const csv = parsePastedScores("Pat Riley,3,4,4");
    expect(csv.players[0].holes.map((h) => h.strokes)).toEqual([3, 4, 4]);
  });

  it("reads blanks and dashes as holes not played", () => {
    const f = parsePastedScores("Sam, 4, -, , 5");
    expect(f.players[0].holes.map((h) => h.strokes)).toEqual([4, null, null, 5]);
  });

  it("uses a header row of hole numbers when the paste has one", () => {
    const f = parsePastedScores("Hole 7 8 9 10\nChris 4 5 3 4");
    expect(f.players[0].holes.map((h) => h.hole)).toEqual([7, 8, 9, 10]);
    expect(f.players[0].holes.map((h) => h.strokes)).toEqual([4, 5, 3, 4]);
  });

  it("drops a trailing total by keeping only holeCount scores", () => {
    const nine = parsePastedScores("Chris 4 5 3 4 4 5 4 3 4 36", 9);
    expect(nine.players[0].holes).toHaveLength(9);
    expect(nine.players[0].holes.at(-1)).toEqual({ hole: 9, strokes: 4 });
  });
});

describe("matchPlayers", () => {
  it("matches on the full name, or the first name alone", () => {
    const f = parsePastedScores("Chris 4\nDale 5\nPat 3\nSam 6");
    const m = matchPlayers(f, players);
    expect(m.mapping).toEqual({ Chris: "p1", Dale: "p2", Pat: "p3", Sam: "p4" });
    expect(m.unmatchedGg).toEqual([]);
    expect(m.unmatchedRound).toEqual([]);
  });

  it("leaves a name nobody matches unmapped rather than guessing", () => {
    const f = parsePastedScores("Chris 4\nStranger 5");
    const m = matchPlayers(f, players);
    expect(m.mapping).toEqual({ Chris: "p1" });
    expect(m.unmatchedGg).toEqual(["Stranger"]);
    expect(m.unmatchedRound).toContain("p2");
  });

  it("does not put two Golf Genius names on one player", () => {
    // Two names both first-matching "Chris" — the second finds nobody free.
    const f = parsePastedScores("Chris 4\nChris A 5");
    const m = matchPlayers(f, players);
    expect(Object.values(m.mapping)).toHaveLength(1);
  });
});

describe("applyGgScores", () => {
  it("writes matched scores into the round", () => {
    const f = parsePastedScores("Chris 4 5 3\nDale 5 4 6");
    const m = matchPlayers(f, players);
    const { round: next, applied, skipped } = applyGgScores(round(), f, m.mapping);
    expect(applied).toBe(6);
    expect(skipped).toBe(0);
    expect(next.scores.p1[1]).toBe(4);
    expect(next.scores.p1[3]).toBe(3);
    expect(next.scores.p2[2]).toBe(4);
  });

  it("converts Golf Genius hole numbers to play positions on a shotgun start", () => {
    // Started on the 7th: GG's hole 7 is this round's 1st position, 8 the 2nd.
    const f: ReturnType<typeof parsePastedScores> = {
      players: [{ name: "Chris", holes: [
        { hole: 7, strokes: 4 },
        { hole: 8, strokes: 5 },
        { hole: 6, strokes: 6 }, // last hole played, position 18
      ] }],
    };
    const m = matchPlayers(f, players);
    const { round: next } = applyGgScores(round({ startHole: 7 }), f, m.mapping);
    expect(next.scores.p1[1]).toBe(4); // position 1 = GG hole 7
    expect(next.scores.p1[2]).toBe(5); // position 2 = GG hole 8
    expect(next.scores.p1[18]).toBe(6); // position 18 = GG hole 6
  });

  it("skips a hole outside the card and never blanks an existing score", () => {
    const f: ReturnType<typeof parsePastedScores> = {
      players: [{ name: "Chris", holes: [
        { hole: 1, strokes: 4 },
        { hole: 19, strokes: 9 },
        { hole: 2, strokes: null },
      ] }],
    };
    const seeded = round({ scores: { p1: { 2: 7 } } });
    const { round: next, applied, skipped } = applyGgScores(seeded, f, matchPlayers(f, players).mapping);
    expect(applied).toBe(1);
    expect(skipped).toBe(1);
    expect(next.scores.p1[2]).toBe(7); // the null did not wipe the seeded 7
  });
});
