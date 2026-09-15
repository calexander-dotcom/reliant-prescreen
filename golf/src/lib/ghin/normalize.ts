import type { Course, HoleInfo, Player, TeeSet } from "../types";

/**
 * GHIN has no published public API. This app talks to the same endpoints the
 * GHIN mobile app uses, and those responses have shifted casing and key names
 * over time (snake_case in the golfer endpoints, PascalCase in the course
 * rating payloads, sometimes nested under a wrapper key).
 *
 * So nothing here assumes one exact shape. Every field is looked up through a
 * list of plausible names and every value is defensively coerced, which keeps
 * an import working when one key gets renamed instead of failing outright.
 */

export interface CourseSummary {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  /** Facility name, when the payload carries one. */
  facility?: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** First present, non-empty value among the candidate keys (case-insensitive). */
function pick(source: unknown, keys: string[]): unknown {
  const record = asRecord(source);
  if (!record) return undefined;

  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== "") {
      return record[key];
    }
  }

  const lowered = new Map(
    Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]),
  );
  for (const key of keys) {
    const value = lowered.get(key.toLowerCase());
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function pickString(source: unknown, keys: string[]): string | null {
  const value = pick(source, keys);
  if (value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

function pickNumber(source: unknown, keys: string[]): number | null {
  const value = pick(source, keys);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[^\d.+-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Unwrap an array that may be bare or nested under any of `keys`. */
function collectArray(source: unknown, keys: string[]): unknown[] {
  if (Array.isArray(source)) return source;
  const value = pick(source, keys);
  if (Array.isArray(value)) return value;
  // Some endpoints double-wrap, e.g. { golfers: { golfer: [...] } }
  const record = asRecord(value);
  if (record) {
    for (const nested of Object.values(record)) {
      if (Array.isArray(nested)) return nested;
    }
  }
  return [];
}

/**
 * GHIN writes a plus handicap as "+1.2", which is numerically NEGATIVE 1.2 —
 * the player gives strokes back. Getting this wrong flips strokes for the best
 * player in the group, so it is handled explicitly.
 */
export function parseHandicapIndex(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const text = value.trim();
  if (text === "" || /^(nh|wd|n\/a|null)$/i.test(text)) return null;

  if (text.startsWith("+")) {
    const parsed = Number.parseFloat(text.slice(1));
    return Number.isFinite(parsed) ? -parsed : null;
  }

  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function fullName(raw: unknown): string | null {
  const direct = pickString(raw, ["player_name", "golfer_name", "name", "full_name"]);
  if (direct) return direct;

  const first = pickString(raw, ["first_name", "firstname", "FirstName"]);
  const last = pickString(raw, ["last_name", "lastname", "LastName"]);
  const joined = [first, last].filter(Boolean).join(" ").trim();
  return joined || null;
}

export function normalizeGolfer(raw: unknown): Player | null {
  const name = fullName(raw);
  const ghinNumber = pickString(raw, [
    "ghin",
    "ghin_number",
    "golfer_id",
    "GHINNumber",
    "id",
  ]);
  if (!name && !ghinNumber) return null;

  const indexValue = pick(raw, [
    // What the followed-golfers payload actually uses.
    "handicap_index_display",
    "handicap_index",
    "hi_value",
    "hi_display",
    "display",
    "index",
    "HandicapIndex",
    // Last resort: the low index, so a row still shows a number.
    "low_hi_display",
  ]);

  return {
    id: ghinNumber ? `ghin-${ghinNumber}` : `ghin-${slug(name ?? "golfer")}`,
    name: name ?? `GHIN ${ghinNumber}`,
    handicapIndex: parseHandicapIndex(indexValue),
    ghinNumber: ghinNumber ?? null,
    source: "ghin",
  };
}

export function normalizeGolfers(raw: unknown): Player[] {
  const items = collectArray(raw, [
    "golfers",
    "favorites",
    "favorite_golfers",
    "golfer_favorites",
    "players",
    "data",
  ]);

  const seen = new Set<string>();
  const players: Player[] = [];
  for (const item of items) {
    // Favorites are sometimes wrapped, e.g. { golfer: { ... } }
    const candidate = pick(item, ["golfer", "player"]) ?? item;
    const player = normalizeGolfer(candidate);
    if (!player || seen.has(player.id)) continue;
    seen.add(player.id);
    players.push(player);
  }
  return players;
}

export function normalizeCourseSummary(raw: unknown): CourseSummary | null {
  const id = pickString(raw, ["course_id", "CourseID", "CourseId", "id"]);
  const name = pickString(raw, ["course_name", "CourseName", "name", "full_name"]);
  if (!id || !name) return null;
  return {
    id,
    name,
    city: pickString(raw, ["CourseCity", "city", "City"]),
    state: pickString(raw, ["CourseState", "state", "State", "state_code"]),
    facility: pickString(raw, ["FacilityName", "facility_name"]),
  };
}

export function normalizeCourseSummaries(raw: unknown): CourseSummary[] {
  const items = collectArray(raw, [
    "courses",
    "Courses",
    // my_courses.json wraps its rows in this.
    "golfer_course_preference",
    "golfer_course_preferences",
    "data",
    "results",
  ]);
  const seen = new Set<string>();
  const out: CourseSummary[] = [];
  for (const item of items) {
    const summary = normalizeCourseSummary(pick(item, ["course", "Course"]) ?? item);
    if (!summary || seen.has(summary.id)) continue;
    seen.add(summary.id);
    out.push(summary);
  }
  return out;
}

function normalizeHoles(raw: unknown): HoleInfo[] {
  const items = collectArray(raw, ["Holes", "holes"]);
  const holes: HoleInfo[] = [];

  items.forEach((item, index) => {
    const number = pickNumber(item, ["Number", "number", "hole_number", "HoleNumber"]);
    const par = pickNumber(item, ["Par", "par"]);
    const allocation = pickNumber(item, [
      "Allocation",
      "allocation",
      "stroke_index",
      "StrokeIndex",
      "handicap",
      "hole_handicap",
    ]);
    holes.push({
      number: number ?? index + 1,
      par: par ?? 4,
      yardage: pickNumber(item, ["Length", "length", "yardage", "Yardage"]),
      // Fall back to hole order so stroke allocation still works.
      strokeIndex: allocation ?? number ?? index + 1,
    });
  });

  return holes.sort((a, b) => a.number - b.number);
}

/**
 * Course/slope live in a `Ratings` array keyed by rating type; the 18-hole
 * numbers are the "Total" entry. Some payloads put them on the tee directly.
 */
function teeRatings(raw: unknown): { courseRating: number; slopeRating: number } | null {
  const ratings = collectArray(pick(raw, ["Ratings", "ratings"]), []);
  const total =
    ratings.find((entry) => {
      const type = pickString(entry, ["RatingType", "rating_type", "type"]);
      return type !== null && /total/i.test(type);
    }) ?? ratings[0];

  const fromArray = {
    courseRating: pickNumber(total, ["CourseRating", "course_rating", "rating"]),
    slopeRating: pickNumber(total, ["SlopeRating", "slope_rating", "slope"]),
  };
  if (fromArray.courseRating !== null && fromArray.slopeRating !== null) {
    return { courseRating: fromArray.courseRating, slopeRating: fromArray.slopeRating };
  }

  const courseRating = pickNumber(raw, ["CourseRating", "course_rating", "rating"]);
  const slopeRating = pickNumber(raw, ["SlopeRating", "slope_rating", "slope"]);
  if (courseRating === null || slopeRating === null) return null;
  return { courseRating, slopeRating };
}

export function normalizeTee(raw: unknown, index: number): TeeSet | null {
  const name = pickString(raw, [
    "TeeSetRatingName",
    "tee_set_rating_name",
    "TeeName",
    "tee_name",
    "name",
  ]);
  const ratings = teeRatings(raw);
  const holes = normalizeHoles(raw);

  // Without a rating there is no course handicap to compute, but the hole data
  // is still worth keeping, so fall back to neutral scratch values.
  const courseRating = ratings?.courseRating ?? null;
  const slopeRating = ratings?.slopeRating ?? null;

  const parFromHoles = holes.reduce((sum, hole) => sum + hole.par, 0);
  const par =
    pickNumber(raw, ["TotalPar", "total_par", "par", "Par"]) ??
    (parFromHoles > 0 ? parFromHoles : 72);

  const id =
    pickString(raw, [
      "TeeSetRatingId",
      "tee_set_rating_id",
      "TeeSetId",
      "tee_set_id",
      "id",
    ]) ?? `tee-${index}`;

  if (!name && holes.length === 0 && courseRating === null) return null;

  return {
    id,
    name: name ?? `Tee ${index + 1}`,
    gender: pickString(raw, ["Gender", "gender"]),
    courseRating: courseRating ?? par,
    slopeRating: slopeRating ?? 113,
    par,
    yardage: pickNumber(raw, ["TotalYardage", "total_yardage", "yardage", "Yardage"]),
    holes,
  };
}

export function normalizeCourseDetail(raw: unknown): Course | null {
  const root = pick(raw, ["CourseDetails", "course_details", "course", "Course"]) ?? raw;

  const id = pickString(root, ["CourseID", "CourseId", "course_id", "id"]);
  const name = pickString(root, ["CourseName", "course_name", "name", "FullName"]);
  if (!name) return null;

  const teeItems = collectArray(root, ["TeeSets", "tee_sets", "tees", "Tees"]);
  const tees = teeItems
    .map((item, index) => normalizeTee(item, index))
    .filter((tee): tee is TeeSet => tee !== null);

  return {
    id: id ?? `course-${slug(name)}`,
    name,
    city: pickString(root, ["CourseCity", "City", "city"]),
    state: pickString(root, ["CourseState", "State", "state"]),
    tees,
    source: "ghin",
  };
}

/** Token from a golfer login response, wherever it happens to sit. */
export function normalizeLoginToken(raw: unknown): string | null {
  const direct = pickString(raw, ["golfer_user_token", "token", "jwt", "access_token"]);
  if (direct) return direct;

  for (const key of ["golfer_user", "golfer", "user", "data"]) {
    const nested = pick(raw, [key]);
    if (nested) {
      const token = normalizeLoginToken(nested);
      if (token) return token;
    }
  }
  return null;
}

/**
 * The signed-in golfer's own GHIN number, from a login response.
 *
 * The endpoints that list who you follow take that number as a path segment,
 * so finding it here saves asking for something the account already knows.
 * The login response shape is not captured anywhere, so this searches the
 * plausible places rather than assuming one.
 */
export function normalizeLoginGolferId(raw: unknown): string | null {
  const direct = pickString(raw, [
    "golfer_id",
    "ghin",
    "ghin_number",
    "GHINNumber",
    "id",
  ]);
  if (direct && /^\d{4,12}$/.test(direct)) return direct;

  for (const key of ["golfer_user", "golfer", "user", "data", "golfers"]) {
    const nested = pick(raw, [key]);
    if (Array.isArray(nested)) {
      for (const item of nested) {
        const found = normalizeLoginGolferId(item);
        if (found) return found;
      }
      continue;
    }
    if (nested) {
      const found = normalizeLoginGolferId(nested);
      if (found) return found;
    }
  }
  return null;
}

/**
 * The signed-in golfer themselves, from a login response.
 *
 * The following list is by definition other people, so without this the
 * account holder is the one player who has to be typed in by hand every round.
 *
 * Only accepted with a real name attached: `normalizeGolfer` will happily build
 * a player called "GHIN 5694340" from an id alone, which is worse than
 * offering nothing.
 */
export function normalizeLoginGolfer(raw: unknown): Player | null {
  const candidates = [raw];
  for (const key of ["golfer_user", "golfer", "user", "data"]) {
    const nested = pick(raw, [key]);
    if (nested) candidates.push(nested);
  }

  for (const candidate of candidates) {
    if (!fullName(candidate)) continue;
    const player = normalizeGolfer(candidate);
    if (player) return player;
  }

  // One level deeper, for a payload that wraps the golfer twice.
  for (const key of ["golfer_user", "golfer", "user", "data"]) {
    const nested = pick(raw, [key]);
    if (!nested || nested === raw) continue;
    const found = normalizeLoginGolfer(nested);
    if (found) return found;
  }

  return null;
}

export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
