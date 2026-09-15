import { describe, expect, it } from "vitest";
import { sumCents } from "../money";
import type { Course, Player, Round } from "../types";
import { computeRound, holeResultFor } from "./index";

const course: Course = {
  id: "c1",
  name: "Test National",
  tees: [
    {
      id: "blue",
      name: "Blue",
      courseRating: 71.2,
      slopeRating: 125,
      par: 72,
      yardage: 6500,
      holes: Array.from({ length: 18 }, (_, index) => ({
        number: index + 1,
        par: 4,
        yardage: 400,
        strokeIndex: index + 1,
      })),
    },
  ],
  source: "manual",
};

const players: Player[] = [
  { id: "p1", name: "Chris", handicapIndex: 8.2, source: "manual" },
  { id: "p2", name: "Dale", handicapIndex: 14.6, source: "manual" },
  { id: "p3", name: "Pat", handicapIndex: 3.1, source: "manual" },
  { id: "p4", name: "Sam", handicapIndex: 20.0, source: "manual" },
];

function round(overrides: Partial<Round> = {}): Round {
  return {
    id: "r1",
    date: "2026-09-14",
    courseName: course.name,
    course,
    teeId: "blue",
    players,
    handicapMode: "off-low",
    holeCount: 18,
    scores: {},
    manual: {},
    bets: [],
    createdAt: "2026-09-14T12:00:00.000Z",
    updatedAt: "2026-09-14T12:00:00.000Z",
    ...overrides,
  };
}

describe("computeRound", () => {
  it("carries the brief's hole through to a settlement", () => {
    const result = computeRound(
      round({
        manual: {
          1: { amounts: { p1: 2000, p2: 3000, p3: -4000, p4: -1000 } },
        },
      }),
    );

    expect(result.grandTotals).toEqual({ p1: 2000, p2: 3000, p3: -4000, p4: -1000 });
    expect(result.residual).toBe(0);
    expect(result.unbalancedHoles).toEqual([]);
    expect(result.transfers).toEqual([
      { fromId: "p3", toId: "p2", amount: 3000 },
      { fromId: "p3", toId: "p1", amount: 1000 },
      { fromId: "p4", toId: "p1", amount: 1000 },
    ]);
  });

  it("keeps an unbalanced hole out of the totals and names it", () => {
    const result = computeRound(
      round({
        manual: {
          1: { amounts: { p1: 2000, p2: 3000, p3: -4000, p4: -1000 } },
          2: { amounts: { p1: 5000, p2: 0, p3: 0, p4: 0 } },
        },
      }),
    );
    expect(result.unbalancedHoles).toEqual([2]);
    expect(result.grandTotals.p1).toBe(2000);
    expect(result.residual).toBe(0);
  });

  it("resolves strokes off the low handicap", () => {
    const result = computeRound(round());
    // Pat is low, so Pat plays scratch and the rest get the difference.
    // Course handicaps are 8 / 15 / 3 / 21, so the low is Pat at 3.
    expect(result.strokes.p3.courseHandicap).toBe(3);
    expect(result.strokes.p3.playingHandicap).toBe(0);
    expect(result.strokes.p1.playingHandicap).toBe(5);
    expect(result.strokes.p2.playingHandicap).toBe(12);
    expect(result.strokes.p4.playingHandicap).toBe(18);
    // Exactly 18 strokes over 18 holes is one a hole.
    expect(result.strokes.p4.byHole[1]).toBe(1);
    expect(result.strokes.p4.byHole[18]).toBe(1);
  });

  it("totals gross and net per player", () => {
    const scores = {
      p1: Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i + 1, 5])),
      p3: Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i + 1, 4])),
    };
    const result = computeRound(round({ scores }));
    expect(result.totalsByPlayer.p1).toMatchObject({
      grossOut: 45,
      grossIn: 45,
      gross: 90,
      holesPosted: 18,
    });
    // 5 strokes off the low handicap.
    expect(result.totalsByPlayer.p1.net).toBe(85);
    expect(result.totalsByPlayer.p3.net).toBe(72);
    expect(result.totalsByPlayer.p2.holesPosted).toBe(0);
  });

  it("runs a nassau and the manual ledger side by side, still zero-sum", () => {
    const scores: Record<string, Record<number, number>> = { p1: {}, p2: {}, p3: {}, p4: {} };
    for (let hole = 1; hole <= 18; hole += 1) {
      // Team A (p1/p3) makes 4s, Team B (p2/p4) makes 5s: A wins every hole gross.
      scores.p1[hole] = 4;
      scores.p3[hole] = 4;
      scores.p2[hole] = 5;
      scores.p4[hole] = 5;
    }

    const result = computeRound(
      round({
        scores,
        manual: { 1: { amounts: { p1: 2000, p2: 3000, p3: -4000, p4: -1000 } } },
        bets: [
          {
            kind: "nassau",
            id: "n1",
            label: "Team nassau",
            amount: 2000,
            sides: [
              { id: "a", name: "A", playerIds: ["p1", "p3"] },
              { id: "b", name: "B", playerIds: ["p2", "p4"] },
            ],
            basis: "gross",
            autoPressAt: 0,
            maxPresses: 4,
            includeTotal: true,
            stakeMode: "per-side",
          },
        ],
      }),
    );

    // Front, back and total all won by side A at $20 each, split two ways.
    expect(result.betTotals).toEqual({ p1: 3000, p2: -3000, p3: 3000, p4: -3000 });
    expect(sumCents(Object.values(result.betTotals))).toBe(0);
    expect(sumCents(Object.values(result.grandTotals))).toBe(0);
    expect(result.grandTotals.p1).toBe(5000);
  });

  it("falls back to a plain par-4 card with no course loaded", () => {
    const result = computeRound(
      round({ course: null, teeId: null, holeCount: 18, handicapMode: "none" }),
    );
    expect(result.holes).toHaveLength(18);
    expect(result.holes[0]).toMatchObject({ number: 1, par: 4, strokeIndex: 1 });
    expect(result.tee).toBeNull();
  });

  it("scores a nine-hole round", () => {
    const result = computeRound(round({ holeCount: 9 }));
    expect(result.holes).toHaveLength(9);
  });
});

