import type { HandicapMode, HoleInfo, Player, TeeSet } from "./types";

/**
 * Course Handicap = Index x (Slope / 113) + (Course Rating - Par)
 *
 * This is the WHS formula, rounded to the nearest whole stroke. A plus-handicap
 * player (negative index) yields a negative course handicap, which means they
 * give strokes back.
 */
export function courseHandicap(
  handicapIndex: number | null,
  tee: Pick<TeeSet, "courseRating" | "slopeRating" | "par"> | null,
): number | null {
  if (handicapIndex === null || !Number.isFinite(handicapIndex)) return null;
  if (!tee) return Math.round(handicapIndex);
  const raw =
    handicapIndex * (tee.slopeRating / 113) + (tee.courseRating - tee.par);
  return roundHalfAwayFromZero(raw);
}

/** Math.round pushes -0.5 to -0, which is wrong for handicap strokes. */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * Strokes a player receives on one hole.
 *
 * A course handicap of 12 gives a stroke on the 12 hardest holes (stroke index
 * 1-12). A handicap of 22 gives one stroke everywhere plus a second on stroke
 * index 1-4. A plus handicap of -2 takes a stroke back on the two easiest holes
 * (stroke index 18 and 17).
 */
export function strokesOnHole(
  courseHcp: number | null,
  strokeIndex: number,
  holesOnCard = 18,
): number {
  if (courseHcp === null || !Number.isFinite(strokeIndex)) return 0;

  if (courseHcp < 0) {
    const giveBack = -courseHcp;
    // Easiest holes first: index 18, then 17, ...
    return strokeIndex > holesOnCard - giveBack ? -1 : 0;
  }

  const full = Math.floor(courseHcp / holesOnCard);
  const remainder = courseHcp % holesOnCard;
  return full + (strokeIndex <= remainder ? 1 : 0);
}

export interface PlayerStrokes {
  courseHandicap: number | null;
  /** Strokes applied for play, after the round's handicap mode is applied. */
  playingHandicap: number | null;
  /** strokes[holeNumber] = strokes received on that hole. */
  byHole: Record<number, number>;
}

/**
 * Resolve every player's playing handicap and per-hole strokes for a round.
 *
 * "off-low" is how nearly every casual money game is actually played: the
 * lowest course handicap plays from scratch and everyone else gets the
 * difference, so no one is handing out strokes they did not agree to.
 */
export function resolveStrokes(
  players: Player[],
  teeFor: (player: Player) => TeeSet | null,
  holes: HoleInfo[],
  mode: HandicapMode,
): Record<string, PlayerStrokes> {
  const courseHcps = new Map<string, number | null>();
  for (const player of players) {
    courseHcps.set(player.id, courseHandicap(player.handicapIndex, teeFor(player)));
  }

  const known = [...courseHcps.values()].filter(
    (value): value is number => value !== null,
  );
  const low = known.length > 0 ? Math.min(...known) : 0;

  const result: Record<string, PlayerStrokes> = {};
  for (const player of players) {
    const courseHcp = courseHcps.get(player.id) ?? null;

    let playing: number | null;
    if (mode === "none") playing = 0;
    else if (courseHcp === null) playing = null;
    else if (mode === "off-low") playing = courseHcp - low;
    else playing = courseHcp;

    const byHole: Record<number, number> = {};
    for (const hole of holes) {
      byHole[hole.number] = strokesOnHole(playing, hole.strokeIndex, holes.length);
    }

    result[player.id] = { courseHandicap: courseHcp, playingHandicap: playing, byHole };
  }

  return result;
}

/** Net score for a hole, or null when the gross score is not in yet. */
export function netScore(gross: number | null, strokes: number): number | null {
  if (gross === null || !Number.isFinite(gross)) return null;
  return gross - strokes;
}
