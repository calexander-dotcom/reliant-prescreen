import { describe, expect, it } from "vitest";
import type { Round } from "../types";
import { isSharedRound, publishableRound } from "./payload";

const round = {
  id: "r1",
  date: "2026-09-15",
  courseName: "Test",
  course: null,
  teeId: null,
  players: [{ id: "p1", name: "Al", handicapIndex: 10, source: "manual" }],
  handicapMode: "off-low",
  holeCount: 18,
  scores: {},
  manual: {},
  bets: [],
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
  share: { id: "abc", token: "super-secret-write-token" },
} as unknown as Round;

describe("publishableRound", () => {
  it("never publishes the write token", () => {
    const published = publishableRound(round);
    expect("share" in published).toBe(false);
    expect(JSON.stringify(published)).not.toContain("super-secret-write-token");
    expect(JSON.stringify(published)).not.toContain("abc");
  });

  it("keeps everything a viewer needs", () => {
    const published = publishableRound(round);
    expect(published).toMatchObject({
      id: "r1",
      courseName: "Test",
      holeCount: 18,
    });
    expect(published.players).toHaveLength(1);
  });

  it("leaves a round with no share untouched", () => {
    const { share: _drop, ...plain } = round as Round & { share?: unknown };
    expect(publishableRound(plain as Round)).toEqual(plain);
  });
});

describe("isSharedRound", () => {
  it("accepts a well-formed payload", () => {
    expect(isSharedRound({ round, updatedAt: "now" })).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isSharedRound(null)).toBe(false);
    expect(isSharedRound({})).toBe(false);
    expect(isSharedRound({ round: {} })).toBe(false);
    expect(isSharedRound({ round: { id: 1, players: [] } })).toBe(false);
    expect(isSharedRound({ round: { id: "x" } })).toBe(false);
  });
});
