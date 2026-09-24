import type { PlayerId, Round } from "../types";
import { normaliseStartHole, positionOf } from "../holes";
import { setScore } from "../mutations";

/**
 * Bringing scores in from Golf Genius.
 *
 * The club runs its scoring in Golf Genius, so the group enters there. This
 * reads those hole-by-hole scores back into One Downs so nobody types them
 * twice. Golf Genius has no key here, so the numbers arrive one of two ways,
 * both landing on the same shape below:
 *
 *   - pasted: copy the group's scores out of Golf Genius and drop them in.
 *   - fetched live: a source that signs in with the Foursome GGID and reads
 *     the group's card as it fills. That source is brittle and against Golf
 *     Genius's terms, so it is an opt-in the owner turns on, and it plugs into
 *     `applyGgScores` exactly as a paste does.
 *
 * Golf Genius counts holes 1..18 on the card. One Downs counts positions from
 * the tee the group started on, so a shotgun round keeps its scores by
 * position. The one thing this module must get right is that conversion: a
 * Golf Genius score for the 7th, on a round that started on the 7th, is this
 * round's 1st hole played.
 */

/** One hole from Golf Genius, keyed by the number on the tee marker (1..18). */
export interface GgHoleScore {
  /** The hole number as Golf Genius counts it, 1..18. */
  hole: number;
  strokes: number | null;
}

export interface GgPlayer {
  name: string;
  holes: GgHoleScore[];
}

export interface GgFoursome {
  eventName?: string;
  players: GgPlayer[];
}

/**
 * A place scores come from. Paste is one; a live GGID reader is another. Both
 * hand back a `GgFoursome`, so everything downstream is shared.
 */
export interface GgScoreSource {
  id: string;
  label: string;
  fetch(ggid: string): Promise<GgFoursome>;
}

/** Split a pasted line into cells, tolerant of tabs, commas or runs of spaces. */
function cells(line: string): string[] {
  const trimmed = line.trim();
  if (trimmed.includes("\t")) return trimmed.split("\t").map((c) => c.trim());
  if (trimmed.includes(",")) return trimmed.split(",").map((c) => c.trim());
  return trimmed.split(/\s{2,}|\s(?=\d)/).map((c) => c.trim());
}

/** A score cell: a number, or a blank/dash for a hole not yet played. */
function parseStrokes(cell: string): number | null {
  const t = cell.trim();
  if (t === "" || t === "-" || t === "–" || t === "—" || /^[a-z]+$/i.test(t)) return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Parse scores pasted out of Golf Genius.
 *
 * Forgiving on purpose, because a paste from a phone is messy. Each line is a
 * player: a name, then their hole scores left to right. A leading header row
 * of hole numbers is used when present; otherwise the scores are taken to run
 * from the 1st. Cells that are blank, a dash or a word (a running total label)
 * are read as "not played". Totals on the end of a row are ignored by keeping
 * only the first `holeCount` numbers.
 */
export function parsePastedScores(text: string, holeCount = 18): GgFoursome {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let holeOrder: number[] | null = null;
  const players: GgPlayer[] = [];

  for (const line of lines) {
    const parts = cells(line);
    if (parts.length < 2) continue;

    const nums = parts.filter((p) => /^\d+$/.test(p)).map((p) => Number.parseInt(p, 10));
    const looksLikeHeader =
      parts.every((p) => /^\d+$/.test(p) || /^(hole|player|name|hcp|hdcp|par|tot|total|in|out)$/i.test(p)) &&
      nums.length >= 3 &&
      nums.every((n) => n >= 1 && n <= 18);
    if (looksLikeHeader && players.length === 0) {
      holeOrder = nums.slice(0, holeCount);
      continue;
    }

    // The name is everything up to the first score cell.
    const firstNum = parts.findIndex((p) => /^-?\d+$|^[-–—]$/.test(p));
    if (firstNum <= 0) continue;
    const name = parts.slice(0, firstNum).join(" ").trim();
    if (!name) continue;

    const scoreCells = parts.slice(firstNum);
    const holes: GgHoleScore[] = [];
    for (let i = 0; i < scoreCells.length && holes.length < holeCount; i += 1) {
      const strokes = parseStrokes(scoreCells[i]);
      const hole = holeOrder ? holeOrder[holes.length] : holes.length + 1;
      if (hole === undefined) break;
      holes.push({ hole, strokes });
    }
    players.push({ name, holes });
  }

  return { players };
}

/** Fold spacing and case so "Chris O'Neil" and "chris oneil" match. */
function normalise(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface PlayerMatch {
  /** Golf Genius name -> One Downs player id. */
  mapping: Record<string, PlayerId>;
  /** Golf Genius names that found no player. */
  unmatchedGg: string[];
  /** One Downs players nobody in the paste matched. */
  unmatchedRound: PlayerId[];
}

/**
 * Line up Golf Genius names with the round's players. Exact first, then first
 * name, then a starts-with, each only when it is unambiguous, so a wrong guess
 * never quietly puts scores on the wrong player.
 */
export function matchPlayers(foursome: GgFoursome, players: Round["players"]): PlayerMatch {
  const mapping: Record<string, PlayerId> = {};
  const usedRound = new Set<PlayerId>();
  const unmatchedGg: string[] = [];

  const candidates = players.map((p) => ({
    id: p.id,
    full: normalise(p.name),
    first: normalise(p.name.split(/\s+/)[0] ?? p.name),
  }));

  for (const ggPlayer of foursome.players) {
    const target = normalise(ggPlayer.name);
    const firstOnly = normalise(ggPlayer.name.split(/\s+/)[0] ?? ggPlayer.name);
    const free = candidates.filter((c) => !usedRound.has(c.id));

    const tiers = [
      free.filter((c) => c.full === target),
      free.filter((c) => c.first === firstOnly || c.full === firstOnly || c.first === target),
      free.filter((c) => c.full.startsWith(target) || target.startsWith(c.full)),
    ];
    const hit = tiers.find((t) => t.length === 1)?.[0];
    if (hit) {
      mapping[ggPlayer.name] = hit.id;
      usedRound.add(hit.id);
    } else {
      unmatchedGg.push(ggPlayer.name);
    }
  }

  return {
    mapping,
    unmatchedGg,
    unmatchedRound: players.map((p) => p.id).filter((id) => !usedRound.has(id)),
  };
}

export interface ApplyResult {
  round: Round;
  /** How many hole scores were written. */
  applied: number;
  /** Golf Genius holes that fell outside this round's card. */
  skipped: number;
}

/**
 * Write matched scores into the round.
 *
 * Golf Genius holes are marker numbers; the round stores by position, so each
 * hole is converted through the start tee first. A hole with no score is left
 * alone rather than blanked, so a partial pull never wipes a score already in.
 */
export function applyGgScores(
  round: Round,
  foursome: GgFoursome,
  mapping: Record<string, PlayerId>,
): ApplyResult {
  const start = normaliseStartHole(round.startHole, round.holeCount);
  let next = round;
  let applied = 0;
  let skipped = 0;

  for (const ggPlayer of foursome.players) {
    const playerId = mapping[ggPlayer.name];
    if (!playerId) continue;
    for (const { hole, strokes } of ggPlayer.holes) {
      if (strokes === null) continue;
      if (hole < 1 || hole > round.holeCount) {
        skipped += 1;
        continue;
      }
      const position = positionOf(hole, start, round.holeCount);
      next = setScore(next, playerId, position, strokes);
      applied += 1;
    }
  }

  return { round: next, applied, skipped };
}
