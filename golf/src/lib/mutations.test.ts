import { describe, expect, it } from "vitest";
import { isBalanced } from "./bets/ledger";
import { computeRound } from "./bets/index";
import {
  applyTeamTransfer,
  balanceHoleOnto,
  clearHoleMoney,
  removePlayer,
  setBanker,
  setManualAmount,
  setScore,
} from "./mutations";
import type { Player, Round } from "./types";

const players: Player[] = [
  { id: "p1", name: "Chris", handicapIndex: 8, source: "manual" },
  { id: "p2", name: "Dale", handicapIndex: 14, source: "manual" },
  { id: "p3", name: "Pat", handicapIndex: 3, source: "manual" },
  { id: "p4", name: "Sam", handicapIndex: 20, source: "manual" },
];
const ids = players.map((player) => player.id);

const base: Round = {
  id: "r1",
  date: "2026-09-14",
  courseName: "Test",
  course: null,
  teeId: null,
  players,
  handicapMode: "none",
  holeCount: 18,
  scores: {},
  manual: {},
  bets: [],
  createdAt: "2026-09-14T00:00:00.000Z",
  updatedAt: "2026-09-14T00:00:00.000Z",
};

describe("setManualAmount", () => {
  it("records the brief's hole one player at a time", () => {
    let round = base;
    round = setManualAmount(round, 7, "p1", 2000);
    round = setManualAmount(round, 7, "p2", 3000);
    round = setManualAmount(round, 7, "p3", -4000);
    round = setManualAmount(round, 7, "p4", -1000);

    expect(round.manual[7].amounts).toEqual({
      p1: 2000,
      p2: 3000,
      p3: -4000,
      p4: -1000,
    });
    expect(isBalanced(round.manual[7].amounts, ids)).toBe(true);
  });

  it("keeps a banker hole balanced on every keystroke", () => {
    let round = setBanker(base, 4, "p1");
    round = setManualAmount(round, 4, "p2", -1000);
    expect(round.manual[4].amounts.p1).toBe(1000);

    round = setManualAmount(round, 4, "p3", -1000);
    expect(round.manual[4].amounts.p1).toBe(2000);

    round = setManualAmount(round, 4, "p4", 3000);
    expect(round.manual[4].amounts.p1).toBe(-1000);
    expect(isBalanced(round.manual[4].amounts, ids)).toBe(true);
  });

  it("leaves a hole unbalanced when no banker is named", () => {
    const round = setManualAmount(base, 4, "p2", -1000);
    expect(isBalanced(round.manual[4].amounts, ids)).toBe(false);
    expect(computeRound(round).unbalancedHoles).toEqual([4]);
  });
});

describe("balance helpers", () => {
  it("pushes the remainder onto the chosen player", () => {
    let round = setManualAmount(base, 2, "p2", 3000);
    round = setManualAmount(round, 2, "p3", -4000);
    round = balanceHoleOnto(round, 2, "p1");
    expect(round.manual[2].amounts.p1).toBe(1000);
    expect(isBalanced(round.manual[2].amounts, ids)).toBe(true);
  });

  it("writes a team result in one go", () => {
    const round = applyTeamTransfer(base, 3, ["p1", "p2"], ["p3", "p4"], 1000);
    expect(round.manual[3].amounts).toEqual({
      p1: 2000,
      p2: 2000,
      p3: -2000,
      p4: -2000,
    });
  });

  it("clears a hole back to zero but keeps the banker", () => {
    let round = setBanker(base, 5, "p1");
    round = setManualAmount(round, 5, "p2", -2500);
    round = clearHoleMoney(round, 5);
    expect(round.manual[5].amounts).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
    expect(round.manual[5].bankerId).toBe("p1");
  });
});

describe("setScore", () => {
  it("stores and clears a score", () => {
    let round = setScore(base, "p1", 1, 4);
    expect(round.scores.p1[1]).toBe(4);
    round = setScore(round, "p1", 1, null);
    expect(round.scores.p1[1]).toBeNull();
  });
});

