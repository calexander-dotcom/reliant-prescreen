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
 * Fold a Golf Genius score pull onto what a round already holds.
 *
 * Golf Genius is the master where it has a score: a value from the feed wins,
 * even over a hand-typed one, so a slip in One Downs self-corrects once the
 * real score lands. Where Golf Genius is blank it changes nothing, so a hole
 * entered ahead of the feed survives and an empty feed never wipes the card.
 */
export function mergeGgScores(
  existing: Record<string, Record<number, number | null>>,
  incoming: Record<string, Record<number, number | null>>,
): Record<string, Record<number, number | null>> {
  const merged: Record<string, Record<number, number | null>> = {};
  for (const id of Object.keys(existing)) merged[id] = { ...existing[id] };
  for (const id of Object.keys(incoming)) {
    const target = { ...(merged[id] ?? {}) };
    for (const [hole, value] of Object.entries(incoming[id])) {
      if (typeof value === "number") target[Number(hole)] = value; // GG has it: it wins
      // GG blank: leave whatever is already there
    }
    merged[id] = target;
  }
  return merged;
}
