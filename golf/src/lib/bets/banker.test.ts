import { describe, expect, it } from "vitest";
import { sumCents } from "../money";
import type { BankerConfig } from "../types";
import { evaluateBanker } from "./banker";

const ids = ["a", "b", "c", "d"];

function config(overrides: Partial<BankerConfig> = {}): BankerConfig {
  return {
    kind: "banker",
    id: "bk1",
    label: "Banker",
    // These cases exercise the score-driven mode; manual has its own block.
    source: "scores",
    amount: 500,
    basis: "net",
    playerIds: ids,
    rotation: "most-money",
    firstBankerId: "a",
    bankerByHole: {},
    doubles: {},
    ...overrides,
  };
}

/** scores[hole][playerId] */
function lookup(scores: Record<number, Record<string, number>>) {
  return (playerId: string, hole: number) => scores[hole]?.[playerId] ?? null;
}

describe("banking a hole", () => {
  const hole1 = { 1: { a: 4, b: 5, c: 4, d: 6 } };

  it("plays the banker against every other player separately", () => {
    const outcome = evaluateBanker(config(), 18, lookup(hole1));
    const hole = outcome.holes[0];

    expect(hole.bankerId).toBe("a");
    expect(hole.settled).toBe(true);
    // Beat b and d, tied c: collects two stakes.
    expect(hole.amounts).toEqual({ a: 1000, b: -500, c: 0, d: -500 });
    expect(sumCents(Object.values(hole.amounts))).toBe(0);
  });

  it("pays nothing on a tie with the banker", () => {
    const outcome = evaluateBanker(config(), 18, lookup(hole1));
    const tied = outcome.holes[0].bets.find((bet) => bet.playerId === "c");
    expect(tied).toMatchObject({ delta: 0, score: 4 });
  });

  it("has the banker pay everybody on a bad hole", () => {
    const outcome = evaluateBanker(
      config(),
      18,
      lookup({ 1: { a: 6, b: 4, c: 5, d: 5 } }),
    );
    expect(outcome.holes[0].amounts).toEqual({ a: -1500, b: 500, c: 500, d: 500 });
  });

  it("moves no money until everyone has posted", () => {
    const outcome = evaluateBanker(config(), 18, lookup({ 1: { a: 4, b: 5 } }));
    expect(outcome.holes[0].settled).toBe(false);
    expect(outcome.totals).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });

  it("starts with the nominated banker, or the first player", () => {
    expect(evaluateBanker(config({ firstBankerId: "c" }), 18, lookup({})).holes[0].bankerId).toBe("c");
    expect(evaluateBanker(config({ firstBankerId: null }), 18, lookup({})).holes[0].bankerId).toBe("a");
    // An id that is not in the game is ignored rather than trusted.
    expect(evaluateBanker(config({ firstBankerId: "zz" }), 18, lookup({})).holes[0].bankerId).toBe("a");
  });
});

describe("doubling", () => {
  const scores = { 1: { a: 4, b: 5, c: 4, d: 6 } };

  it("doubles one opponent's bet and leaves the rest flat", () => {
    const outcome = evaluateBanker(
      config({ doubles: { 1: { b: 2 } } }),
      18,
      lookup(scores),
    );
    // b is on for $10, d still $5, c tied.
    expect(outcome.holes[0].amounts).toEqual({ a: 1500, b: -1000, c: 0, d: -500 });
    expect(sumCents(Object.values(outcome.holes[0].amounts))).toBe(0);
  });

  it("lets the banker double back to 4x against that player alone", () => {
    const outcome = evaluateBanker(
      config({ doubles: { 1: { b: 4 } } }),
      18,
      lookup(scores),
    );
    expect(outcome.holes[0].amounts).toEqual({ a: 2500, b: -2000, c: 0, d: -500 });
    expect(
      outcome.holes[0].bets.find((bet) => bet.playerId === "b"),
    ).toMatchObject({ multiplier: 4, delta: -2000 });
  });

  it("cuts both ways — a doubled player who wins collects double", () => {
    const outcome = evaluateBanker(
      config({ doubles: { 1: { b: 4 } } }),
      18,
      lookup({ 1: { a: 5, b: 4, c: 5, d: 5 } }),
      );
    expect(outcome.holes[0].amounts.b).toBe(2000);
    expect(outcome.holes[0].amounts.a).toBe(-2000);
  });

  it("treats junk multipliers as flat and caps runaway ones", () => {
    const outcome = evaluateBanker(
      config({ doubles: { 1: { b: 0, c: -3, d: 999 } } }),
      18,
      lookup({ 1: { a: 4, b: 5, c: 5, d: 5 } }),
    );
    const bets = outcome.holes[0].bets;
    expect(bets.find((bet) => bet.playerId === "b")?.multiplier).toBe(1);
    expect(bets.find((bet) => bet.playerId === "c")?.multiplier).toBe(1);
    expect(bets.find((bet) => bet.playerId === "d")?.multiplier).toBe(16);
  });
});

