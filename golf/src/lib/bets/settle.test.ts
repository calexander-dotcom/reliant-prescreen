import { describe, expect, it } from "vitest";
import { sumCents } from "../money";
import { settle, settlementResidual } from "./settle";

describe("settle", () => {
  it("clears the brief's money line in three payments", () => {
    const transfers = settle({ p1: 2000, p2: 3000, p3: -4000, p4: -1000 });
    expect(transfers).toEqual([
      { fromId: "p3", toId: "p2", amount: 3000 },
      { fromId: "p3", toId: "p1", amount: 1000 },
      { fromId: "p4", toId: "p1", amount: 1000 },
    ]);
  });

  it("never needs more than n-1 payments", () => {
    const totals = { a: 5000, b: 1500, c: -2000, d: -4500 };
    const transfers = settle(totals);
    expect(transfers.length).toBeLessThanOrEqual(Object.keys(totals).length - 1);
    expect(sumCents(transfers.map((t) => t.amount))).toBe(5000 + 1500);
  });

  it("pays out exactly what each player is owed", () => {
    const totals = { a: 2500, b: -700, c: -1800 };
    const net: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (const transfer of settle(totals)) {
      net[transfer.fromId] -= transfer.amount;
      net[transfer.toId] += transfer.amount;
    }
    expect(net).toEqual(totals);
  });

  it("returns nothing when everyone is square", () => {
    expect(settle({ a: 0, b: 0 })).toEqual([]);
  });

  it("surfaces a residual when the books do not balance", () => {
    expect(settlementResidual({ a: 2000, b: -1000 })).toBe(1000);
    expect(settlementResidual({ a: 2000, b: -2000 })).toBe(0);
  });
});
