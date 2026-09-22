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
   *  - "per-player" every player on the losing side is in for the stake and
   *                 every player on the winning side collects it; a lone
   *                 player against two is in for double
   *  - "per-side"   one stake changes hands and each side splits its share
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

/**
 * The "one down" game: a new bet opens whenever somebody falls behind in the
 * newest bet, so live bets stack up as the round goes on.
 *
 * Standing is written as one number per open bet, oldest first — `3-2-1-1-0`
 * is five simultaneous bets, the last of which has just opened at level.
 */
export interface OneDownConfig {
  kind: "onedown";
  id: string;
  label: string;
  /** Stake for each bet in the stack, in cents. */
  amount: number;
  sides: [Side, Side];
  basis: ScoreBasis;
  /**
   * A new bet opens when the newest bet's margin reaches this many holes.
   * 1 is the usual rule. 0 means presses only happen by hand.
   */
  autoPressAt: number;
  /**
   * Extra bets opened by hand, keyed by the hole they were called after —
   * one less than the hole they open on: `{ 0: 1, 3: 2 }` is one press
   * before the 1st and two before the 4th. These add to any automatic bet
   * on the same hole rather than replacing it, and can be called ahead of
   * time, before the round starts.
   */
  manualPresses: Record<number, number>;
  /**
   * Whether the round starts with a flip on the tee — the 1st, and the 10th
   * when the stack starts over. The winners start one up in the opening
   * bet, which opens the first press by the 1-down rule: +1/0 before a ball
   * is hit. Undefined means on.
   */
  teeFlip?: boolean;
  /**
   * Who won the flip on each tee, keyed by the stack's first hole (1, 10):
   * a player on the winning side, so it follows the people if the teams are
   * shuffled afterwards; null for no flip on that tee; missing when the
   * round has not been asked yet.
   */
  teeFlipWinners?: Record<number, PlayerId | null>;
  /** The 1st tee's winner as rounds before the 10th had its own flip stored it. */
  teeFlipWinnerId?: PlayerId | null;
  /** Whether the stack runs all 18 or starts over at the 10th. */
  reset: "round" | "nines";
  /**
   * A single bet over all 18 at this multiple of the stake, alongside the
   * nines. It never presses. 0 turns it off.
   */
  overallMultiplier: number;
  /** As for a nassau. */
  stakeMode: "per-side" | "per-player";
  /**
   * Greenies on the par 3s: closest to the hole wins one for their side,
   * worth the stake, netted between the sides at the end. One side taking
   * every par 3 of the round doubles them. Undefined means on.
   */
  greenies?: boolean;
  /**
   * Who won the greenie on each par 3: a player id, or null for nobody.
   * A hole with no entry has not been answered yet.
   */
  greenieWinners?: Record<number, PlayerId | null>;
  /**
   * Decide alternate holes, starting with the first of each nine — 1, 3, 5,
   * 7, 9 and 10, 12, 14, 16, 18 — on the sides' aggregate, both partners'
   * scores added together, rather than best ball. The even holes of each
   * nine stay best ball. Undefined means on — the house plays it, and a
   * round made before the option existed should too.
   */
  alternateAggregate?: boolean;
}

/**
 * Banker: one player takes the whole group on, hole by hole.
 *
 * The banker plays a separate bet against each other player, so a good hole
 * collects from everybody and a bad one pays everybody. The deal then passes to
 * whoever won the most money on the hole — which usually means a banker who is
 * winning keeps it.
 */
export interface BankerConfig {
  kind: "banker";
  id: string;
  label: string;
  /**
   * Where the money comes from.
   *  - "manual"  you type what each player won or lost on the hole, and this
   *              bet only tracks who holds the deal. No scores needed.
   *  - "scores"  the app works it out from the scores and the doubles.
   *
   * Manual is the default because a banker hole usually carries side action
   * that no stroke comparison can know about.
   */
  source: "manual" | "scores";
  /** Base stake per opponent per hole, in cents. Used when source is "scores". */
  amount: number;
  basis: ScoreBasis;
  playerIds: PlayerId[];
  /** How the deal passes from hole to hole. */
  rotation: "most-money" | "order" | "hole-winner" | "manual";
  /** Who banks the first hole. Defaults to the first player in the game. */
  firstBankerId: PlayerId | null;
  /** Per-hole override, and the only source of bankers when rotation is manual. */
  bankerByHole: Record<number, PlayerId>;
  /**
   * Stake multiplier per hole, per opponent: 1 flat, 2 when that player
   * doubles, 4 when the banker doubles back. Keyed hole -> player -> multiple.
   */
  doubles: Record<number, Record<PlayerId, number>>;
}

export type BetConfig =
  | NassauConfig
  | SkinsConfig
  | OneDownConfig
  | BankerConfig;

// ---------------------------------------------------------------------------
// Round
// ---------------------------------------------------------------------------

/** A manually entered, must-net-to-zero money line for one hole. */
export interface ManualHoleEntry {
  /** cents, signed, keyed by player. Positive = that player collects. */
  amounts: Record<PlayerId, number>;
  /** Optional banker for the hole; used by the UI to auto-derive their number. */
  bankerId?: PlayerId | null;
  /**
   * Players whose amount has actually been typed in.
   *
   * A cell nobody has touched and a cell holding a real $0 look identical in
   * `amounts`, and the difference matters: once every player but one has been
   * entered, the one left over is whatever balances the hole. Without this the
   * app could not tell which player to fill in, or would overwrite a legitimate
   * zero.
   */
  touched?: PlayerId[];
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
  /**
   * The hole this group teed off on. Shotgun starts send groups out all over
   * the course, and the match still runs a front nine and a back nine: the
   * first nine holes played and the second. Off the 7th that makes the front
   * 7 through 15 and the back 16, 17, 18, 1 through 6.
   *
   * Everything the bets count — a stack's range, the hole a press opens on,
   * which holes play aggregate — is a position in that order, not the number
   * on the tee marker. Undefined means the 1st, where the two are the same.
   */
  startHole?: number;
  /** scores[playerId][holeNumber] = gross strokes, or null if not entered. */
  scores: Record<PlayerId, Record<number, number | null>>;
  /** Manual zero-sum money entries, keyed by hole number. */
  manual: Record<number, ManualHoleEntry>;
  bets: BetConfig[];
  /**
   * Whose side the standings are read from — the scorer's, normally.
   * Positive numbers and green mean this player's side is up. Undefined
   * until the round is first opened, when it is set from the "me" player if
   * they are in the round; null means nobody in particular (side A).
   */
  perspectiveId?: PlayerId | null;
  /** Free-text notes for the round. */
  notes?: string;
  /**
   * Set once this round is being shared read-only.
   *
   * `token` is what lets this device keep publishing, so it must never leave
   * here — `publishableRound` strips the whole field before anything is sent.
   */
  share?: { id: string; token: string } | null;
  createdAt: string;
  updatedAt: string;
}
