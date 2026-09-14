import { describe, expect, it } from "vitest";
import { courseHandicap, resolveStrokes, strokesOnHole } from "./handicap";
import type { HoleInfo, Player, TeeSet } from "./types";

const tee: TeeSet = {
  id: "blue",
  name: "Blue",
  courseRating: 71.2,
  slopeRating: 125,
  par: 72,
  yardage: 6500,
  holes: [],
};

const holes: HoleInfo[] = Array.from({ length: 18 }, (_, index) => ({
  number: index + 1,
  par: 4,
  yardage: 400,
  strokeIndex: index + 1,
}));

describe("courseHandicap", () => {
  it("applies index x slope / 113 + (rating - par)", () => {
    // 12.4 * 125/113 = 13.717, minus 0.8 = 12.917 -> 13
    expect(courseHandicap(12.4, tee)).toBe(13);
    expect(courseHandicap(0, tee)).toBe(-1);
    expect(courseHandicap(20, tee)).toBe(21);
  });

  it("rounds plus handicaps away from zero", () => {
    expect(courseHandicap(-2.1, tee)).toBe(-3);
  });

  it("falls back to the raw index with no tee data", () => {
    expect(courseHandicap(12.4, null)).toBe(12);
    expect(courseHandicap(null, tee)).toBeNull();
  });
});

describe("strokesOnHole", () => {
  it("gives a stroke on the hardest holes first", () => {
    expect(strokesOnHole(12, 1)).toBe(1);
    expect(strokesOnHole(12, 12)).toBe(1);
    expect(strokesOnHole(12, 13)).toBe(0);
  });

  it("doubles up past 18", () => {
    expect(strokesOnHole(22, 4)).toBe(2);
    expect(strokesOnHole(22, 5)).toBe(1);
    expect(strokesOnHole(36, 18)).toBe(2);
  });

  it("takes strokes back from a plus handicap on the easiest holes", () => {
    expect(strokesOnHole(-2, 18)).toBe(-1);
    expect(strokesOnHole(-2, 17)).toBe(-1);
    expect(strokesOnHole(-2, 16)).toBe(0);
    expect(strokesOnHole(-2, 1)).toBe(0);
  });

  it("allocates across a nine-hole card", () => {
    expect(strokesOnHole(5, 5, 9)).toBe(1);
    expect(strokesOnHole(5, 6, 9)).toBe(0);
    expect(strokesOnHole(10, 1, 9)).toBe(2);
  });
});

describe("resolveStrokes", () => {
  const players: Player[] = [
    { id: "p1", name: "Low", handicapIndex: 4.0, source: "manual" },
    { id: "p2", name: "High", handicapIndex: 18.0, source: "manual" },
  ];

  it("gives the low player scratch in off-low mode", () => {
    const result = resolveStrokes(players, () => tee, holes, "off-low");
    // CH: 4.0 -> 4*125/113 - 0.8 = 3.625 -> 4; 18 -> 19.115 - 0.8 = 19.115 -> 19
    expect(result.p1.courseHandicap).toBe(4);
    expect(result.p2.courseHandicap).toBe(19);
    expect(result.p1.playingHandicap).toBe(0);
    expect(result.p2.playingHandicap).toBe(15);
    expect(result.p1.byHole[1]).toBe(0);
    expect(result.p2.byHole[15]).toBe(1);
    expect(result.p2.byHole[16]).toBe(0);
  });

  it("gives everyone their own handicap in full mode", () => {
    const result = resolveStrokes(players, () => tee, holes, "full");
    expect(result.p1.playingHandicap).toBe(4);
    expect(result.p2.playingHandicap).toBe(19);
    expect(result.p2.byHole[1]).toBe(2);
  });

  it("zeroes everything when handicaps are off", () => {
    const result = resolveStrokes(players, () => tee, holes, "none");
    expect(result.p2.playingHandicap).toBe(0);
    expect(result.p2.byHole[1]).toBe(0);
  });
});
