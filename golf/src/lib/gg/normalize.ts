import type { Course, HoleInfo, Player, TeeSet } from "../types";

/**
 * Turning a Golf Genius pairing group into the pieces One Downs needs.
 *
 * The tee_sheet endpoint hands back, per round, the pairing groups. Each group
 * carries its foursome GGID, the four players with their handicaps, the tee
 * they play (par, yardage and stroke index for every hole) and a per-hole
 * score array that fills as the group scores in the Golf Genius app. This maps
 * that into a round's players, course and scores. Reading only — Golf Genius
 * has no way to write scores back, so nothing here ever sends.
 */

const HOLES = 18;

export interface GgTee {
  name?: string;
  id?: string;
  course_id?: string;
  hole_data?: { par?: number[]; yardage?: (number | null)[]; handicap?: number[] };
  slope_and_rating?: { all18?: { rating?: number; slope?: number } };
}

export interface GgTeeSheetPlayer {
  name?: string;
  first_name?: string;
  last_name?: string;
  handicap_index?: string;
  course_handicap?: string;
  player_roster_id?: string;
  member_card_id?: string;
  handicap_network_id?: string;
  score_array?: (number | null)[];
  tee?: GgTee;
}

export interface GgPairingGroup {
  foursome_ggid?: string;
  players?: GgTeeSheetPlayer[];
}

/**
 * Golf Genius writes a plus handicap as "+2.0"; One Downs stores a plus as a
 * negative index, so the sign flips. A plain "0" or "4.8" passes straight
 * through. Anything unparseable becomes null, which reads as "no index".
 */
export function parseGgIndex(raw: string | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim();
  if (text === "") return null;
  const plus = text.startsWith("+");
  const value = Number.parseFloat(plus ? text.slice(1) : text);
  if (!Number.isFinite(value)) return null;
  return plus ? -value : value;
}

/** The course and tee, built from one player's tee block (a group shares it). */
export function courseFromGg(tee: GgTee | undefined, courseName?: string): Course | null {
  const par = tee?.hole_data?.par;
  if (!tee || !par) return null;
  const yardage = tee.hole_data?.yardage ?? [];
  const strokeIndex = tee.hole_data?.handicap ?? [];
  const holes: HoleInfo[] = Array.from({ length: HOLES }, (_, i) => ({
    number: i + 1,
    par: par[i] ?? 4,
    yardage: typeof yardage[i] === "number" ? (yardage[i] as number) : null,
    strokeIndex: strokeIndex[i] ?? i + 1,
  }));
  const totalYards = holes.reduce((sum, h) => sum + (h.yardage ?? 0), 0);
  const teeSet: TeeSet = {
    id: tee.id ?? "gg-tee",
    name: tee.name ?? "Tee",
    courseRating: tee.slope_and_rating?.all18?.rating ?? 0,
    slopeRating: tee.slope_and_rating?.all18?.slope ?? 113,
    par: holes.reduce((sum, h) => sum + h.par, 0),
    yardage: totalYards > 0 ? totalYards : null,
    holes,
  };
  return {
    id: tee.course_id ?? "gg-course",
    name: courseName ?? tee.name ?? "Course",
    tees: [teeSet],
    source: "gg",
  };
}

export interface GgFoursome {
  ggid: string | null;
  players: Player[];
  course: Course | null;
  teeId: string | null;
  /** Gross strokes keyed by our player id then hole 1..18; null = not scored. */
  scores: Record<string, Record<number, number | null>>;
}

let counter = 0;
function playerId(p: GgTeeSheetPlayer): string {
  return p.player_roster_id || p.member_card_id || `gg-${(counter += 1)}`;
}