describe("passing the deal on most money", () => {
  it("keeps the deal with a banker who won the hole", () => {
    const outcome = evaluateBanker(
      config(),
      18,
      lookup({ 1: { a: 4, b: 5, c: 4, d: 6 } }),
    );
    expect(outcome.holes[0].bankerId).toBe("a");
    expect(outcome.holes[1].bankerId).toBe("a");
  });

  it("hands it to the biggest winner when the banker loses", () => {
    // a loses to everyone, so b, c and d all win the same: earliest takes it.
    const outcome = evaluateBanker(
      config(),
      18,
      lookup({ 1: { a: 6, b: 4, c: 5, d: 5 } }),
    );
    expect(outcome.holes[1].bankerId).toBe("b");
  });

  it("hands it to the one clear winner", () => {
    // Only c beats the banker, and by enough to be the sole winner.
    const outcome = evaluateBanker(
      config(),
      18,
      lookup({ 1: { a: 5, b: 5, c: 4, d: 5 } }),
    );
    expect(outcome.holes[0].amounts).toEqual({ a: -500, b: 0, c: 500, d: 0 });
    expect(outcome.holes[1].bankerId).toBe("c");
  });

  it("leaves the deal where it is when the hole halves out", () => {
    const outcome = evaluateBanker(
      config(),
      18,
      lookup({ 1: { a: 4, b: 4, c: 4, d: 4 } }),
    );
    expect(outcome.holes[0].amounts).toEqual({ a: 0, b: 0, c: 0, d: 0 });
    expect(outcome.holes[1].bankerId).toBe("a");
  });

  it("leaves the deal where it is on an unfinished hole", () => {
    const outcome = evaluateBanker(config(), 18, lookup({ 1: { a: 4, b: 5 } }));
    expect(outcome.holes[1].bankerId).toBe("a");
  });

  it("follows the deal through a full worked sequence", () => {
    const outcome = evaluateBanker(
      config(),
      18,
      lookup({
        1: { a: 4, b: 5, c: 4, d: 6 },
        2: { a: 6, b: 4, c: 5, d: 5 },
        3: { a: 5, b: 5, c: 4, d: 5 },
      }),
    );

    // a wins the 1st and keeps it; loses the 2nd so b takes it; on the 3rd
    // c is the only player to beat banker b, so c takes it next.
    expect(outcome.holes.slice(0, 4).map((hole) => hole.bankerId)).toEqual([
      "a",
      "a",
      "b",
      "c",
    ]);
    expect(sumCents(Object.values(outcome.totals))).toBe(0);
    expect(outcome.bankedCount).toMatchObject({ a: 2, b: 1 });
    expect(outcome.nextBankerId).toBe("c");
  });

  it("counts doubled money when deciding who won the most", () => {
    // d beats the banker flat, c beats it doubled: c won more, so c banks next.
    const outcome = evaluateBanker(
      config({ doubles: { 1: { c: 4 } } }),
      18,
      lookup({ 1: { a: 5, b: 6, c: 4, d: 4 } }),
    );
    expect(outcome.holes[0].amounts.c).toBe(2000);
    expect(outcome.holes[0].amounts.d).toBe(500);
    expect(outcome.holes[1].bankerId).toBe("c");
  });
});

describe("other rotations", () => {
  const scores = {
    1: { a: 4, b: 5, c: 4, d: 6 },
    2: { a: 6, b: 4, c: 5, d: 5 },
  };

  it("passes in player order", () => {
    const outcome = evaluateBanker(config({ rotation: "order" }), 18, lookup(scores));
    expect(outcome.holes.slice(0, 4).map((hole) => hole.bankerId)).toEqual([
      "a",
      "b",
      "c",
      "c",
    ]);
  });

  it("gives it to the low score on the hole", () => {
    const outcome = evaluateBanker(
      config({ rotation: "hole-winner" }),
      18,
      lookup(scores),
    );
    // a and c tie the 1st at 4; a holds it. b has the 2nd outright.
    expect(outcome.holes[1].bankerId).toBe("a");
    expect(outcome.holes[2].bankerId).toBe("b");
  });

  it("stays put when set to manual, until told otherwise", () => {
    const outcome = evaluateBanker(
      config({ rotation: "manual", bankerByHole: { 3: "d" } }),
      18,
      lookup(scores),
    );
    expect(outcome.holes.slice(0, 4).map((hole) => hole.bankerId)).toEqual([
      "a",
      "a",
      "d",
      "d",
    ]);
    expect(outcome.holes[2].bankerFrom).toBe("override");
  });

  it("takes a per-hole override even on an automatic rotation", () => {
    const outcome = evaluateBanker(
      config({ bankerByHole: { 2: "d" } }),
      18,
      lookup(scores),
    );
    expect(outcome.holes[1].bankerId).toBe("d");
  });
});

