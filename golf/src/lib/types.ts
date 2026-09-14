/** Core domain model. Everything here is JSON-serializable for localStorage. */

export type PlayerId = string;

export interface Player {
  id: PlayerId;
  /** Display name, editable even when imported from GHIN. */
  name: string;
  /** Handicap Index as a decimal, e.g. 12.4. Negative means a "plus" handicap. */
  handicapIndex: number | null;
  /** GHIN number, when the player came from a GHIN favorites import. */
  ghinNumber?: string | null;
  /** Which tee set this player is using (index into course.tees). */
  teeId?: string | null;
  source: "ghin" | "manual";
}

export interface HoleInfo {
  /** 1-based hole number. */
  number: number;
  par: number;
  yardage: number | null;
  /** Stroke index / handicap ranking, 1 = hardest. */
  strokeIndex: number;
}

export interface TeeSet {
  id: string;
  name: string;
  /** "M" | "F" — ratings differ by tee gender in GHIN data. */
  gender?: string | null;
  courseRating: number;
  slopeRating: number;
  par: number;
  yardage: number | null;
  holes: HoleInfo[];
}

export interface Course {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
  tees: TeeSet[];
  source: "ghin" | "manual";
}

// ---------------------------------------------------------------------------
// Bets
// ---------------------------------------------------------------------------

/** Whether a game is decided on raw strokes or handicap-adjusted strokes. */
export type ScoreBasis = "gross" | "net";

/**
 * How handicaps convert to strokes on the card.
 *  - "full"        each player plays their own full course handicap
 *  - "off-low"     low course handicap plays scratch, others get the difference
 *  - "none"        gross only
 */
export type HandicapMode = "full" | "off-low" | "none";

export interface Side {
  id: string;
  name: string;
  playerIds: PlayerId[];
}

export interface NassauConfig {
  kind: "nassau";
  id: string;
  label: string;
  /** Per-segment stake in cents (front, back, and total each worth this). */
  amount: number;
  sides: [Side, Side];
  basis: ScoreBasis;
  /** Go down this many holes and a new press bet opens automatically. 0 = off. */
  autoPressAt: number;
  /** Cap on automatic presses per segment, to keep runaway chains sane. */
  maxPresses: number;
  /** Include the 18-hole "total" bet alongside front and back. */
  includeTotal: boolean;
  /**
   * How a team stake converts to money between individuals.
   *  - "per-side"   the stake moves side-to-side and is split within each side
   *  - "per-player" every losing player pays every winning player the stake
   * Identical for singles matches.
   */
  stakeMode: "per-side" | "per-player";
}

export interface SkinsConfig {
  kind: "skins";
  id: string;
  label: string;
  /** What each losing player pays the skin winner, per hole, in cents. */
  amount: number;
  basis: ScoreBasis;
  playerIds: PlayerId[];
  /** Tied hole rolls its value into the next hole. */
  carryOver: boolean;
  /** Require a birdie-or-better to claim (a common "validated skins" rule). */
  requireBirdie: boolean;
}

export type BetConfig = NassauConfig | SkinsConfig;

// ---------------------------------------------------------------------------
// Round
// ---------------------------------------------------------------------------

/** A manually entered, must-net-to-zero money line for one hole. */
export interface ManualHoleEntry {
  /** cents, signed, keyed by player. Positive = that player collects. */
  amounts: Record<PlayerId, number>;
  /** Optional banker for the hole; used by the UI to auto-derive their number. */
  bankerId?: PlayerId | null;
  note?: string;
}

export interface Round {
  id: string;
  /** ISO date string. */
  date: string;
  courseName: string;
  course: Course | null;
  /** Which tee set the card's par/stroke-index come from. */
  teeId: string | null;
  players: Player[];
  handicapMode: HandicapMode;
  /** holeCount is 9 or 18. */
  holeCount: number;
  /** scores[playerId][holeNumber] = gross strokes, or null if not entered. */
  scores: Record<PlayerId, Record<number, number | null>>;
  /** Manual zero-sum money entries, keyed by hole number. */
  manual: Record<number, ManualHoleEntry>;
  bets: BetConfig[];
  /** Free-text notes for the round. */
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
