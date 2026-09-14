import { NextResponse } from "next/server";
import { ghinRequest } from "@/lib/ghin/client";
import {
  bearerToken,
  handleRouteError,
  jsonError,
  unauthorized,
} from "@/lib/ghin/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnostic passthrough: GET ?path=golfers/favorites.json -> the raw JSON.
 *
 * GHIN is undocumented, so when an import comes back empty this is how you see
 * what the endpoint actually returned and fix the field mapping in
 * `src/lib/ghin/normalize.ts`.
 *
 * Off unless GHIN_ALLOW_RAW=1, so a deployed instance is not left sitting
 * there as an open proxy into GHIN.
 */
export async function GET(request: Request) {
  if (process.env.GHIN_ALLOW_RAW !== "1") {
    return jsonError("Set GHIN_ALLOW_RAW=1 to enable the raw passthrough.", 404);
  }

  const token = bearerToken(request);
  if (!token) return unauthorized();

  const url = new URL(request.url);
  const path = (url.searchParams.get("path") ?? "").trim();
  if (!path) return jsonError("A ?path= is required.", 400);
  // Keep this pinned to the GHIN base: no absolute URLs, no climbing out.
  if (/^[a-z]+:\/\//i.test(path) || path.includes("..")) {
    return jsonError("Path must be relative to the GHIN API base.", 400);
  }

  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (key !== "path") query[key] = value;
  }

  try {
    const payload = await ghinRequest(path, { token, query });
    return NextResponse.json({ path, payload });
  } catch (error) {
    return handleRouteError(error);
  }
}