describe("edge cases", () => {
  it("does nothing with fewer than two players", () => {
    const outcome = evaluateBanker(
      config({ playerIds: ["a"] }),
      18,
      lookup({ 1: { a: 4 } }),
    );
    expect(outcome.holes).toEqual([]);
    expect(outcome.nextBankerId).toBeNull();
  });

  it("works heads-up", () => {
    const outcome = evaluateBanker(
      config({ playerIds: ["a", "b"] }),
      18,
      lookup({ 1: { a: 4, b: 5 } }),
    );
    expect(outcome.holes[0].amounts).toEqual({ a: 500, b: -500 });
  });

  it("stays zero-sum over a full round", () => {
    const scores: Record<number, Record<string, number>> = {};
    for (let hole = 1; hole <= 18; hole += 1) {
      scores[hole] = { a: 4 + (hole % 3), b: 5, c: 4, d: 3 + (hole % 2) };
    }
    const outcome = evaluateBanker(config(), 18, lookup(scores));
    expect(sumCents(Object.values(outcome.totals))).toBe(0);
    expect(outcome.holes.every((hole) => hole.settled)).toBe(true);
  });
});

describe("money-only mode", () => {
  const manual = config({ source: "manual" });
  /** What was typed into the hole ledger. */
  const entered = (holes: Record<number, Record<string, number>>) =>
    (hole: number) => holes[hole] ?? {};

  it("needs no scores at all", () => {
    const outcome = evaluateBanker(
      manual,
      18,
      () => null,
      entered({ 1: { a: 1500, b: -500, c: -500, d: -500 } }),
    );
    expect(outcome.holes[0].settled).toBe(true);
    expect(outcome.holes[0].amounts).toEqual({ a: 1500, b: -500, c: -500, d: -500 });
  });

  it("reports no money of its own, so the ledger is not counted twice", () => {
    const outcome = evaluateBanker(
      manual,
      18,
      () => null,
      entered({ 1: { a: 1500, b: -500, c: -500, d: -500 } }),
    );
    expect(outcome.tracksMoney).toBe(false);
    expect(outcome.totals).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });

  it("passes the deal on the money that was typed in", () => {
    const outcome = evaluateBanker(
      manual,
      18,
      () => null,
      entered({
        // a banks and wins, so keeps it.
        1: { a: 1500, b: -500, c: -500, d: -500 },
        // a banks and loses; c won the most, so c takes the deal.
        2: { a: -2000, b: 500, c: 1000, d: 500 },
      }),
    );
    expect(outcome.holes.slice(0, 3).map((hole) => hole.bankerId)).toEqual([
      "a",
      "a",
      "c",
    ]);
  });

  it("leaves the deal put until the hole balances", () => {
    const outcome = evaluateBanker(
      manual,
      18,
      () => null,
      // Off by $5: not a result yet.
      entered({ 1: { a: 1000, b: -500, c: 0, d: 0 } }),
    );
    expect(outcome.holes[0].settled).toBe(false);
    expect(outcome.holes[1].bankerId).toBe("a");
  });

  it("counts a hole as unplayed when nothing was entered", () => {
    const outcome = evaluateBanker(manual, 18, () => null, entered({}));
    expect(outcome.holes.every((hole) => !hole.settled)).toBe(true);
    expect(outcome.bankedCount).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });

  it("still tracks how many holes each player banked", () => {
    const outcome = evaluateBanker(
      manual,
      18,
      () => null,
      entered({
        1: { a: 1500, b: -500, c: -500, d: -500 },
        2: { a: -2000, b: 500, c: 1000, d: 500 },
        3: { c: 600, a: -200, b: -200, d: -200 },
      }),
    );
    expect(outcome.bankedCount).toMatchObject({ a: 2, c: 1 });
  });
});