/** Map a Golf Genius pairing group into a round's players, course and scores. */
export function foursomeFromGg(group: GgPairingGroup, courseName?: string): GgFoursome {
  const ggPlayers = group.players ?? [];
  const course = ggPlayers.length ? courseFromGg(ggPlayers[0]?.tee, courseName) : null;
  const teeId = course?.tees[0]?.id ?? null;

  const players: Player[] = [];
  const scores: Record<string, Record<number, number | null>> = {};
  for (const gp of ggPlayers) {
    const id = playerId(gp);
    const name =
      gp.name || [gp.first_name, gp.last_name].filter(Boolean).join(" ") || "Player";
    players.push({
      id,
      name,
      handicapIndex: parseGgIndex(gp.handicap_index),
      ghinNumber: gp.handicap_network_id ?? null,
      teeId,
      source: "gg",
    });
    const arr = gp.score_array ?? [];
    const byHole: Record<number, number | null> = {};
    for (let hole = 1; hole <= HOLES; hole += 1) {
      const value = arr[hole - 1];
      byHole[hole] = typeof value === "number" && value > 0 ? value : null;
    }
    scores[id] = byHole;
  }
  return { ggid: group.foursome_ggid ?? null, players, course, teeId, scores };
}

/**
 * How a hole's own entry stands against the Golf Genius feed.
 *  - "match"     both have it and agree
 *  - "mismatch"  both have it and differ — the one to show in red
 *  - "from-gg"   you have not entered it; the value came from Golf Genius
 *  - "manual"    you entered it; Golf Genius has not caught up
 *  - "empty"     neither has it yet
 */
export type ScoreStatus = "match" | "mismatch" | "from-gg" | "manual" | "empty";

export interface HoleReconcile {
  /** The score to play the bets off: your entry if you made one, else the feed. */
  value: number | null;
  status: ScoreStatus;
  manual: number | null;
  gg: number | null;
}

/**
 * Reconcile your entries against the Golf Genius feed, per player per hole.
 *
 * Your manual entry is yours and is never overwritten. Golf Genius is a
 * cross-check: it fills a hole you have not typed (marked "from-gg"), and where
 * both of you have a hole and disagree it is flagged "mismatch" for the card to
 * show in red. Nothing is silently replaced — a red hole is for a human to
 * settle. Both sides key by the same player ids, which holds because a round
 * created from a GGID uses the Golf Genius roster ids as its player ids.
 */
export function reconcileScores(
  manual: Record<string, Record<number, number | null>>,
  gg: Record<string, Record<number, number | null>>,
  holeCount = HOLES,
): Record<string, Record<number, HoleReconcile>> {
  const ids = new Set([...Object.keys(manual), ...Object.keys(gg)]);
  const out: Record<string, Record<number, HoleReconcile>> = {};
  for (const id of ids) {
    const row: Record<number, HoleReconcile> = {};
    for (let hole = 1; hole <= holeCount; hole += 1) {
      const m = manual[id]?.[hole] ?? null;
      const g = gg[id]?.[hole] ?? null;
      let value: number | null;
      let status: ScoreStatus;
      if (m !== null && g !== null) {
        value = m;
        status = m === g ? "match" : "mismatch";
      } else if (m !== null) {
        value = m;
        status = "manual";
      } else if (g !== null) {
        value = g;
        status = "from-gg";
      } else {
        value = null;
        status = "empty";
      }
      row[hole] = { value, status, manual: m, gg: g };
    }
    out[id] = row;
  }
  return out;
}

/** The score to actually play off per player per hole: yours, else the feed. */
export function effectiveScores(
  reconciled: Record<string, Record<number, HoleReconcile>>,
): Record<string, Record<number, number | null>> {
  const out: Record<string, Record<number, number | null>> = {};
  for (const [id, row] of Object.entries(reconciled)) {
    const scores: Record<number, number | null> = {};
    for (const [hole, cell] of Object.entries(row)) scores[Number(hole)] = cell.value;
    out[id] = scores;
  }
  return out;
}

/** Every hole where your entry and Golf Genius disagree — the red cells. */
export function scoreMismatches(
  reconciled: Record<string, Record<number, HoleReconcile>>,
): Array<{ playerId: string; hole: number; manual: number; gg: number }> {
  const out: Array<{ playerId: string; hole: number; manual: number; gg: number }> = [];
  for (const [playerId, row] of Object.entries(reconciled)) {
    for (const [hole, cell] of Object.entries(row)) {
      if (cell.status === "mismatch" && cell.manual !== null && cell.gg !== null) {
        out.push({ playerId, hole: Number(hole), manual: cell.manual, gg: cell.gg });
      }
    }
  }
  return out;
}
