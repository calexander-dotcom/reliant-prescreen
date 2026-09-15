import type { Course, Player } from "../types";
import {
  normalizeCourseDetail,
  normalizeCourseSummaries,
  normalizeGolfers,
  normalizeLoginGolferId,
  normalizeLoginToken,
  type CourseSummary,
} from "./normalize";
import { describeShape, type GhinProbe } from "./shape";

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
const DEFAULT_CLIENT_TOKEN = "nonblank";
const TIMEOUT_MS = 15_000;

export function ghinBase(): string {
  return (process.env.GHIN_API_BASE || DEFAULT_BASE).replace(/\/+$/, "");
}

function ghinSource(): string {
  return process.env.GHIN_SOURCE || DEFAULT_SOURCE;
}

/**
 * The login endpoint requires a non-empty `token` field in the body, separate
 * from the session token it hands back. Sending the request without it returns
 *
 *     400  {"errors":{"token":["can't be blank"]}}
 *
 * which is a presence check, not a value check — the literal "nonblank" is what
 * public clients for this API send and it satisfies the validation. Overridable
 * via GHIN_CLIENT_TOKEN in case GHIN ever starts checking the value, so that
 * would be a config change rather than a patch.
 */
function ghinClientToken(): string {
  return process.env.GHIN_CLIENT_TOKEN || DEFAULT_CLIENT_TOKEN;
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
  if (status === 400) {
    return "GHIN rejected the shape of the request (400). Its own validation message is in the detail below.";
  }
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

export interface GhinSession {
  token: string;
  /** The signed-in golfer's own GHIN number, when the response carries it. */
  golferId: string | null;
  /**
   * Key-only shape of the login response.
   *
   * The login payload has never been captured, so when the golfer id is not
   * found this is what says where to look — without putting the account's own
   * details into a diagnostic.
   */
  shape: string;
}

/** Exchange a GHIN email (or GHIN number) and password for a session token. */
export async function ghinLogin(
  emailOrGhin: string,
  password: string,
): Promise<GhinSession> {
  const payload = await ghinRequest("golfer_login.json", {
    method: "POST",
    body: {
      token: ghinClientToken(),
      // The nested shape is confirmed: a request missing only the client token
      // came back complaining about `token` alone, so email and password were
      // read correctly from here.
      user: {
        email_or_ghin: emailOrGhin,
        password,
        remember_me: "true",
      },
    },
  });

  const token = normalizeLoginToken(payload);
  if (!token) {
    throw new GhinError(
      "Signed in, but no session token was found in the GHIN response.",
      502,
    );
  }

  return {
    token,
    golferId: normalizeLoginGolferId(payload),
    shape: describeShape(payload),
  };
}

type Candidate = {
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
};

export interface ProbeResult<T> {
  items: T[];
  /** Every endpoint tried and what it returned. Safe to share: keys, no values. */
  probes: GhinProbe[];
}

/**
 * Try each candidate endpoint until one yields records, recording what every
 * attempt returned.
 *
 * The recording is the point. These paths are guesses at an undocumented API,
 * and an import that just comes back empty gives nobody anything to work with
 * — not the user, and not whoever has to fix the mapping. A 404 on every path
 * is a different problem from a 200 whose keys were not the ones expected, or
 * from a 401 saying the call needed a session it was not given, and the probe
 * log distinguishes them without needing a debugger or a raw dump.
 */
async function probeCandidates<T>(
  token: string | null,
  candidates: Candidate[],
  parse: (payload: unknown) => T[],
): Promise<ProbeResult<T>> {
  const probes: GhinProbe[] = [];

  for (const candidate of candidates) {
    try {
      const payload = await ghinRequest(candidate.path, {
        token,
        query: candidate.query,
      });
      const items = parse(payload);
      probes.push({
        path: candidate.path,
        status: 200,
        ok: true,
        shape: describeShape(payload),
        parsed: items.length,
      });
      if (items.length > 0) return { items, probes };
    } catch (error) {
      const ghin = error instanceof GhinError ? error : null;
      probes.push({
        path: candidate.path,
        status: ghin?.status ?? 0,
        ok: false,
        error: [ghin?.message ?? "Request failed.", ghin?.detail]
          .filter(Boolean)
          .join(" — "),
      });
    }
  }

  return { items: [], probes };
}

/**
 * A GHIN number, validated before it goes into a URL path.
 *
 * These endpoints take the golfer id as a path segment rather than a query
 * parameter, so anything that is not plainly a number is rejected here instead
 * of being interpolated into a request.
 */
export function normalizeGolferId(value: string): string | null {
  const digits = value.trim().replace(/[\s-]/g, "");
  return /^\d{4,12}$/.test(digits) ? digits : null;
}

/**
 * The golfers this account follows.
 *
 * Endpoint and response shape confirmed against a capture of GHIN's own site:
 *
 *     GET /followed_golfers/{golferId}.json?source=GHINcom
 *     -> { golfers: [{ id, first_name, last_name, handicap_index_display, … }] }
 *
 * It needs no Authorization header and no cookie — the golfer id in the path
 * is the whole request. That is GHIN's design, not a choice made here, and it
 * is why this app can skip asking for a password.
 */
export async function ghinFollowedGolfers(
  golferId: string,
  token?: string | null,
): Promise<ProbeResult<Player>> {
  const id = normalizeGolferId(golferId);
  if (!id) {
    return {
      items: [],
      probes: [
        {
          path: "followed_golfers/{golferId}.json",
          status: 0,
          ok: false,
          error: "That does not look like a GHIN number.",
        },
      ],
    };
  }

  return probeCandidates(
    token ?? null,
    [
      { path: `followed_golfers/${id}.json` },
      // Fallbacks, in case the path moves again.
      { path: `golfers/${id}/followed_golfers.json` },
      { path: "followed_golfers.json", query: { golfer_id: id } },
    ],
    normalizeGolfers,
  );
}

/**
 * Courses tied to this golfer: the ones they have pinned, plus the ones they
 * have posted scores at recently. Both lists are small and either can be
 * empty, so they are merged rather than tried in sequence.
 *
 *     GET /golfers/{id}/my_courses.json
 *     -> { golfer_course_preference: [{ course_id, course_name, … }] }
 *     GET /golfers/{id}/golfer_most_recent_courses.json
 *     -> { courses: [{ CourseId, CourseName, CourseCity, … }] }
 */
export async function ghinGolferCourses(
  golferId: string,
  token?: string | null,
): Promise<ProbeResult<CourseSummary>> {
  const id = normalizeGolferId(golferId);
  if (!id) {
    return {
      items: [],
      probes: [
        {
          path: "golfers/{golferId}/my_courses.json",
          status: 0,
          ok: false,
          error: "That does not look like a GHIN number.",
        },
      ],
    };
  }

  const [pinned, recent] = await Promise.all([
    probeCandidates(
      token ?? null,
      [{ path: `golfers/${id}/my_courses.json` }],
      normalizeCourseSummaries,
    ),
    probeCandidates(
      token ?? null,
      [
        {
          path: `golfers/${id}/golfer_most_recent_courses.json`,
          query: { scores_to_use: 20, include_altered_tees: true },
        },
      ],
      normalizeCourseSummaries,
    ),
  ]);

  const byId = new Map<string, CourseSummary>();
  for (const course of [...pinned.items, ...recent.items]) {
    if (!byId.has(course.id)) byId.set(course.id, course);
  }

  return { items: [...byId.values()], probes: [...pinned.probes, ...recent.probes] };
}

/**
 * Look a golfer up by name or GHIN number.
 *
 * This is the fallback that does not depend on anyone having saved favorites:
 * a GHIN number gets you a name and a live handicap index, which is the whole
 * point of the integration. Parameter names for search have varied, so the
 * plausible shapes are tried in turn.
 */
export async function ghinSearchGolfers(
  token: string | null,
  query: string,
): Promise<ProbeResult<Player>> {
  const trimmed = query.trim();
  const isNumber = /^\d{5,}$/.test(trimmed);

  const candidates: Candidate[] = isNumber
    ? [
        { path: "golfers/search.json", query: { golfer_id: trimmed } },
        { path: "golfers/search.json", query: { ghin: trimmed } },
        {
          path: "golfers/search.json",
          query: { global_search: true, search: trimmed, page: 1, per_page: 25 },
        },
        { path: `golfers/${encodeURIComponent(trimmed)}.json` },
      ]
    : [
        {
          path: "golfers/search.json",
          query: {
            global_search: true,
            search: trimmed,
            page: 1,
            per_page: 25,
            status: "Active",
          },
        },
        {
          path: "golfers/search.json",
          query: { last_name: trimmed, status: "Active", page: 1, per_page: 25 },
        },
        { path: "golfers/search.json", query: { name: trimmed } },
      ];

  return probeCandidates(token, candidates, normalizeGolfers);
}

export async function ghinSearchCourses(
  token: string | null,
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

export async function ghinCourse(
  token: string | null,
  courseId: string,
): Promise<Course> {
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

