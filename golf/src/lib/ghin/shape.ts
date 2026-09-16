/**
 * Structural summary of an unknown JSON payload — KEYS ONLY, never values.
 *
 * When a GHIN import comes back empty the question is always "what shape did
 * it actually return", and the answer has to be safe to paste into a chat or a
 * bug report. Key names are enough to fix a field mapping; the values are
 * somebody's name, GHIN number and handicap, so they never appear here.
 */
/**
 * Deep enough to reach the leaf object in a payload like
 * `{data: {items: [{...}]}}`, where the leaf key names are the whole answer.
 * The limit only exists to stop pathological nesting.
 */
const MAX_DEPTH = 6;

export function describeShape(value: unknown, depth = 0): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";

  if (Array.isArray(value)) {
    if (value.length === 0) return "array(0)";
    const inner = depth >= MAX_DEPTH ? "…" : describeShape(value[0], depth + 1);
    return `array(${value.length}) of ${inner}`;
  }

  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 0) return "{}";
    if (depth >= MAX_DEPTH) return `{${keys.length} keys}`;

    const parts = keys.slice(0, 40).map((key) => {
      const child = (value as Record<string, unknown>)[key];
      // Only recurse into containers; scalars would just be noise.
      if (Array.isArray(child) || (child !== null && typeof child === "object")) {
        return `${key}: ${describeShape(child, depth + 1)}`;
      }
      return key;
    });
    if (keys.length > 40) parts.push(`…+${keys.length - 40} more`);
    return `{${parts.join(", ")}}`;
  }

  return typeof value;
}

/** One attempted endpoint and what came back, safe to share. */
export interface GhinProbe {
  path: string;
  status: number;
  ok: boolean;
  /** Key-only shape of a successful response. */
  shape?: string;
  /** How many usable records were parsed out of it. */
  parsed?: number;
  /** Error text for a failed call. */
  error?: string;
}

/**
 * What a set of failed probes means, since the fixes differ completely.
 *
 * All 404 is a wrong path. A 401 is a session that has run out and needs
 * signing in again — not something the user can fix by retrying. A 403 is
 * something between the app and GHIN refusing the connection.
 */
export type ProbeVerdict =
  | "some-answered"
  | "expired"
  | "forbidden"
  | "not-found"
  | "unreachable"
  | "mixed";

export function probeVerdict(probes: GhinProbe[]): ProbeVerdict {
  if (probes.length === 0) return "mixed";
  const statuses = probes.map((probe) => probe.status);
  // A 401 from the endpoint that matters is not outweighed by a fallback
  // that answered 200 with nothing in it: the session has run out, and only
  // signing in again fixes that. Records actually parsed are another matter.
  if (
    statuses.some((status) => status === 401) &&
    !probes.some((probe) => probe.ok && (probe.parsed ?? 0) > 0)
  ) {
    return "expired";
  }
  if (probes.some((probe) => probe.ok)) return "some-answered";

  if (statuses.some((status) => status === 401)) return "expired";
  if (statuses.some((status) => status === 403)) return "forbidden";
  if (statuses.every((status) => status === 404)) return "not-found";
  if (statuses.every((status) => status === 0 || status === 504)) return "unreachable";
  return "mixed";
}

export function formatProbes(probes: GhinProbe[]): string {
  if (probes.length === 0) return "No endpoints were tried.";
  return probes
    .map((probe) => {
      const head = `${probe.ok ? "OK " : "ERR"} ${probe.status || "---"}  ${probe.path}`;
      if (probe.ok) {
        return `${head}\n    parsed ${probe.parsed ?? 0} records from ${probe.shape ?? "?"}`;
      }
      return `${head}\n    ${probe.error ?? ""}`;
    })
    .join("\n");
}
