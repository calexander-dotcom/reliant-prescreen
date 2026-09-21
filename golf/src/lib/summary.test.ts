import { describe, expect, it } from "vitest";
import { computeRound } from "./bets/index";
import { defaultOneDown } from "./bets/defaults";
import { buildRoundSummary } from "./summary";
import type { Course, Player, Round } from "./types";

const players: Player[] = [
  { id: "p1", name: "Charles", handicapIndex: 8, source: "manual" },
  { id: "p2", name: "Andrew", handicapIndex: 14, source: "manual" },
  { id: "p3", name: "Andy", handicapIndex: 3, source: "manual" },
  { id: "p4", name: "Dale", handicapIndex: 20, source: "manual" },
];

// Par 3s at 3, 7, 12 and 16, like most cards.
const holes = Array.from({ length: 18 }, (_, index) => ({
  number: index + 1,
  par: [3, 7, 12, 16].includes(index + 1) ? 3 : 4,
  yardage: null,
  strokeIndex: index + 1,
}));
const course: Course = {
  id: "c1",
  name: "Test",
  tees: [{ id: "t1", name: "White", courseRating: 70, slopeRating: 120, par: 68, yardage: null, holes }],
  source: "manual",
};

/**
 * Charles / Andrew win the flip and holes 1, 2 and 4, halve the 3rd and
 * press before the 4th; Andy / Dale win the 10th-tee flip and the 10th.
 * Greenies: 3 Charles, 7 Andrew, 12 Dale, 16 not entered yet.
 */
const round: Round = {
  id: "r1",
  date: "2026-09-21",
  courseName: "Streamsong Black",
  course,
  teeId: "t1",
  players,
  handicapMode: "none",
  holeCount: 18,
  scores: {
    p1: { 1: 4, 2: 4, 3: 3, 4: 4, 10: 5 },
    p2: { 1: 5, 2: 4, 3: 3, 4: 5, 10: 5 },
    p3: { 1: 5, 2: 5, 3: 3, 4: 5, 10: 4 },
    p4: { 1: 5, 2: 5, 3: 3, 4: 5, 10: 4 },
  },
  manual: {},
  bets: [
    {
      ...defaultOneDown(players, "od1"),
      manualPresses: { 3: 1 },
      teeFlipWinners: { 1: "p1", 10: "p3" },
      greenieWinners: { 3: "p1", 7: "p2", 12: "p4" },
    },
  ],
  perspectiveId: "p1",
  createdAt: "2026-09-21T00:00:00.000Z",
  updatedAt: "2026-09-21T00:00:00.000Z",
};

describe("the round as a text", () => {
  const text = buildRoundSummary(round, computeRound(round));
  const lines = text.split("\n");

  it("leads with the course and who is playing whom", () => {
    expect(lines[0]).toBe("Streamsong Black — 2026-09-21");
    expect(text).toContain("One downs — Charles / Andrew vs Andy / Dale, from Charles / Andrew's side");
  });

  it("gives each nine its final standing, with who pressed under it", () => {
    expect(text).toContain(
      "Front 9: +4/+3/+2/+1/+1/0 — Charles / Andrew up $50.00 each\n  Andy / Dale pressed before 4\nBack 9: -2/-1/0 — Andy / Dale up $20.00 each",
    );
    // Nothing hole by hole, no flips, no stars.
    expect(text).not.toContain("After each hole");
    expect(text).not.toContain("Tee flip");
    expect(text).not.toContain("*");
  });

  it("has the all-day bet, the greenies that were won, and the game's total", () => {
    expect(text).toContain(
      "All day ($20.00): Charles / Andrew 2 up — Charles / Andrew up $20.00 each",
    );
    expect(text).toContain("Greenies: 3 Charles, 7 Andrew, 12 Dale — Charles / Andrew up $10.00 each");
    expect(text).not.toContain("not entered");
    expect(text).toContain("One downs total: Charles / Andrew up $60.00 each");
  });

  it("ends with where everyone finished, and nothing about who pays whom", () => {
    expect(text.trimEnd().endsWith("Charles (20 gross): +$60.00\nAndrew (22 gross): +$60.00\nAndy (22 gross): -$60.00\nDale (22 gross): -$60.00")).toBe(true);
    expect(text).not.toContain("pays");
    expect(text).not.toContain("Settle");
  });

  it("names the presser from the flip on the tee, and says nothing when nobody has lost yet", () => {
    const withFlipPress: Round = {
      ...round,
      scores: {},
      bets: [{ ...defaultOneDown(players, "od1"), manualPresses: { 0: 1 }, teeFlipWinners: { 1: "p1" } }],
    };
    expect(buildRoundSummary(withFlipPress, computeRound(withFlipPress))).toContain(
      "Front 9: +1/0/0 — Charles / Andrew up $10.00 each\n  Andy / Dale pressed before 1",
    );
    const noFlip: Round = {
      ...round,
      scores: {},
      bets: [{ ...defaultOneDown(players, "od1"), manualPresses: { 0: 2 } }],
    };
    expect(buildRoundSummary(noFlip, computeRound(noFlip))).toContain(
      "Front 9: 0/0/0 — all square\n  2 presses before 1",
    );
  });

  it("keeps a fresh round short and skips games that are off", () => {
    const fresh: Round = {
      ...round,
      scores: {},
      bets: [{ ...defaultOneDown(players, "od1"), greenies: false, overallMultiplier: 0 }],
    };
    const blank = buildRoundSummary(fresh, computeRound(fresh));
    expect(blank).toContain("Front 9: 0 — all square\nBack 9: 0 — all square\nOne downs total: all square");
    expect(blank).not.toContain("Greenies");
    expect(blank).not.toContain("All day");
    expect(blank).not.toContain("gross");
  });
});
