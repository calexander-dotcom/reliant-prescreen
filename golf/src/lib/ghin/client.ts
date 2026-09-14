import type { Course, Player } from "../types";
import {
  normalizeCourseDetail,
  normalizeCourseSummaries,
  normalizeGolfers,
  normalizeLoginToken,
  type CourseSummary,
} from "./normalize";

/**
 * Minimal client for the endpoints the GHIN mobile app uses.
 *
 * This is an UNOFFICIAL, undocumented API. It is reached only from the server
 * (a route handler), never the browser, for two reasons: GHIN sends no CORS
 * headers for browser origins, and a password should not be posted to a third
 * party from the user's page. Nothing is stored server-side — the login token
 * is handed straight back to the caller and replayed on later requests.
 */

const DEFAULT_BASE = "https://api2.ghin.com/api/v1";
const DEFAULT_SOURCE = "GHINcom";
const TIMEOUT_MS = 15_000;

export function ghinBase(): string {
  return (process.env.GHIN_API_BASE || DEFAULT_BASE).replace(/\/+$/, "");
}

function ghinSource(): string {
  return process.env.GHIN_SOURCE || DEFAULT_SOURCE;
}

export class GhinError extends Error {
  readonly status: number;
  readonly detail: string | null;

  constructor(message: string, status: number, detail: string | null = null) {
    super(message);
    this.name = "GhinError";
    this.status = status;
    this.detail = detail;
  }
}

interface RequestOptions {
  token?: string | null;
  method?: "GET" | "POST";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

/**
 * A 401 is GHIN turning down the credentials. A 403 usually is not — it is
 * something between you and GHIN refusing the connection (an egress allowlist,
 * a corporate proxy, a WAF, a blocked region). Reporting that as a bad password
 * sends you chasing the wrong problem, so the two are kept separate and the
 * upstream text is passed through either way.
 */
function describeStatus(status: number): string {
  if (status === 401) return "GHIN rejected the credentials or the session expired.";
  if (status === 403) {
    return "The request to GHIN was blocked (403). That is usually a network or firewall restriction rather than a wrong password — see the detail below.";
  }
  if (status === 404) return "That GHIN endpoint does not exist (404).";
  if (status === 429) return "GHIN is rate limiting this account. Wait a bit and retry.";
  if (status >= 500) return `GHIN is having trouble (${status}). Try again shortly.`;
  return `GHIN returned ${status}.`;
}

export async function ghinRequest(
  path: string,
  options: RequestOptions = {},
): Promise<unknown> {
  const url = new URL(`${ghinBase()}/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("source", ghinSource());
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new GhinError(
      aborted
        ? "GHIN did not respond in time."
        : "Could not reach GHIN. Check the network and try again.",
      504,
      error instanceof Error ? error.message : null,
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();

  if (!response.ok) {
    throw new GhinError(describeStatus(response.status), response.status, text.slice(0, 500) || null);
  }

  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new GhinError("GHIN returned a response that was not JSON.", 502, text.slice(0, 500));
  }
}

/** Exchange a GHIN email (or GHIN number) and password for a session token. */
export async function ghinLogin(
  emailOrGhin: string,
  password: string,
): Promise<string> {
  const payload = await ghinRequest("golfer_login.json", {
    method: "POST",
    body: {
      user: { email_or_ghin: emailOrGhin, password, remember_me: false },
      // Some builds of the endpoint read these at the top level instead.
      email_or_ghin: emailOrGhin,
      password,
    },
  });

  const token = normalizeLoginToken(payload);
  if (!token) {
    throw new GhinError(
      "Signed in, but no session token was found in the GHIN response.",
      502,
    );
  }
  return token;
}

/**
 * The golfers saved in the GHIN app's favorites list.
 *
 * The favorites endpoint has moved around between app versions, so each known
 * path is tried in turn and the first one that yields golfers wins.
 */
export async function ghinFavorites(token: string): Promise<Player[]> {
  const paths = [
    "golfers/favorites.json",
    "golfer_favorites.json",
    "favorites.json",
    "golfers/favorite_golfers.json",
  ];

  let lastError: unknown = null;
  for (const path of paths) {
    try {
      const payload = await ghinRequest(path, { token });
      const players = normalizeGolfers(payload);
      if (players.length > 0) return players;
    } catch (error) {
      // A 404 just means this build does not have that path; keep looking.
      if (error instanceof GhinError && error.status === 404) continue;
      lastError = error;
    }
  }

  if (lastError instanceof GhinError) throw lastError;
  return [];
}

export async function ghinSearchCourses(
  token: string,
  query: string,
  state?: string,
): Promise<CourseSummary[]> {
  const payload = await ghinRequest("crsCourseMethods.asmx/SearchCourses.json", {
    token,
    query: { name: query, country: "USA", state },
  }).catch(async (error) => {
    if (error instanceof GhinError && (error.status === 404 || error.status === 400)) {
      return ghinRequest("courses/search.json", { token, query: { name: query, state } });
    }
    throw error;
  });

  return normalizeCourseSummaries(payload);
}

export async function ghinCourse(token: string, courseId: string): Promise<Course> {
  const payload = await ghinRequest("crsCourseMethods.asmx/GetCourseDetails.json", {
    token,
    query: { courseId, include_altered_tees: true },
  }).catch(async (error) => {
    if (error instanceof GhinError && (error.status === 404 || error.status === 400)) {
      return ghinRequest(`courses/${encodeURIComponent(courseId)}.json`, {
        token,
        query: { include_altered_tees: true },
      });
    }
    throw error;
  });

  const course = normalizeCourseDetail(payload);
  if (!course) {
    throw new GhinError("Could not read the course details from GHIN.", 502);
  }
  return course;
}

/** Favorite courses, when the account has any saved. */
export async function ghinFavoriteCourses(token: string): Promise<CourseSummary[]> {
  const paths = ["course_favorites.json", "courses/favorites.json"];
  for (const path of paths) {
    try {
      const payload = await ghinRequest(path, { token });
      const courses = normalizeCourseSummaries(payload);
      if (courses.length > 0) return courses;
    } catch (error) {
      if (error instanceof GhinError && error.status === 404) continue;
      throw error;
    }
  }
  return [];
}