describe("holeResultFor", () => {
  const sides: [{ id: string; name: string; playerIds: string[] }, { id: string; name: string; playerIds: string[] }] = [
    { id: "a", name: "A", playerIds: ["p1", "p2"] },
    { id: "b", name: "B", playerIds: ["p3", "p4"] },
  ];

  it("compares the best ball on each side", () => {
    const scores: Record<string, number> = { p1: 5, p2: 4, p3: 5, p4: 6 };
    expect(holeResultFor(sides, 1, (id) => scores[id] ?? null)).toBe(1);
  });

  it("halves a hole when the best balls match", () => {
    const scores: Record<string, number> = { p1: 5, p2: 4, p3: 4, p4: 6 };
    expect(holeResultFor(sides, 1, (id) => scores[id] ?? null)).toBe(0);
  });

  it("waits for a score on both sides", () => {
    const scores: Record<string, number> = { p1: 4, p2: 5 };
    expect(holeResultFor(sides, 1, (id) => scores[id] ?? null)).toBeNull();
  });
});

describe("banker in money-only mode", () => {
  const bankerBet = {
    kind: "banker" as const,
    id: "bk1",
    label: "Banker",
    source: "manual" as const,
    amount: 500,
    basis: "net" as const,
    playerIds: ["p1", "p2", "p3", "p4"],
    rotation: "most-money" as const,
    firstBankerId: "p1",
    bankerByHole: {},
    doubles: {},
  };

  it("does not double-count the money typed into the hole", () => {
    const withBet = computeRound(
      round({
        bets: [bankerBet],
        manual: { 1: { amounts: { p1: 3000, p2: -1000, p3: -1000, p4: -1000 } } },
      }),
    );
    const withoutBet = computeRound(
      round({
        manual: { 1: { amounts: { p1: 3000, p2: -1000, p3: -1000, p4: -1000 } } },
      }),
    );

    // The banker bet tracks the deal; the ledger is the only source of money.
    expect(withBet.betTotals).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
    expect(withBet.grandTotals).toEqual(withoutBet.grandTotals);
    expect(withBet.grandTotals.p1).toBe(3000);
    expect(sumCents(Object.values(withBet.grandTotals))).toBe(0);
  });

  it("reads the deal off the money without any scores", () => {
    const result = computeRound(
      round({
        bets: [bankerBet],
        manual: {
          1: { amounts: { p1: 3000, p2: -1000, p3: -1000, p4: -1000 } },
          2: { amounts: { p1: -3000, p2: 500, p3: 2000, p4: 500 } },
        },
      }),
    );
    const banker = result.betResults.find((entry) => entry.kind === "banker");
    expect(banker?.kind).toBe("banker");
    if (banker?.kind !== "banker") return;
    // p1 wins the 1st and keeps the deal; p3 wins the most on the 2nd.
    expect(banker.outcome.holes.slice(0, 3).map((hole) => hole.bankerId)).toEqual([
      "p1",
      "p1",
      "p3",
    ]);
  });
});
