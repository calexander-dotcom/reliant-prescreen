import { foursomeFromGg, type GgFoursome, type GgPairingGroup } from "./normalize";

/**
 * Server-side Golf Genius reader.
 *
 * The verified v2 API puts the account's key in the URL path and is read-only
 * for scores. This module must be imported only from server route handlers, so
 * the key — held in the GOLF_GENIUS_API_KEY environment variable — never
 * reaches the browser. The browser talks to our own /api/gg route, which calls
 * this. Do not import it into a client component.
 *
 * Two jobs: resolve a foursome GGID the owner typed to the event and round it
 * belongs to (the API has no direct GGID lookup, so we scan the rounds that
 * could plausibly be today's), and then fetch that one pairing group's players,
 * course and scores — the latter cheap enough to poll during a round.
 */

const BASE = "https://www.golfgenius.com/api_v2";

export class GgError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "GgError";
    this.status = status;
  }
}

/** The key from the environment, or null when the integration is not set up. */
export function ggApiKey(): string | null {
  const key = process.env.GOLF_GENIUS_API_KEY;
  return key && key.trim() ? key.trim() : null;
}

async function ggGet<T>(key: string, path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${key}/${path}`, { cache: "no-store" });
  } catch (error) {
    throw new GgError(
      `Could not reach Golf Genius: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new GgError("Golf Genius rejected the API key.", 502);
  }
  if (!res.ok) throw new GgError(`Golf Genius returned ${res.status}.`, 502);
  return (await res.json()) as T;
}

interface GgEvent {
  name?: string;
  id?: string;
  ggid?: string;
}
interface GgRound {
  id?: string;
  name?: string;
  date?: string;
  status?: string;
  most_recent?: boolean;
}

function unwrap<T>(rows: unknown, key: string): T[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) =>
    row && typeof row === "object" && key in (row as object)
      ? ((row as Record<string, unknown>)[key] as T)
      : (row as T),
  );
}

/** Rounds worth searching for a just-typed GGID: in progress, or dated near now. */
function candidateRounds(rounds: GgRound[], today: string): GgRound[] {
  return rounds.filter((r) => {
    if (r.status === "in progress" || r.most_recent) return true;
    if (!r.date) return false;
    // within a day either side, so an early or late start still resolves
    const diff = Math.abs(Date.parse(r.date) - Date.parse(today)) / 86_400_000;
    return Number.isFinite(diff) && diff <= 1.5;
  });
}

export interface FoursomeLocation {
  eventId: string;
  roundId: string;
  eventName: string;
  group: GgPairingGroup;
}

/**
 * Find the pairing group a foursome GGID belongs to. The API has no direct
 * lookup, so this scans the rounds that could plausibly be today's across every
 * event. Done in parallel — one event's rounds, then every candidate round's
 * tee sheet at once — because sequentially it took twenty seconds and this is
 * on the path of someone standing on the first tee. Called once when a round is
 * set up; after that the caller keeps the ids and polls `fetchFoursome`.
 */
export async function resolveFoursome(
  key: string,
  ggid: string,
  now: Date = new Date(),
): Promise<FoursomeLocation | null> {
  const target = ggid.trim().toLowerCase();
  if (!target) return null;
  const today = now.toISOString().slice(0, 10);
  const events = unwrap<GgEvent>(await ggGet(key, "events"), "event");

  // Each event's rounds, all at once.
  const perEvent = await Promise.all(
    events.map(async (event) => {
      if (!event.id) return { event, rounds: [] as GgRound[] };
      const rounds = unwrap<GgRound>(
        await ggGet(key, `events/${event.id}/rounds`),
        "round",
      );
      return { event, rounds: candidateRounds(rounds, today) };
    }),
  );

  // Flatten to the event/round pairs worth reading, keeping their scan order so
  // the first match found is stable, then read every tee sheet at once.
  const pairs: Array<{ event: GgEvent; round: GgRound }> = [];
  for (const { event, rounds } of perEvent) {
    for (const round of rounds) {
      if (event.id && round.id) pairs.push({ event, round });
    }
  }

  const matches = await Promise.all(
    pairs.map(async ({ event, round }) => {
      const sheet = unwrap<GgPairingGroup>(
        await ggGet(key, `events/${event.id}/rounds/${round.id}/tee_sheet`),
        "pairing_group",
      );
      const group = sheet.find((g) => (g.foursome_ggid ?? "").toLowerCase() === target);
      return group ? { event, round, group } : null;
    }),
  );

  const hit = matches.find((m): m is NonNullable<typeof m> => m !== null);
  if (!hit) return null;
  return {
    eventId: hit.event.id as string,
    roundId: hit.round.id as string,
    eventName: hit.event.name ?? "Golf Genius event",
    group: hit.group,
  };
}

/** Course names by id, so a foursome reads "Mid South Club", not an id. */
async function courseName(key: string, courseId: string | undefined): Promise<string | undefined> {
  if (!courseId) return undefined;
  try {
    const payload = (await ggGet(key, "courses")) as { courses?: Array<{ name?: string; id?: string }> };
    return payload.courses?.find((c) => String(c.id) === String(courseId))?.name;
  } catch {
    return undefined; // the tee name is a fine fallback
  }
}

/** Fetch one pairing group's foursome (players, course, scores) for a round. */
export async function fetchFoursome(
  key: string,
  eventId: string,
  roundId: string,
  ggid: string,
): Promise<GgFoursome | null> {
  const target = ggid.trim().toLowerCase();
  const sheet = unwrap<GgPairingGroup>(
    await ggGet(key, `events/${eventId}/rounds/${roundId}/tee_sheet`),
    "pairing_group",
  );
  const group = sheet.find((g) => (g.foursome_ggid ?? "").toLowerCase() === target);
  if (!group) return null;
  const tee = group.players?.[0]?.tee;
  const name = await courseName(key, tee?.course_id);
  return foursomeFromGg(group, name);
}
