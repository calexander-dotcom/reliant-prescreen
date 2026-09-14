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
    bets: Array.isArray(round.bets) ? round.bets : [],
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
