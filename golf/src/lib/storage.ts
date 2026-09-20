"use client";

import type { Player, Round } from "./types";

/**
 * Everything lives in the browser.
 *
 * A golf course is the worst possible place to depend on a network, so the
 * round is written to localStorage on every change and the app keeps working
 * with no signal at all. GHIN is the only thing that needs connectivity, and
 * that only happens up front when you import players and the course.
 */

const ROUNDS_KEY = "golfbets.rounds.v1";
const TOKEN_KEY = "golfbets.ghinToken";
const ROSTER_KEY = "golfbets.roster.v1";
const GOLFER_ID_KEY = "golfbets.ghinNumber";
const GHIN_LOGIN_KEY = "golfbets.ghinLogin";
const SEARCH_STATE_KEY = "golfbets.searchState";
const TEE_PREFS_KEY = "golfbets.teePrefs.v1";
const ME_KEY = "golfbets.me.v1";
const PANELS_KEY = "golfbets.panels.v1";

function canStore(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadRounds(): Round[] {
  if (!canStore()) return [];
  const rounds = safeParse<Round[]>(window.localStorage.getItem(ROUNDS_KEY), []);
  if (!Array.isArray(rounds)) return [];
  return rounds
    .filter((round) => round && typeof round.id === "string")
    .map(migrateRound)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/** Fill in anything a round saved by an older version is missing. */
function migrateRound(round: Round): Round {
  return {
    ...round,
    holeCount: round.holeCount === 9 ? 9 : 18,
    players: Array.isArray(round.players) ? round.players : [],
    scores: round.scores ?? {},
    manual: round.manual ?? {},
    bets: (Array.isArray(round.bets) ? round.bets : []).map((bet) => {
      // Presses used to be a list of holes; they are counts per hole now.
      if (bet.kind === "onedown" && Array.isArray(bet.manualPresses)) {
        const counts: Record<number, number> = {};
        for (const hole of bet.manualPresses as unknown as number[]) {
          counts[hole] = (counts[hole] ?? 0) + 1;
        }
        return { ...bet, manualPresses: counts };
      }
      return bet;
    }),
    handicapMode: round.handicapMode ?? "off-low",
  };
}

export function loadRound(id: string): Round | null {
  return loadRounds().find((round) => round.id === id) ?? null;
}

export function saveRound(round: Round): void {
  if (!canStore()) return;
  const rounds = loadRounds().filter((existing) => existing.id !== round.id);
  rounds.unshift({ ...round, updatedAt: new Date().toISOString() });
  window.localStorage.setItem(ROUNDS_KEY, JSON.stringify(rounds));
}

export function deleteRound(id: string): void {
  if (!canStore()) return;
  const rounds = loadRounds().filter((round) => round.id !== id);
  window.localStorage.setItem(ROUNDS_KEY, JSON.stringify(rounds));
}

export function createRound(partial: Partial<Round> = {}): Round {
  const now = new Date().toISOString();
  return {
    id: newId(),
    date: now.slice(0, 10),
    courseName: "",
    course: null,
    teeId: null,
    players: [],
    handicapMode: "off-low",
    holeCount: 18,
    scores: {},
    manual: {},
    bets: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

// --- GHIN session token (kept out of localStorage on purpose) --------------

export function loadToken(): string | null {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  return window.sessionStorage.getItem(TOKEN_KEY);
}

export function saveToken(token: string | null): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
  else window.sessionStorage.removeItem(TOKEN_KEY);
}

/**
 * The user's own GHIN number.
 *
 * Unlike a password this is not a secret — it is printed on a handicap card —
 * and re-typing it every round is tedious, so it goes in localStorage rather
 * than being asked for each time.
 */
export function loadGolferId(): string | null {
  if (!canStore()) return null;
  return window.localStorage.getItem(GOLFER_ID_KEY);
}

export function saveGolferId(golferId: string | null): void {
  if (!canStore()) return;
  if (golferId) window.localStorage.setItem(GOLFER_ID_KEY, golferId);
  else window.localStorage.removeItem(GOLFER_ID_KEY);
}

/**
 * What was typed in the sign-in name box — an email or GHIN number, not a
 * secret — so that when the session runs out, signing in again is the
 * password and nothing else.
 */
export function loadGhinLogin(): string | null {
  if (!canStore()) return null;
  return window.localStorage.getItem(GHIN_LOGIN_KEY);
}

export function saveGhinLogin(login: string | null): void {
  if (!canStore()) return;
  if (login) window.localStorage.setItem(GHIN_LOGIN_KEY, login);
  else window.localStorage.removeItem(GHIN_LOGIN_KEY);
}

/** The state a golfer search was last narrowed to, e.g. "FL". */
export function loadSearchState(): string {
  if (!canStore()) return "";
  return window.localStorage.getItem(SEARCH_STATE_KEY) ?? "";
}

export function saveSearchState(state: string): void {
  if (!canStore()) return;
  if (state) window.localStorage.setItem(SEARCH_STATE_KEY, state);
  else window.localStorage.removeItem(SEARCH_STATE_KEY);
}

/**
 * The account holder, kept so they survive a reload without signing in again.
 * Not a secret — it is a name and a handicap index.
 */
export function loadMe(): Player | null {
  if (!canStore()) return null;
  const me = safeParse<Player | null>(window.localStorage.getItem(ME_KEY), null);
  return me && me.id && me.name ? me : null;
}

export function saveMe(me: Player | null): void {
  if (!canStore()) return;
  if (me) window.localStorage.setItem(ME_KEY, JSON.stringify(me));
  else window.localStorage.removeItem(ME_KEY);
}

/**
 * Which collapsible panels are open.
 *
 * Remembered because the alternative is collapsing the same section on every
 * one of eighteen holes.
 */
export function loadPanelOpen(key: string, fallback: boolean): boolean {
  if (!canStore()) return fallback;
  const panels = safeParse<Record<string, boolean>>(
    window.localStorage.getItem(PANELS_KEY),
    {},
  );
  const value = panels?.[key];
  return typeof value === "boolean" ? value : fallback;
}

export function savePanelOpen(key: string, open: boolean): void {
  if (!canStore()) return;
  const panels = safeParse<Record<string, boolean>>(
    window.localStorage.getItem(PANELS_KEY),
    {},
  );
  window.localStorage.setItem(
    PANELS_KEY,
    JSON.stringify({ ...(panels ?? {}), [key]: open }),
  );
}

// --- Tee preferences ------------------------------------------------------

interface TeePrefs {
  /** courseId -> teeId, so a course comes up on the tee you played it from. */
  byCourse: Record<string, string>;
  /** The last tee name used anywhere, e.g. "Blue". */
  lastName: string | null;
}

export function loadTeePrefs(): TeePrefs {
  const empty: TeePrefs = { byCourse: {}, lastName: null };
  if (!canStore()) return empty;
  const stored = safeParse<TeePrefs>(window.localStorage.getItem(TEE_PREFS_KEY), empty);
  return {
    byCourse: stored?.byCourse && typeof stored.byCourse === "object" ? stored.byCourse : {},
    lastName: typeof stored?.lastName === "string" ? stored.lastName : null,
  };
}

export function saveTeePref(courseId: string, teeId: string, teeName: string): void {
  if (!canStore()) return;
  const prefs = loadTeePrefs();
  prefs.byCourse[courseId] = teeId;
  prefs.lastName = teeName;
  window.localStorage.setItem(TEE_PREFS_KEY, JSON.stringify(prefs));
}

/**
 * Which tee to open a course on.
 *
 * The one played here last, if this course has been played. Otherwise the tee
 * whose name matches the last one used anywhere, so a new course still comes up
 * on the blues if that is what the group plays. Otherwise the first listed.
 */
export function preferredTeeId(
  courseId: string,
  tees: { id: string; name: string }[],
): string | null {
  if (tees.length === 0) return null;
  const prefs = loadTeePrefs();

  const forCourse = prefs.byCourse[courseId];
  if (forCourse && tees.some((tee) => tee.id === forCourse)) return forCourse;

  if (prefs.lastName) {
    const byName = tees.find(
      (tee) => tee.name.toLowerCase() === prefs.lastName?.toLowerCase(),
    );
    if (byName) return byName.id;
  }

  return tees[0].id;
}

// --- Saved roster: the regulars, so they survive between rounds ------------

export function loadRoster(): Player[] {
  if (!canStore()) return [];
  const players = safeParse<Player[]>(window.localStorage.getItem(ROSTER_KEY), []);
  return Array.isArray(players) ? players.filter((p) => p && p.id && p.name) : [];
}

export function saveRoster(players: Player[]): void {
  if (!canStore()) return;
  const byId = new Map<string, Player>();
  for (const player of [...loadRoster(), ...players]) byId.set(player.id, player);
  window.localStorage.setItem(
    ROSTER_KEY,
    JSON.stringify([...byId.values()].slice(0, 60)),
  );
}

export function removeFromRoster(id: string): void {
  if (!canStore()) return;
  window.localStorage.setItem(
    ROSTER_KEY,
    JSON.stringify(loadRoster().filter((player) => player.id !== id)),
  );
}
