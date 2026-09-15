import { NextResponse } from "next/server";
import { ghinGolferCourses } from "@/lib/ghin/client";
import {
  bearerToken,
  handleRouteError,
  jsonError,
} from "@/lib/ghin/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET ?golferId=1234567 -> { courses, probes }
 *
 * This golfer's pinned courses merged with the ones they have posted scores at
 * recently — the shortlist you actually pick from on a first tee.
 */
export async function GET(request: Request) {
  const golferId = (new URL(request.url).searchParams.get("golferId") ?? "").trim();
  if (!golferId) return jsonError("A GHIN number is required.", 400);

  try {
    const { items, probes } = await ghinGolferCourses(golferId, bearerToken(request));
    return NextResponse.json({ courses: items, probes });
  } catch (error) {
    return handleRouteError(error);
  }
}
