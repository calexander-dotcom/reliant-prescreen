import { describe, expect, it } from "vitest";
import { sumCents } from "../money";
import type { Course, Player, Round, Side } from "../types";
import { aggregateHoles, computeRound, holeResultAggregate, holeResultFor } from "./index";

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

describe("money by nine", () => {
  const expectAddsUp = (result: ReturnType<typeof computeRound>) => {
    for (const player of players) {
      const { front, back, overall } = result.nineTotals;
      expect(front[player.id] + back[player.id] + overall[player.id]).toBe(
        result.grandTotals[player.id],
      );
    }
  };

  it("splits hand-entered money at the turn", () => {
    const result = computeRound(
      round({
        manual: {
          1: { amounts: { p1: 2000, p2: 3000, p3: -4000, p4: -1000 } },
          9: { amounts: { p1: 1000, p2: -1000, p3: 0, p4: 0 } },
          10: { amounts: { p1: -500, p2: -500, p3: 1000, p4: 0 } },
        },
      }),
    );
    expect(result.nineTotals.front).toEqual({ p1: 3000, p2: 2000, p3: -4000, p4: -1000 });
    expect(result.nineTotals.back).toEqual({ p1: -500, p2: -500, p3: 1000, p4: 0 });
    expect(result.nineTotals.overall).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
    expect(result.nineTotals.hasOverall).toBe(false);
    expectAddsUp(result);
  });

  it("gives one downs a front, a back and the 18 on its own", () => {
    const scores: Record<string, Record<number, number>> = { p1: {}, p2: {}, p3: {}, p4: {} };
    for (let hole = 1; hole <= 18; hole += 1) {
      // Team A (p1/p3) takes the front; Team B (p2/p4) takes the back except
      // a halved 18th, so A is one up over the eighteen.
      const aWins = hole <= 9;
      const halved = hole === 18;
      scores.p1[hole] = halved ? 4 : aWins ? 4 : 5;
      scores.p3[hole] = halved ? 4 : aWins ? 4 : 5;
      scores.p2[hole] = halved ? 4 : aWins ? 5 : 4;
      scores.p4[hole] = halved ? 4 : aWins ? 5 : 4;
    }
    const result = computeRound(
      round({
        scores,
        bets: [
          {
            kind: "onedown",
            id: "od1",
            label: "One downs",
            amount: 1000,
            sides: [
              { id: "a", name: "A", playerIds: ["p1", "p3"] },
              { id: "b", name: "B", playerIds: ["p2", "p4"] },
            ],
            basis: "gross",
            autoPressAt: 0,
            manualPresses: {},
            reset: "nines",
            overallMultiplier: 2,
            stakeMode: "per-side",
          },
        ],
      }),
    );
    expect(result.nineTotals.front).toEqual({ p1: 500, p2: -500, p3: 500, p4: -500 });
    expect(result.nineTotals.back).toEqual({ p1: -500, p2: 500, p3: -500, p4: 500 });
    expect(result.nineTotals.overall).toEqual({ p1: 1000, p2: -1000, p3: 1000, p4: -1000 });
    expect(result.nineTotals.hasOverall).toBe(true);
    expectAddsUp(result);
  });

  it("treats a one-down stack over the whole round as the round's, not a nine's", () => {
    const scores: Record<string, Record<number, number>> = { p1: {}, p2: {}, p3: {}, p4: {} };
    for (let hole = 1; hole <= 18; hole += 1) {
      scores.p1[hole] = 4;
      scores.p3[hole] = 4;
      scores.p2[hole] = 5;
      scores.p4[hole] = 5;
    }
    const result = computeRound(
      round({
        scores,
        bets: [
          {
            kind: "onedown",
            id: "od1",
            label: "One downs",
            amount: 1000,
            sides: [
              { id: "a", name: "A", playerIds: ["p1", "p3"] },
              { id: "b", name: "B", playerIds: ["p2", "p4"] },
            ],
            basis: "gross",
            autoPressAt: 0,
            manualPresses: {},
            reset: "round",
            overallMultiplier: 0,
            stakeMode: "per-side",
          },
        ],
      }),
    );
    expect(result.nineTotals.front).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
    expect(result.nineTotals.back).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
    expect(result.nineTotals.overall.p1).toBe(500);
    expect(result.nineTotals.hasOverall).toBe(true);
    expectAddsUp(result);
  });

  it("keeps a nassau's Total 18 out of both nines", () => {
    const scores: Record<string, Record<number, number>> = { p1: {}, p2: {}, p3: {}, p4: {} };
    for (let hole = 1; hole <= 18; hole += 1) {
      scores.p1[hole] = 4;
      scores.p3[hole] = 4;
      scores.p2[hole] = 5;
      scores.p4[hole] = 5;
    }
    const result = computeRound(
      round({
        scores,
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
    expect(result.nineTotals.front.p1).toBe(1000);
    expect(result.nineTotals.back.p1).toBe(1000);
    expect(result.nineTotals.overall.p1).toBe(1000);
    expect(result.nineTotals.hasOverall).toBe(true);
    expectAddsUp(result);
  });

  it("puts a nine-hole round entirely on the front", () => {
    const result = computeRound(
      round({
        holeCount: 9,
        manual: {
          2: { amounts: { p1: 1000, p2: -1000, p3: 0, p4: 0 } },
          8: { amounts: { p1: 0, p2: 0, p3: 500, p4: -500 } },
        },
      }),
    );
    expect(result.nineTotals.front).toEqual({ p1: 1000, p2: -1000, p3: 500, p4: -500 });
    expect(result.nineTotals.back).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
    expect(result.nineTotals.hasOverall).toBe(false);
    expectAddsUp(result);
  });
});

describe("greenies in the round", () => {
  const par3Course: Course = {
    ...course,
    tees: [
      {
        ...course.tees[0],
        holes: course.tees[0].holes.map((hole) =>
          [3, 7, 12, 16].includes(hole.number) ? { ...hole, par: 3 } : hole,
        ),
      },
    ],
  };
  const oneDown = (winners: Record<number, string | null>) => ({
    kind: "onedown" as const,
    id: "od1",
    label: "One downs",
    amount: 1000,
    sides: [
      { id: "a", name: "A", playerIds: ["p1", "p3"] },
      { id: "b", name: "B", playerIds: ["p2", "p4"] },
    ] as [Side, Side],
    basis: "gross" as const,
    autoPressAt: 0,
    manualPresses: {},
    reset: "nines" as const,
    overallMultiplier: 0,
    stakeMode: "per-player" as const,
    greenies: true,
    greenieWinners: winners,
  });

  it("lands each greenie on its nine and a sweep on the round", () => {
    const result = computeRound(
      round({ course: par3Course, bets: [oneDown({ 3: "p1", 7: "p3", 12: "p1", 16: "p3" })] }),
    );
    expect(result.grandTotals).toEqual({ p1: 8000, p2: -8000, p3: 8000, p4: -8000 });
    expect(result.nineTotals.front.p1).toBe(2000);
    expect(result.nineTotals.back.p1).toBe(2000);
    expect(result.nineTotals.overall.p1).toBe(4000);
    expect(result.nineTotals.hasOverall).toBe(true);
  });

  it("asks nothing where there are no par 3s", () => {
    const result = computeRound(round({ bets: [oneDown({ 3: "p1" })] }));
    const oneDownResult = result.betResults[0];
    expect(oneDownResult.kind === "onedown" && oneDownResult.outcome.greenies.holes).toEqual([]);
    expect(result.grandTotals.p1).toBe(0);
  });
});

describe("aggregate on alternate holes", () => {
  const sides: [Side, Side] = [
    { id: "a", name: "A", playerIds: ["p1", "p2"] },
    { id: "b", name: "B", playerIds: ["p3", "p4"] },
  ];
  // Best ball says A (a 3 beats a 4); the totals say B (8 beats 9).
  const split: Record<string, number> = { p1: 3, p2: 6, p3: 4, p4: 4 };
  const score = (id: string) => split[id] ?? null;

  it("names the aggregate holes: the first of each nine and every other one after", () => {
    expect(aggregateHoles(18)).toEqual([1, 3, 5, 7, 9, 10, 12, 14, 16, 18]);
    expect(aggregateHoles(9)).toEqual([1, 3, 5, 7, 9]);
  });

  it("adds both partners' scores and can disagree with best ball", () => {
    expect(holeResultFor(sides, 1, score)).toBe(1);
    expect(holeResultAggregate(sides, 1, score)).toBe(-1);
    expect(holeResultAggregate(sides, 1, (id) => ({ p1: 4, p2: 4, p3: 3, p4: 5 })[id] ?? null)).toBe(0);
  });

  it("waits for every score on both sides", () => {
    expect(holeResultAggregate(sides, 1, (id) => (id === "p2" ? null : score(id)))).toBeNull();
  });

  it("falls back to best ball when the sides are uneven", () => {
    const uneven: [Side, Side] = [
      { id: "a", name: "A", playerIds: ["p1", "p2"] },
      { id: "b", name: "B", playerIds: ["p3"] },
    ];
    expect(holeResultAggregate(uneven, 1, score)).toBe(holeResultFor(uneven, 1, score));
  });

  it("applies to the alternate holes only, when turned on", () => {
    const scores: Record<string, Record<number, number>> = { p1: {}, p2: {}, p3: {}, p4: {} };
    for (const hole of [1, 2]) {
      scores.p1[hole] = 3;
      scores.p2[hole] = 6;
      scores.p3[hole] = 4;
      scores.p4[hole] = 4;
    }
    const bet = {
      kind: "onedown" as const,
      id: "od1",
      label: "One downs",
      amount: 1000,
      sides: [
        { id: "a", name: "A", playerIds: ["p1", "p2"] },
        { id: "b", name: "B", playerIds: ["p3", "p4"] },
      ] as [Side, Side],
      basis: "gross" as const,
      autoPressAt: 0,
      manualPresses: {},
      reset: "nines" as const,
      overallMultiplier: 0,
      stakeMode: "per-player" as const,
      greenies: false,
    };
    // Unset means on, so a round from before the option existed plays it too.
    const bestBall = computeRound(
      round({ scores, handicapMode: "none", bets: [{ ...bet, alternateAggregate: false }] }),
    );
    const aggregate = computeRound(round({ scores, handicapMode: "none", bets: [bet] }));
    const margin = (result: ReturnType<typeof computeRound>) => {
      const one = result.betResults[0];
      return one.kind === "onedown" ? one.outcome.stacks[0].bets[0].margin : NaN;
    };
    // Best ball: A takes both holes. Aggregate: B takes the 1st, A the 2nd.
    expect(margin(bestBall)).toBe(2);
    expect(margin(aggregate)).toBe(0);
  });
});
