import { describe, expect, it } from "vitest";
import { sumCents } from "../money";
import type { SkinsConfig } from "../types";
import { evaluateSkins } from "./skins";

const ids = ["p1", "p2", "p3", "p4"];

function config(overrides: Partial<SkinsConfig> = {}): SkinsConfig {
  return {
    kind: "skins",
    id: "s1",
    label: "Skins",
    amount: 500,
    basis: "net",
    playerIds: ids,
    carryOver: true,
    requireBirdie: false,
    ...overrides,
  };
}

/** scores[hole][playerId] */
function lookup(scores: Record<number, Record<string, number>>) {
  return (playerId: string, hole: number) => scores[hole]?.[playerId] ?? null;
}

const par4 = () => 4;

describe("skins", () => {
  it("pays the outright low score by every other player", () => {
    const outcome = evaluateSkins(
      config(),
      18,
      lookup({ 1: { p1: 3, p2: 4, p3: 4, p4: 5 } }),
      par4,
    );
    expect(outcome.holes[0]).toMatchObject({
      settled: true,
      winnerId: "p1",
      valuePerLoser: 500,
      holesAtStake: 1,
    });
    expect(outcome.totals).toEqual({ p1: 1500, p2: -500, p3: -500, p4: -500 });
    expect(sumCents(Object.values(outcome.totals))).toBe(0);
  });

  it("carries a tied hole into the next one", () => {
    const outcome = evaluateSkins(
      config(),
      18,
      lookup({
        1: { p1: 4, p2: 4, p3: 5, p4: 5 },
        2: { p1: 3, p2: 4, p3: 4, p4: 4 },
      }),
      par4,
    );
    expect(outcome.holes[0]).toMatchObject({ tied: true, winnerId: null });
    expect(outcome.holes[1]).toMatchObject({
      winnerId: "p1",
      holesAtStake: 2,
      valuePerLoser: 1000,
    });
    expect(outcome.totals).toEqual({ p1: 3000, p2: -1000, p3: -1000, p4: -1000 });
    expect(sumCents(Object.values(outcome.totals))).toBe(0);
  });

  it("stacks multiple carried holes", () => {
    const outcome = evaluateSkins(
      config(),
      18,
      lookup({
        1: { p1: 4, p2: 4, p3: 5, p4: 5 },
        2: { p1: 4, p2: 4, p3: 5, p4: 5 },
        3: { p1: 3, p2: 4, p3: 4, p4: 4 },
      }),
      par4,
    );
    expect(outcome.holes[2].holesAtStake).toBe(3);
    expect(outcome.totals.p1).toBe(4500);
    expect(outcome.carryingHoles).toBe(1);
  });

  it("voids a tied hole when carryover is off", () => {
    const outcome = evaluateSkins(
      config({ carryOver: false }),
      18,
      lookup({
        1: { p1: 4, p2: 4, p3: 5, p4: 5 },
        2: { p1: 3, p2: 4, p3: 4, p4: 4 },
      }),
      par4,
    );
    expect(outcome.holes[1].holesAtStake).toBe(1);
    expect(outcome.totals.p1).toBe(1500);
  });

  it("waits for every player before settling a hole", () => {
    const outcome = evaluateSkins(
      config(),
      18,
      lookup({ 1: { p1: 3, p2: 4 } }),
      par4,
    );
    expect(outcome.holes[0].settled).toBe(false);
    expect(outcome.totals).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
  });

  it("requires a birdie when validation is on", () => {
    const outcome = evaluateSkins(
      config({ requireBirdie: true }),
      18,
      lookup({
        1: { p1: 4, p2: 5, p3: 5, p4: 5 },
        2: { p1: 3, p2: 4, p3: 4, p4: 4 },
      }),
      par4,
    );
    expect(outcome.holes[0]).toMatchObject({ notValidated: true, winnerId: null });
    // The unvalidated hole carries, so hole 2 is worth two skins.
    expect(outcome.holes[1].holesAtStake).toBe(2);
    expect(outcome.totals.p1).toBe(3000);
  });

  it("reports value still riding at the end of the round", () => {
    const outcome = evaluateSkins(
      config(),
      2,
      lookup({
        1: { p1: 4, p2: 4, p3: 5, p4: 5 },
        2: { p1: 4, p2: 4, p3: 5, p4: 5 },
      }),
      par4,
    );
    expect(outcome.carryingHoles).toBe(3);
    expect(outcome.totals).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
  });
});

describe("money by hole", () => {
  it("puts a carried skin on the hole it was finally won", () => {
    const outcome = evaluateSkins(
      config(),
      18,
      lookup({
        1: { p1: 4, p2: 4, p3: 5, p4: 5 },
        2: { p1: 3, p2: 4, p3: 4, p4: 4 },
      }),
      par4,
    );
    expect(outcome.holes[0].amounts).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
    // Two holes' worth, from each of three players.
    expect(outcome.holes[1].amounts).toEqual({ p1: 3000, p2: -1000, p3: -1000, p4: -1000 });
    expect(outcome.holes[2].amounts).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
  });

  it("adds the holes up to the totals", () => {
    const outcome = evaluateSkins(
      config(),
      18,
      lookup({
        1: { p1: 3, p2: 4, p3: 4, p4: 4 },
        5: { p1: 5, p2: 5, p3: 3, p4: 4 },
        11: { p1: 4, p2: 4, p3: 4, p4: 4 },
        12: { p1: 4, p2: 3, p3: 4, p4: 4 },
      }),
      par4,
    );
    for (const id of ids) {
      const byHole = outcome.holes.reduce((sum, hole) => sum + hole.amounts[id], 0);
      expect(byHole).toBe(outcome.totals[id]);
    }
    expect(sumCents(Object.values(outcome.totals))).toBe(0);
  });
});
