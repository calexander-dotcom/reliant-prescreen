import { describe, expect, it } from "vitest";
import {
  courseFromGg,
  effectiveScores,
  foursomeFromGg,
  parseGgIndex,
  reconcileScores,
  scoreMismatches,
  type GgPairingGroup,
} from "./normalize";

const tee = {
  name: "Blue",
  id: "tee1",
  course_id: "c1",
  hole_data: {
    par: [4, 4, 5, 3, 4, 4, 3, 4, 5, 4, 3, 5, 4, 3, 4, 5, 4, 4],
    yardage: Array(18).fill(400),
    handicap: [17, 11, 9, 13, 7, 1, 15, 3, 5, 12, 14, 10, 18, 16, 4, 2, 6, 8],
  },
  slope_and_rating: { all18: { rating: 71.8, slope: 132 } },
};

const group: GgPairingGroup = {
  foursome_ggid: "abc123",
  players: [
    { name: "A Plus", handicap_index: "+2.0", course_handicap: "+3", player_roster_id: "p1", tee,
      score_array: [4, 5, 3, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0, 0, 0] },
    { name: "B Mid", handicap_index: "0.1", player_roster_id: "p2", tee, score_array: [] },
  ],
};

describe("parseGgIndex", () => {
  it("flips a plus handicap to negative", () => {
    expect(parseGgIndex("+2.0")).toBe(-2);
  });
  it("passes a normal index through", () => {
    expect(parseGgIndex("4.8")).toBe(4.8);
    expect(parseGgIndex("0")).toBe(0);
  });
  it("returns null for blanks and junk", () => {
    expect(parseGgIndex("")).toBeNull();
    expect(parseGgIndex(undefined)).toBeNull();
    expect(parseGgIndex("NH")).toBeNull();
  });
});

describe("courseFromGg", () => {
  it("builds a tee with par and stroke index per hole", () => {
    const course = courseFromGg(tee)!;
    expect(course.source).toBe("gg");
    const t = course.tees[0];
    expect(t.holes).toHaveLength(18);
    expect(t.holes[0]).toMatchObject({ number: 1, par: 4, strokeIndex: 17 });
    expect(t.par).toBe(72);
    expect(t.slopeRating).toBe(132);
  });
  it("returns null without hole data", () => {
    expect(courseFromGg(undefined)).toBeNull();
  });
});

describe("foursomeFromGg", () => {
  it("maps players, handicaps, course and scores", () => {
    const f = foursomeFromGg(group, "Pebble");
    expect(f.ggid).toBe("abc123");
    expect(f.course?.name).toBe("Pebble");
    expect(f.players.map((p) => p.name)).toEqual(["A Plus", "B Mid"]);
    expect(f.players[0].handicapIndex).toBe(-2);
    expect(f.players[0].source).toBe("gg");
    // first three holes scored, the rest (and the 3 trailing playoff cells) null
    expect(f.scores.p1[1]).toBe(4);
    expect(f.scores.p1[3]).toBe(3);
    expect(f.scores.p1[4]).toBeNull();
    expect(Object.keys(f.scores.p1)).toHaveLength(18);
    expect(f.scores.p2[1]).toBeNull();
  });
});

describe("reconcileScores (manual is yours; Golf Genius cross-checks)", () => {
  it("flags a hole where your entry and Golf Genius disagree", () => {
    const r = reconcileScores({ p1: { 1: 5 } }, { p1: { 1: 4 } }, 1);
    expect(r.p1[1].status).toBe("mismatch");
    expect(r.p1[1].value).toBe(5); // your entry is kept, not overwritten
    expect(r.p1[1].manual).toBe(5);
    expect(r.p1[1].gg).toBe(4);
  });
  it("marks a hole you left blank as filled from Golf Genius", () => {
    const r = reconcileScores({ p1: {} }, { p1: { 1: 4 } }, 1);
    expect(r.p1[1].status).toBe("from-gg");
    expect(r.p1[1].value).toBe(4);
  });
  it("keeps your entry when Golf Genius has not caught up", () => {
    const r = reconcileScores({ p1: { 1: 5 } }, { p1: {} }, 1);
    expect(r.p1[1].status).toBe("manual");
    expect(r.p1[1].value).toBe(5);
  });
  it("agrees quietly when both match", () => {
    const r = reconcileScores({ p1: { 1: 4 } }, { p1: { 1: 4 } }, 1);
    expect(r.p1[1].status).toBe("match");
  });
});

describe("effectiveScores / scoreMismatches", () => {
  it("plays off your entry, else the feed", () => {
    const r = reconcileScores({ p1: { 1: 5, 2: null } }, { p1: { 1: 4, 2: 3 } }, 2);
    const eff = effectiveScores(r);
    expect(eff.p1[1]).toBe(5); // mismatch keeps yours
    expect(eff.p1[2]).toBe(3); // blank filled from GG
  });
  it("lists only the red cells", () => {
    const r = reconcileScores({ p1: { 1: 5, 2: 4 } }, { p1: { 1: 4, 2: 4 } }, 2);
    const bad = scoreMismatches(r);
    expect(bad).toEqual([{ playerId: "p1", hole: 1, manual: 5, gg: 4 }]);
  });
});
