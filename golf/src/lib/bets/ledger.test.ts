import { describe, expect, it } from "vitest";
import { sumCents } from "../money";
import {
  balanceOnto,
  imbalance,
  isBalanced,
  ledgerRunning,
  ledgerStatus,
  ledgerTotals,
  teamTransfer,
} from "./ledger";

const ids = ["p1", "p2", "p3", "p4"];

describe("zero-sum hole entry", () => {
  it("accepts the money line from the brief: +20 / +30 / -40 / -10", () => {
    const amounts = { p1: 2000, p2: 3000, p3: -4000, p4: -1000 };
    expect(imbalance(amounts, ids)).toBe(0);
    expect(isBalanced(amounts, ids)).toBe(true);
  });

  it("reports how far a hole is from balancing", () => {
    const amounts = { p1: 2000, p2: 3000, p3: -4000, p4: -2000 };
    expect(imbalance(amounts, ids)).toBe(-1000);
    expect(isBalanced(amounts, ids)).toBe(false);
  });

  it("treats missing players as zero", () => {
    expect(imbalance({ p1: 2000, p3: -2000 }, ids)).toBe(0);
  });
});

describe("balanceOnto", () => {
  it("makes the banker absorb the other side of every bet", () => {
    const amounts = { p1: 0, p2: 3000, p3: -4000, p4: -1000 };
    const balanced = balanceOnto(amounts, "p1", ids);
    expect(balanced.p1).toBe(2000);
    expect(isBalanced(balanced, ids)).toBe(true);
  });

  it("is a no-op on an already balanced hole", () => {
    const amounts = { p1: 2000, p2: 3000, p3: -4000, p4: -1000 };
    expect(balanceOnto(amounts, "p1", ids)).toEqual(amounts);
  });
});

describe("teamTransfer", () => {
  it("moves money from every loser to every winner", () => {
    const amounts = teamTransfer(["p1", "p2"], ["p3", "p4"], 1000, ids);
    expect(amounts).toEqual({ p1: 2000, p2: 2000, p3: -2000, p4: -2000 });
    expect(sumCents(Object.values(amounts))).toBe(0);
  });

  it("handles a lone winner against three losers", () => {
    const amounts = teamTransfer(["p1"], ["p2", "p3", "p4"], 500, ids);
    expect(amounts.p1).toBe(1500);
    expect(sumCents(Object.values(amounts))).toBe(0);
  });
});

describe("ledger roll-up", () => {
  const manual = {
    1: { amounts: { p1: 2000, p2: 3000, p3: -4000, p4: -1000 } },
    2: { amounts: { p1: -1000, p2: -1000, p3: 1000, p4: 1000 } },
    // Hole 3 is out of balance and must not reach the totals.
    3: { amounts: { p1: 5000, p2: 0, p3: 0, p4: 0 } },
  };

  it("counts balanced holes only", () => {
    const totals = ledgerTotals(manual, ids, 18);
    expect(totals).toEqual({ p1: 1000, p2: 2000, p3: -3000, p4: 0 });
    expect(sumCents(Object.values(totals))).toBe(0);
  });

  it("flags the unbalanced hole", () => {
    const status = ledgerStatus(manual, ids, 18);
    expect(status[0].balanced).toBe(true);
    expect(status[2].balanced).toBe(false);
    expect(status[2].imbalance).toBe(5000);
    expect(status[3].entered).toBe(false);
  });

  it("tracks a cumulative running total per hole", () => {
    const running = ledgerRunning(manual, ids, 3);
    expect(running[0].p1).toBe(2000);
    expect(running[1].p1).toBe(1000);
    expect(running[1].p3).toBe(-3000);
  });
});
