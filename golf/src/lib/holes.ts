/**
 * Play order, for rounds that do not start on the 1st.
 *
 * A shotgun start puts a group out on, say, the 7th, and the match is still a
 * front nine and a back nine: the first nine holes they play are the front, the
 * second nine the back. Starting on the 7th that makes the front 7 through 15
 * and the back 16, 17, 18, 1 through 6.
 *
 * So the app counts positions, not hole numbers. Position 1 is wherever the
 * group teed off, position 10 opens the back nine, and everything that reads as
 * a hole number to the bets — a stack's range, the hole a press opens on, the
 * tees that get a flip, which holes play aggregate — is really a position. Only
 * two things care about the number painted on the tee marker: what the player
 * sees, and which par and stroke index to use. Both go through here.
 *
 * A round starting on the 1st has position === hole number, which is why
 * rounds recorded before any of this existed need no conversion.
 */

/** Rounds are played on a circle: the hole after the last is the first. */
export const DEFAULT_START_HOLE = 1;

/** A start hole that is usable for a card of this size, however it arrived. */
export function normaliseStartHole(startHole: number | undefined | null, holeCount: number): number {
  const count = holeCount > 0 ? holeCount : 18;
  // A fraction is bad data rather than a near miss, so it falls back too.
  if (typeof startHole !== "number" || !Number.isInteger(startHole)) return DEFAULT_START_HOLE;
  if (startHole < 1 || startHole > count) return DEFAULT_START_HOLE;
  return startHole;
}

/**
 * The hole number played at a position, wrapping past the last hole back to
 * the 1st. Positions are 1-based, as hole numbers are.
 */
export function holeAt(position: number, startHole: number, holeCount: number): number {
  const count = holeCount > 0 ? holeCount : 18;
  const start = normaliseStartHole(startHole, count);
  const offset = (position - 1) % count;
  const wrapped = offset < 0 ? offset + count : offset;
  return ((start - 1 + wrapped) % count) + 1;
}

/** Where a hole number falls in the play order. The inverse of `holeAt`. */
export function positionOf(hole: number, startHole: number, holeCount: number): number {
  const count = holeCount > 0 ? holeCount : 18;
  const start = normaliseStartHole(startHole, count);
  const offset = (hole - start) % count;
  const wrapped = offset < 0 ? offset + count : offset;
  return wrapped + 1;
}

/** Every hole number in the order it is played, position 1 first. */
export function playOrder(startHole: number, holeCount: number): number[] {
  const count = holeCount > 0 ? holeCount : 18;
  return Array.from({ length: count }, (_, i) => holeAt(i + 1, startHole, count));
}

/** Whether this round is played straight through from the 1st. */
export function startsOnFirst(startHole: number | undefined | null, holeCount = 18): boolean {
  return normaliseStartHole(startHole, holeCount) === DEFAULT_START_HOLE;
}
