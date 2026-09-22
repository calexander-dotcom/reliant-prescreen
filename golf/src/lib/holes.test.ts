import { describe, expect, it } from "vitest";
import { holeAt, normaliseStartHole, playOrder, positionOf, startsOnFirst } from "./holes";

describe("play order", () => {
  it("is the plain hole order when the round starts on the 1st", () => {
    expect(playOrder(1, 18)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
    ]);
  });

  it("wraps past the 18th for a shotgun start", () => {
    expect(playOrder(7, 18)).toEqual([
      7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6,
    ]);
  });

  it("puts the front nine on 7 through 15 for a start on the 7th", () => {
    const order = playOrder(7, 18);
    expect(order.slice(0, 9)).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(order[9]).toBe(16);
  });

  it("plays aggregate on the odd positions of each nine", () => {
    const order = playOrder(7, 18);
    const aggregate = order.filter((_, i) => i % 9 === 0 || (i % 9) % 2 === 0);
    expect(aggregate).toEqual([7, 9, 11, 13, 15, 16, 18, 2, 4, 6]);
  });

  it("handles a nine-hole card", () => {
    expect(playOrder(4, 9)).toEqual([4, 5, 6, 7, 8, 9, 1, 2, 3]);
  });

  it("round-trips every position against its hole", () => {
    for (const start of [1, 2, 7, 10, 18]) {
      for (let position = 1; position <= 18; position += 1) {
        expect(positionOf(holeAt(position, start, 18), start, 18)).toBe(position);
      }
    }
  });
});

describe("normaliseStartHole", () => {
  it("keeps a hole that fits the card", () => {
    expect(normaliseStartHole(7, 18)).toBe(7);
    expect(normaliseStartHole(18, 18)).toBe(18);
  });

  it("falls back to the 1st for anything unusable", () => {
    for (const bad of [0, -3, 19, 2.5, Number.NaN, undefined, null]) {
      expect(normaliseStartHole(bad as number, 18)).toBe(1);
    }
  });

  it("rejects a hole past the end of a nine-hole card", () => {
    expect(normaliseStartHole(12, 9)).toBe(1);
  });

  it("recognises a round played straight through", () => {
    expect(startsOnFirst(undefined)).toBe(true);
    expect(startsOnFirst(1)).toBe(true);
    expect(startsOnFirst(7)).toBe(false);
  });
});
