import { describe, expect, it } from "vitest";
import type { Round } from "../types";
import { mergeGgFeed, sameScores } from "./live";
import type { GgFoursome } from "./normalize";

function round(gg: Round["gg"]): Round {
  const now = "2026-09-30T00:00:00.000Z";
  return {
    id: "r1",
    date: "2026-09-30",
    courseName: "Test",
    course: null,
    teeId: null,
    players: [],
    handicapMode: "off-low",
    holeCount: 18,
    scores: {},
    manual: {},
    bets: [],
    gg,
    createdAt: now,
    updatedAt: now,
  };
}

const feed = (scores: GgFoursome["scores"]): GgFoursome => ({
  ggid: "abc",
  players: [],
  course: null,
  teeId: null,
  scores,
});

describe("sameScores", () => {
  it("treats missing and null holes as equal", () => {
    expect(sameScores({ p1: { 1: null } }, { p1: {} })).toBe(true);
  });
  it("sees a changed number", () => {
    expect(sameScores({ p1: { 1: 4 } }, { p1: { 1: 5 } })).toBe(false);
  });
  it("sees a newly scored hole", () => {
    expect(sameScores({ p1: { 1: 4 } }, { p1: { 1: 4, 2: 5 } })).toBe(false);
  });
});

describe("mergeGgFeed", () => {
  it("returns the same round when the feed has not changed", () => {
    const r = round({
      ggid: "abc",
      eventId: "e1",
      roundId: "rd1",
      scores: { p1: { 1: 4 } },
      updatedAt: "2026-09-30T00:00:00.000Z",
    });
    expect(mergeGgFeed(r, feed({ p1: { 1: 4 } }))).toBe(r);
  });

  it("folds in a change and stamps the time", () => {
    const r = round({
      ggid: "abc",
      eventId: "e1",
      roundId: "rd1",
      scores: { p1: { 1: 4 } },
      updatedAt: "2026-09-30T00:00:00.000Z",
    });
    const at = new Date("2026-09-30T12:34:56.000Z");
    const next = mergeGgFeed(r, feed({ p1: { 1: 4, 2: 5 } }), at);
    expect(next).not.toBe(r);
    expect(next.gg?.scores.p1[2]).toBe(5);
    expect(next.gg?.updatedAt).toBe(at.toISOString());
    // The tie-in's ids are preserved.
    expect(next.gg?.eventId).toBe("e1");
  });

  it("leaves a round with no tie-in alone", () => {
    const r = round(null);
    expect(mergeGgFeed(r, feed({ p1: { 1: 4 } }))).toBe(r);
  });
});
