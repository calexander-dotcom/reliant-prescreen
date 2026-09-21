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

  it("leads with the course and the game's terms", () => {
    expect(lines[0]).toBe("Streamsong Black — 2026-09-21 · 18 holes");
    expect(text).toContain(
      "One downs — $10.00 a bet per player, net, aggregate on 1, 3, 5, 7, 9 and 10, 12, 14, 16, 18",
    );
    expect(text).toContain(
      "Charles / Andrew vs Andy / Dale. Standing from Charles / Andrew's side: + is Charles / Andrew up. * is a press called by hand.",
    );
  });

  it("gives each nine its flip, standing, money, holes and presses", () => {
    expect(text).toContain("Tee flip on the 1st tee: Charles / Andrew won it.");
    expect(text).toContain("Front 9: +4/+3/+2/+1/+1*/0 — Charles / Andrew up $50.00 each");
    expect(text).toContain(
      "  After each hole: 1 +2/+1/0 · 2 +3/+2/+1/0 · 3 +3/+2/+1/0/0* · 4 +4/+3/+2/+1/+1*/0",
    );
    expect(text).toContain("  Extra presses: before 4");
    expect(text).toContain("Tee flip on the 10th tee: Andy / Dale won it.");
    expect(text).toContain("Back 9: -2/-1/0 — Andy / Dale up $20.00 each");
  });

  it("covers the overall, the greenies and the game's total", () => {
    expect(text).toContain(
      "Overall 18 ($20.00): Charles / Andrew 2 up — Charles / Andrew up $20.00 each",
    );
    expect(text).toContain(
      "Greenies: 2 to Charles / Andrew, 1 to Andy / Dale — Charles / Andrew up $10.00 each (1 par 3 not entered)",
    );
    expect(text).toContain("  3 Charles · 7 Andrew · 12 Dale · 16 not entered");
    expect(text).toContain("One downs total: Charles / Andrew up $60.00 each");
  });

  it("ends with scores, money and who pays whom", () => {
    expect(text).toContain("Scores\nCharles: 20 (15 out, 5 in) thru 5\n");
    expect(text).toContain("Money\nCharles: +$60.00\nAndrew: +$60.00\nAndy: -$60.00\nDale: -$60.00");
    const settle = text.slice(text.indexOf("Settle up"));
    expect(settle).toMatch(/pays (Charles|Andrew) \$60\.00/);
    expect((settle.match(/pays/g) ?? []).length).toBe(2);
  });

  it("says when the flips and greenies are not in yet, and skips games that are off", () => {
    const fresh: Round = {
      ...round,
      scores: {},
      bets: [{ ...defaultOneDown(players, "od1"), greenies: false, overallMultiplier: 0 }],
    };
    const blank = buildRoundSummary(fresh, computeRound(fresh));
    expect(blank).toContain("Tee flip on the 1st tee: not entered.");
    expect(blank).toContain("Front 9: 0 — all square");
    expect(blank).not.toContain("Greenies");
    expect(blank).not.toContain("Overall 18");
    expect(blank).not.toContain("Scores");
    expect(blank).toContain("Settle up\nNobody owes anybody.");
  });
});