describe("removePlayer", () => {
  it("takes the player out of the money, the card and the bets", () => {
    let round = applyTeamTransfer(base, 1, ["p1", "p2"], ["p3", "p4"], 1000);
    round = setScore(round, "p4", 1, 5);
    round = setBanker(round, 2, "p4");
    round = {
      ...round,
      bets: [
        {
          kind: "skins",
          id: "s1",
          label: "Skins",
          amount: 500,
          basis: "gross",
          playerIds: ids,
          carryOver: true,
          requireBirdie: false,
        },
      ],
    };

    const next = removePlayer(round, "p4");
    expect(next.players.map((player) => player.id)).toEqual(["p1", "p2", "p3"]);
    expect(next.scores.p4).toBeUndefined();
    expect("p4" in next.manual[1].amounts).toBe(false);
    expect(next.manual[2].bankerId).toBeNull();
    expect(next.bets[0]).toMatchObject({ playerIds: ["p1", "p2", "p3"] });
  });

  it("leaves the remaining hole out of balance rather than inventing money", () => {
    // p4 was down $2000 on hole 1; dropping them cannot silently rewrite it.
    const round = removePlayer(
      applyTeamTransfer(base, 1, ["p1", "p2"], ["p3", "p4"], 1000),
      "p4",
    );
    expect(computeRound(round).unbalancedHoles).toEqual([1]);
  });
});

describe("autofilling the last player", () => {
  it("derives the fourth player once three are in", () => {
    let round = setManualAmount(base, 7, "p1", 2000);
    expect(round.manual[7].amounts.p4).toBe(0);

    round = setManualAmount(round, 7, "p2", 3000);
    expect(round.manual[7].amounts.p4).toBe(0);

    // Third one in: p4 is no longer a guess, it is whatever balances.
    round = setManualAmount(round, 7, "p3", -4000);
    expect(round.manual[7].amounts.p4).toBe(-1000);
    expect(isBalanced(round.manual[7].amounts, ids)).toBe(true);
  });

  it("keeps re-deriving as the others are corrected", () => {
    let round = setManualAmount(base, 7, "p1", 2000);
    round = setManualAmount(round, 7, "p2", 3000);
    round = setManualAmount(round, 7, "p3", -4000);
    expect(round.manual[7].amounts.p4).toBe(-1000);

    round = setManualAmount(round, 7, "p2", 1000);
    expect(round.manual[7].amounts.p4).toBe(1000);
    expect(isBalanced(round.manual[7].amounts, ids)).toBe(true);
  });

  it("stops deriving once that player is typed in directly", () => {
    let round = setManualAmount(base, 7, "p1", 2000);
    round = setManualAmount(round, 7, "p2", 3000);
    round = setManualAmount(round, 7, "p3", -4000);
    round = setManualAmount(round, 7, "p4", -2000);
    expect(round.manual[7].amounts.p4).toBe(-2000);

    // Everyone has been entered now, so the hole is simply out of balance.
    round = setManualAmount(round, 7, "p1", 2500);
    expect(round.manual[7].amounts.p4).toBe(-2000);
    expect(isBalanced(round.manual[7].amounts, ids)).toBe(false);
  });

  it("does not overwrite a real zero", () => {
    // p3 genuinely pushed: typing 0 counts as entered.
    let round = setManualAmount(base, 7, "p1", 1000);
    round = setManualAmount(round, 7, "p3", 0);
    round = setManualAmount(round, 7, "p2", 1000);
    expect(round.manual[7].amounts.p3).toBe(0);
    expect(round.manual[7].amounts.p4).toBe(-2000);
  });

  it("lets a named banker take precedence over the last-player rule", () => {
    let round = setBanker(base, 7, "p1");
    round = setManualAmount(round, 7, "p2", -1000);
    round = setManualAmount(round, 7, "p3", -1000);
    // The banker absorbs, rather than p4 being made to.
    expect(round.manual[7].amounts.p1).toBe(2000);
    expect(round.manual[7].amounts.p4).toBe(0);
  });

  it("starts over after the hole is cleared", () => {
    let round = setManualAmount(base, 7, "p1", 2000);
    round = setManualAmount(round, 7, "p2", 3000);
    round = setManualAmount(round, 7, "p3", -4000);
    round = clearHoleMoney(round, 7);
    expect(round.manual[7].touched).toEqual([]);

    round = setManualAmount(round, 7, "p1", 500);
    expect(round.manual[7].amounts.p4).toBe(0);
  });
});
